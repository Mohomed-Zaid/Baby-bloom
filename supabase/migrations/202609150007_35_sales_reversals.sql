-- Phase 6: append-only customer payment, sales invoice, and sales-return reversals.
create function public.reverse_customer_payment(p_payment_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare pay public.invoice_payments%rowtype;e public.customer_ledger_entries%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('customer_payments.reverse') then raise exception 'customer_payments.reverse permission required' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reversal reason is required';end if;
 select * into pay from public.invoice_payments where id=p_payment_id for update;
 if not found or pay.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(pay.branch_id) then raise exception 'Customer payment not found or branch denied' using errcode='42501';end if;
 if pay.status='reversed' then return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',true);end if;
 if pay.status<>'posted' then raise exception 'Only posted payments can be reversed';end if;
 select * into e from public.customer_ledger_entries where reference_type='invoice_payment' and reference_id=pay.id and reversal_of_id is null for update;
 if not found then raise exception 'Posted payment ledger entry is missing';end if;
 insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
 values(e.company_id,e.branch_id,e.customer_id,(now() at time zone 'Asia/Colombo')::date,'reversal','payment_reversal',pay.id,pay.payment_number||'-REV',e.credit_amount,e.debit_amount,p_reason,e.id,auth.uid());
 perform set_config('app.sales_payment_workflow','on',true);update public.invoice_payments set status='reversed',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=p_reason where id=pay.id returning * into pay;
 if pay.invoice_id is not null then perform set_config('app.sales_workflow','on',true);update public.sales_invoices set paid_amount=greatest(paid_amount-pay.amount,0),balance_amount=least(grand_total,balance_amount+pay.amount),payment_status=case when greatest(paid_amount-pay.amount,0)<=0 then 'unpaid'::public.sales_payment_status else 'partial'::public.sales_payment_status end where id=pay.invoice_id;end if;
 return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',false);
end$$;

create function public.reverse_sales_invoice(p_invoice_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.sales_invoices%rowtype;rev public.sales_invoices%rowtype;m public.stock_movements%rowtype;e public.customer_ledger_entries%rowtype;pe public.customer_ledger_entries%rowtype;pay public.invoice_payments%rowtype;state record;number text;closed_through date;movement_id uuid;
begin
 if auth.uid() is null or not public.user_has_permission('sales.reverse') then raise exception 'sales.reverse permission required' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reversal reason is required';end if;
 select * into original from public.sales_invoices where id=p_invoice_id for update;
 if not found or original.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(original.branch_id) then raise exception 'Invoice not found or branch denied' using errcode='42501';end if;
 if original.status='reversed' then select * into rev from public.sales_invoices where reversal_of_id=original.id;return jsonb_build_object('id',rev.id,'document_number',rev.invoice_number,'status',rev.status,'idempotent',true);end if;
 if original.status<>'posted' then raise exception 'Only posted invoices can be reversed';end if;
 if exists(select 1 from public.sales_returns r where r.invoice_id=original.id and r.status='posted') then raise exception 'Invoice has posted returns and cannot be reversed safely';end if;
 select nullif(setting_value->>'closed_through_date','')::date into closed_through from public.business_settings where company_id=original.company_id and setting_key='accounting_policy';
 if closed_through is not null and original.invoice_date<=closed_through and not public.current_user_is_admin() then raise exception 'Closed-period reversal requires an administrator' using errcode='42501';end if;
 -- Verify stock is available for reinstatement
 for m in select * from public.stock_movements where reference_type='sales_invoice' and reference_id=original.id order by id for update loop
  perform pg_advisory_xact_lock(hashtextextended(m.stock_location_id::text||m.product_variant_id::text,0));
 end loop;
 number:=public.next_document_number(original.company_id,original.branch_id,'invoice');
 insert into public.sales_invoices(company_id,branch_id,warehouse_id,stock_location_id,invoice_number,customer_id,invoice_date,due_date,invoice_type,status,subtotal,item_discount_total,bill_discount_type,bill_discount_value,bill_discount_amount,tax_total,grand_total,paid_amount,balance_amount,payment_status,notes,reversal_of_id,posted_at,posted_by,created_by)
 values(original.company_id,original.branch_id,original.warehouse_id,original.stock_location_id,number,original.customer_id,(now() at time zone 'Asia/Colombo')::date,(now() at time zone 'Asia/Colombo')::date,original.invoice_type,'posted',original.subtotal,original.item_discount_total,original.bill_discount_type,original.bill_discount_value,original.bill_discount_amount,original.tax_total,original.grand_total,0,0,'paid','Reversal of '||original.invoice_number||': '||p_reason,original.id,now(),auth.uid(),auth.uid()) returning * into rev;
 -- Insert reversal stock movements (sale_return_in reinstates stock)
 for m in select * from public.stock_movements where reference_type='sales_invoice' and reference_id=original.id order by id loop
  insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,source_movement_id,product_code,product_name,variant_name,sku,barcode,created_by)
  values(m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_id,m.product_variant_id,rev.invoice_date,'sale_return_in',m.quantity_out,0,m.unit_cost,m.total_cost,'sales_invoice',rev.id,rev.invoice_number,m.id,m.product_code,m.product_name,m.variant_name,m.sku,m.barcode,auth.uid()) returning id into movement_id;
  insert into public.inventory_cost_layers(company_id,branch_id,warehouse_id,stock_location_id,product_variant_id,source_movement_id,original_quantity,remaining_quantity,unit_cost,received_date)
  values(m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_variant_id,movement_id,m.quantity_out,m.quantity_out,m.unit_cost,rev.invoice_date);
 end loop;
 -- Reverse customer ledger invoice entry
 select * into e from public.customer_ledger_entries where reference_type='sales_invoice' and reference_id=original.id and entry_type='invoice' for update;
 if not found then raise exception 'Invoice customer-ledger entry is missing';end if;
 insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
 values(e.company_id,e.branch_id,e.customer_id,rev.invoice_date,'reversal','sales_invoice',rev.id,rev.invoice_number,e.credit_amount,e.debit_amount,p_reason,e.id,auth.uid());
 -- Reverse any posted payments
 for pay in select * from public.invoice_payments where invoice_id=original.id and status='posted' order by id for update loop
  select * into pe from public.customer_ledger_entries where reference_type='invoice_payment' and reference_id=pay.id and reversal_of_id is null for update;
  insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
  values(pe.company_id,pe.branch_id,pe.customer_id,rev.invoice_date,'reversal','payment_reversal',pay.id,pay.payment_number||'-REV',pe.credit_amount,pe.debit_amount,p_reason,pe.id,auth.uid());
  perform set_config('app.sales_payment_workflow','on',true);update public.invoice_payments set status='reversed',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=p_reason where id=pay.id;
 end loop;
 perform set_config('app.sales_workflow','on',true);update public.sales_invoices set status='reversed',reversed_at=now(),reversed_by=auth.uid() where id=original.id returning * into original;
 perform public.sales_audit(original,'REVERSE',p_reason,jsonb_build_object('reversal_id',rev.id));return jsonb_build_object('id',rev.id,'document_number',rev.invoice_number,'status',rev.status,'idempotent',false);
end$$;

create function public.reverse_sales_return(p_return_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.sales_returns%rowtype;rev public.sales_returns%rowtype;m public.stock_movements%rowtype;e public.customer_ledger_entries%rowtype;number text;
begin
 if auth.uid() is null or not public.user_has_permission('sales_returns.reverse') then raise exception 'sales_returns.reverse permission required' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reversal reason is required';end if;
 select * into original from public.sales_returns where id=p_return_id for update;
 if not found or original.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(original.branch_id) then raise exception 'Sales return not found or branch denied' using errcode='42501';end if;
 if original.status='reversed' then select * into rev from public.sales_returns where reversal_of_id=original.id;return jsonb_build_object('id',rev.id,'document_number',rev.return_number,'status',rev.status,'idempotent',true);end if;
 if original.status<>'posted' then raise exception 'Only posted returns can be reversed';end if;
 number:=public.next_document_number(original.company_id,original.branch_id,'sales_return');
 insert into public.sales_returns(company_id,branch_id,warehouse_id,stock_location_id,return_number,invoice_id,customer_id,return_date,status,subtotal,discount_total,tax_total,grand_total,settlement_type,refund_amount,balance_adjustment,reason,notes,reversal_of_id,posted_at,posted_by,created_by)
 values(original.company_id,original.branch_id,original.warehouse_id,original.stock_location_id,number,original.invoice_id,original.customer_id,(now() at time zone 'Asia/Colombo')::date,'posted',original.subtotal,original.discount_total,original.tax_total,original.grand_total,original.settlement_type,original.refund_amount,original.balance_adjustment,p_reason,'Reversal of '||original.return_number,original.id,now(),auth.uid(),auth.uid()) returning * into rev;
 for m in select * from public.stock_movements where reference_type='sales_return' and reference_id=original.id order by id for update loop
  perform pg_advisory_xact_lock(hashtextextended(m.stock_location_id::text||m.product_variant_id::text,0));
  insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,source_movement_id,product_code,product_name,variant_name,sku,barcode,created_by)
  values(m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_id,m.product_variant_id,rev.return_date,'sale_out',0,m.quantity_in,m.unit_cost,m.total_cost,'sales_return',rev.id,rev.return_number,m.id,m.product_code,m.product_name,m.variant_name,m.sku,m.barcode,auth.uid());
  update public.inventory_cost_layers set remaining_quantity=0 where source_movement_id=m.id;
 end loop;
 select * into e from public.customer_ledger_entries where reference_type='sales_return' and reference_id=original.id and entry_type='sales_return' for update;
 if not found then raise exception 'Sales-return customer-ledger entry is missing';end if;
 insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,reversal_of_id,created_by)
 values(e.company_id,e.branch_id,e.customer_id,rev.return_date,'reversal','sales_return',rev.id,rev.return_number,e.credit_amount,e.debit_amount,p_reason,e.id,auth.uid());
 if original.invoice_id is not null then perform set_config('app.sales_workflow','on',true);update public.sales_invoices set returned_amount=greatest(returned_amount-original.grand_total,0),balance_amount=least(grand_total-paid_amount,balance_amount+original.grand_total),payment_status=case when least(grand_total-paid_amount,balance_amount+original.grand_total)>0 then case when paid_amount>0 then 'partial'::public.sales_payment_status else 'unpaid'::public.sales_payment_status end else 'paid'::public.sales_payment_status end where id=original.invoice_id;end if;
 perform set_config('app.sales_return_workflow','on',true);update public.sales_returns set status='reversed' where id=original.id returning * into original;
 perform public.sales_return_audit(original,'REVERSE',p_reason,jsonb_build_object('reversal_id',rev.id));return jsonb_build_object('id',rev.id,'document_number',rev.return_number,'status',rev.status,'idempotent',false);
end$$;

revoke all on function public.reverse_customer_payment(uuid,text),public.reverse_sales_invoice(uuid,text),public.reverse_sales_return(uuid,text) from public,anon;
grant execute on function public.reverse_customer_payment(uuid,text),public.reverse_sales_invoice(uuid,text),public.reverse_sales_return(uuid,text) to authenticated;
