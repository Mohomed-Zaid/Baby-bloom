-- Phase 5: append-only supplier payment, purchase, and purchase-return reversals.
create function public.reverse_supplier_payment(p_payment_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare pay public.purchase_payments%rowtype;e public.vendor_ledger_entries%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('supplier_payments.reverse') then raise exception 'supplier_payments.reverse permission required' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reversal reason is required';end if;
 select * into pay from public.purchase_payments where id=p_payment_id for update;
 if not found or pay.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(pay.branch_id) then raise exception 'Supplier payment not found or branch denied' using errcode='42501';end if;
 if pay.status='reversed' then return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',true);end if;
 if pay.status<>'posted' then raise exception 'Only posted payments can be reversed';end if;
 select * into e from public.vendor_ledger_entries where reference_type='purchase_payment' and reference_id=pay.id and reversal_of_id is null for update;
 if not found then raise exception 'Posted payment ledger entry is missing';end if;
 insert into public.vendor_ledger_entries(company_id,branch_id,vendor_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
 values(e.company_id,e.branch_id,e.vendor_id,(now() at time zone 'Asia/Colombo')::date,'reversal','payment_reversal',pay.id,pay.payment_number||'-REV',e.credit_amount,e.debit_amount,p_reason,e.id,auth.uid());
 perform set_config('app.purchase_payment_workflow','on',true);update public.purchase_payments set status='reversed',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=p_reason where id=pay.id returning * into pay;
 if pay.purchase_id is not null then perform set_config('app.purchase_workflow','on',true);update public.purchases set paid_amount=greatest(paid_amount-pay.amount,0),balance_amount=least(grand_total,balance_amount+pay.amount),payment_status=case when greatest(paid_amount-pay.amount,0)=0 then 'unpaid'::public.purchase_payment_status else 'partial'::public.purchase_payment_status end where id=pay.purchase_id;end if;
 return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',false);
end$$;

create function public.reverse_purchase(p_purchase_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.purchases%rowtype;rev public.purchases%rowtype;m public.stock_movements%rowtype;e public.vendor_ledger_entries%rowtype;pe public.vendor_ledger_entries%rowtype;pay public.purchase_payments%rowtype;state record;number text;closed_through date;
begin
 if auth.uid() is null or not public.user_has_permission('purchases.reverse') then raise exception 'purchases.reverse permission required' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reversal reason is required';end if;
 select * into original from public.purchases where id=p_purchase_id for update;
 if not found or original.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(original.branch_id) then raise exception 'Purchase not found or branch denied' using errcode='42501';end if;
 if original.status='reversed' then select * into rev from public.purchases where reversal_of_id=original.id;return jsonb_build_object('id',rev.id,'document_number',rev.purchase_number,'status',rev.status,'idempotent',true);end if;
 if original.status<>'posted' then raise exception 'Only posted purchases can be reversed';end if;
 if exists(select 1 from public.purchase_returns r where r.purchase_id=original.id and r.status='posted') then raise exception 'Purchase has posted returns and cannot be reversed safely';end if;
 select nullif(setting_value->>'closed_through_date','')::date into closed_through from public.business_settings where company_id=original.company_id and setting_key='accounting_policy';
 if closed_through is not null and original.purchase_date<=closed_through and not public.current_user_is_admin() then raise exception 'Closed-period reversal requires an administrator' using errcode='42501';end if;
 for m in select * from public.stock_movements where reference_type='purchase' and reference_id=original.id order by id for update loop
  perform pg_advisory_xact_lock(hashtextextended(m.stock_location_id::text||m.product_variant_id::text,0));select * into state from public.inventory_stock_state(m.company_id,m.stock_location_id,m.product_variant_id);if state.available<m.quantity_in then raise exception 'Purchase stock has been consumed; reversal is unsafe';end if;
 end loop;
 number:=public.next_document_number(original.company_id,original.branch_id,'purchase');
 insert into public.purchases(company_id,branch_id,warehouse_id,stock_location_id,purchase_number,vendor_id,purchase_date,due_date,purchase_type,status,subtotal,item_discount_total,bill_discount_type,bill_discount_value,bill_discount_amount,tax_total,shipping_cost,other_cost,grand_total,paid_amount,balance_amount,payment_status,notes,reversal_of_id,posted_at,posted_by,created_by)
 values(original.company_id,original.branch_id,original.warehouse_id,original.stock_location_id,number,original.vendor_id,(now() at time zone 'Asia/Colombo')::date,(now() at time zone 'Asia/Colombo')::date,original.purchase_type,'posted',original.subtotal,original.item_discount_total,original.bill_discount_type,original.bill_discount_value,original.bill_discount_amount,original.tax_total,original.shipping_cost,original.other_cost,original.grand_total,0,0,'paid','Reversal of '||original.purchase_number||': '||p_reason,original.id,now(),auth.uid(),auth.uid()) returning * into rev;
 for m in select * from public.stock_movements where reference_type='purchase' and reference_id=original.id order by id loop
  insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,source_movement_id,product_code,product_name,variant_name,sku,barcode,created_by)
  values(m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_id,m.product_variant_id,rev.purchase_date,'reversal_out',0,m.quantity_in,m.unit_cost,m.total_cost,'purchase',rev.id,rev.purchase_number,m.id,m.product_code,m.product_name,m.variant_name,m.sku,m.barcode,auth.uid());
  update public.inventory_cost_layers set remaining_quantity=0 where source_movement_id=m.id;
 end loop;
 select * into e from public.vendor_ledger_entries where reference_type='purchase' and reference_id=original.id and entry_type='purchase' for update;
 if not found then raise exception 'Purchase supplier-ledger entry is missing';end if;
 insert into public.vendor_ledger_entries(company_id,branch_id,vendor_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
 values(e.company_id,e.branch_id,e.vendor_id,rev.purchase_date,'reversal','purchase',rev.id,rev.purchase_number,e.credit_amount,e.debit_amount,p_reason,e.id,auth.uid());
 for pay in select * from public.purchase_payments where purchase_id=original.id and status='posted' order by id for update loop
  select * into pe from public.vendor_ledger_entries where reference_type='purchase_payment' and reference_id=pay.id and reversal_of_id is null for update;
  insert into public.vendor_ledger_entries(company_id,branch_id,vendor_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
  values(pe.company_id,pe.branch_id,pe.vendor_id,rev.purchase_date,'reversal','payment_reversal',pay.id,pay.payment_number||'-REV',pe.credit_amount,pe.debit_amount,p_reason,pe.id,auth.uid());
  perform set_config('app.purchase_payment_workflow','on',true);update public.purchase_payments set status='reversed',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=p_reason where id=pay.id;
 end loop;
 perform set_config('app.purchase_workflow','on',true);update public.purchases set status='reversed' where id=original.id returning * into original;
 perform public.purchase_audit(original,'REVERSE',p_reason,jsonb_build_object('reversal_id',rev.id));return jsonb_build_object('id',rev.id,'document_number',rev.purchase_number,'status',rev.status,'idempotent',false);
end$$;

create function public.reverse_purchase_return(p_return_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.purchase_returns%rowtype;rev public.purchase_returns%rowtype;m public.stock_movements%rowtype;e public.vendor_ledger_entries%rowtype;number text;movement_id uuid;
begin
 if auth.uid() is null or not public.user_has_permission('purchase_returns.reverse') then raise exception 'purchase_returns.reverse permission required' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reversal reason is required';end if;
 select * into original from public.purchase_returns where id=p_return_id for update;
 if not found or original.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(original.branch_id) then raise exception 'Purchase return not found or branch denied' using errcode='42501';end if;
 if original.status='reversed' then select * into rev from public.purchase_returns where reversal_of_id=original.id;return jsonb_build_object('id',rev.id,'document_number',rev.return_number,'status',rev.status,'idempotent',true);end if;
 if original.status<>'posted' then raise exception 'Only posted returns can be reversed';end if;
 number:=public.next_document_number(original.company_id,original.branch_id,'purchase_return');
 insert into public.purchase_returns(company_id,branch_id,warehouse_id,stock_location_id,return_number,purchase_id,vendor_id,return_date,status,subtotal,discount_total,tax_total,grand_total,settlement_type,refund_amount,balance_adjustment,reason,notes,reversal_of_id,posted_at,posted_by,created_by)
 values(original.company_id,original.branch_id,original.warehouse_id,original.stock_location_id,number,original.purchase_id,original.vendor_id,(now() at time zone 'Asia/Colombo')::date,'posted',original.subtotal,original.discount_total,original.tax_total,original.grand_total,original.settlement_type,original.refund_amount,original.balance_adjustment,p_reason,'Reversal of '||original.return_number,original.id,now(),auth.uid(),auth.uid()) returning * into rev;
 for m in select * from public.stock_movements where reference_type='purchase_return' and reference_id=original.id order by id for update loop
  perform pg_advisory_xact_lock(hashtextextended(m.stock_location_id::text||m.product_variant_id::text,0));
  insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,source_movement_id,product_code,product_name,variant_name,sku,barcode,created_by)
  values(m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_id,m.product_variant_id,rev.return_date,'reversal_in',m.quantity_out,0,m.unit_cost,m.total_cost,'purchase_return',rev.id,rev.return_number,m.id,m.product_code,m.product_name,m.variant_name,m.sku,m.barcode,auth.uid()) returning id into movement_id;
  insert into public.inventory_cost_layers(company_id,branch_id,warehouse_id,stock_location_id,product_variant_id,source_movement_id,original_quantity,remaining_quantity,unit_cost,received_date)
  values(m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_variant_id,movement_id,m.quantity_out,m.quantity_out,m.unit_cost,rev.return_date);
 end loop;
 select * into e from public.vendor_ledger_entries where reference_type='purchase_return' and reference_id=original.id and entry_type='purchase_return' for update;
 if not found then raise exception 'Purchase-return supplier-ledger entry is missing';end if;
 insert into public.vendor_ledger_entries(company_id,branch_id,vendor_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
 values(e.company_id,e.branch_id,e.vendor_id,rev.return_date,'reversal','purchase_return',rev.id,rev.return_number,e.credit_amount,e.debit_amount,p_reason,e.id,auth.uid());
 if original.purchase_id is not null then perform set_config('app.purchase_workflow','on',true);update public.purchases set returned_amount=greatest(returned_amount-original.grand_total,0),balance_amount=least(grand_total-paid_amount,balance_amount+original.grand_total),payment_status=case when least(grand_total-paid_amount,balance_amount+original.grand_total)>0 then case when paid_amount>0 then 'partial'::public.purchase_payment_status else 'unpaid'::public.purchase_payment_status end else 'paid'::public.purchase_payment_status end where id=original.purchase_id;end if;
 perform set_config('app.purchase_return_workflow','on',true);update public.purchase_returns set status='reversed' where id=original.id returning * into original;
 perform public.purchase_return_audit(original,'REVERSE',p_reason,jsonb_build_object('reversal_id',rev.id));return jsonb_build_object('id',rev.id,'document_number',rev.return_number,'status',rev.status,'idempotent',false);
end$$;

revoke all on function public.reverse_supplier_payment(uuid,text),public.reverse_purchase(uuid,text),public.reverse_purchase_return(uuid,text) from public,anon;
grant execute on function public.reverse_supplier_payment(uuid,text),public.reverse_purchase(uuid,text),public.reverse_purchase_return(uuid,text) to authenticated;
