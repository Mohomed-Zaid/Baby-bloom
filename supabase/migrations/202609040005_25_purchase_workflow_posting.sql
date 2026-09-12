-- Phase 5: atomic purchase drafts, approval, payments, and posting.
create function public.purchase_audit(p public.purchases,p_action text,p_reason text default null,p_values jsonb default null) returns void
language plpgsql security definer set search_path='' as $$begin
 insert into public.audit_logs(company_id,branch_id,user_id,action,module,table_name,record_id,new_values,reason)
 values(p.company_id,p.branch_id,auth.uid(),p_action,'purchases','purchases',p.id,p_values,p_reason);
end$$;

create function public.recalculate_purchase(p_purchase_id uuid) returns public.purchases language plpgsql security definer set search_path='' as $$
declare d public.purchases%rowtype; line_base numeric(18,2); bill_amount numeric(18,2); extra numeric(18,2); result public.purchases%rowtype;
begin
 select * into d from public.purchases where id=p_purchase_id for update;
 if not found or d.status not in ('draft','submitted','approved') then raise exception 'Purchase cannot be recalculated';end if;
 select coalesce(sum(line_subtotal),0),coalesce(sum(discount_amount),0),coalesce(sum(tax_amount),0),coalesce(sum(line_total),0)
 into result.subtotal,result.item_discount_total,result.tax_total,line_base from public.purchase_items where purchase_id=d.id;
 if d.bill_discount_type='percentage' then
  if d.bill_discount_value>100 then raise exception 'Bill discount percentage cannot exceed 100';end if;
  bill_amount:=round(line_base*d.bill_discount_value/100,2);
 elsif d.bill_discount_type='fixed' then
  if d.bill_discount_value>line_base then raise exception 'Fixed bill discount cannot exceed item total';end if;
  bill_amount:=round(d.bill_discount_value,2);
 else bill_amount:=0;end if;
 extra:=d.shipping_cost+d.other_cost;
 perform set_config('app.purchase_workflow','on',true);
 update public.purchase_items i set
  allocated_bill_discount=case when line_base=0 then 0 else round(bill_amount*i.line_total/line_base,2) end,
  allocated_extra_cost=case when line_base=0 then round(extra/(select count(*) from public.purchase_items where purchase_id=d.id),2) else round(extra*i.line_total/line_base,2) end
 where i.purchase_id=d.id;
 update public.purchase_items set final_unit_cost=round((line_total-allocated_bill_discount+allocated_extra_cost)/(quantity+free_quantity),4) where purchase_id=d.id;
 update public.purchases set subtotal=result.subtotal,item_discount_total=result.item_discount_total,bill_discount_amount=bill_amount,tax_total=result.tax_total,
  grand_total=round(line_base-bill_amount+extra,2),balance_amount=greatest(round(line_base-bill_amount+extra,2)-paid_amount,0),
  payment_status=case when paid_amount<=0 then 'unpaid'::public.purchase_payment_status when paid_amount>=round(line_base-bill_amount+extra,2) then 'paid'::public.purchase_payment_status else 'partial'::public.purchase_payment_status end
 where id=d.id returning * into result;
 return result;
end$$;

create function public.create_purchase_draft(p_header jsonb,p_items jsonb,p_payments jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare company_uuid uuid:=public.current_user_company_id(); d public.purchases%rowtype; item jsonb; pay jsonb; number text; payment_number text; item_count integer:=0;
begin
 if auth.uid() is null or company_uuid is null or not public.user_has_permission('purchases.create') then raise exception 'purchases.create permission required' using errcode='42501';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one purchase item is required';end if;
 number:=public.next_document_number(company_uuid,(p_header->>'branch_id')::uuid,'purchase');
 insert into public.purchases(company_id,branch_id,warehouse_id,stock_location_id,purchase_number,vendor_invoice_number,vendor_id,purchase_date,due_date,purchase_type,bill_discount_type,bill_discount_value,shipping_cost,other_cost,notes,internal_reference,created_by)
 values(company_uuid,(p_header->>'branch_id')::uuid,(p_header->>'warehouse_id')::uuid,(p_header->>'stock_location_id')::uuid,number,nullif(btrim(p_header->>'vendor_invoice_number'),''),(p_header->>'vendor_id')::uuid,(p_header->>'purchase_date')::date,(p_header->>'due_date')::date,coalesce((p_header->>'purchase_type')::public.purchase_type,'credit'),coalesce((p_header->>'bill_discount_type')::public.purchase_discount_type,'none'),coalesce((p_header->>'bill_discount_value')::numeric,0),coalesce((p_header->>'shipping_cost')::numeric,0),coalesce((p_header->>'other_cost')::numeric,0),nullif(p_header->>'notes',''),nullif(p_header->>'internal_reference',''),auth.uid()) returning * into d;
 for item in select value from jsonb_array_elements(p_items) loop
  item_count:=item_count+1;
  insert into public.purchase_items(company_id,purchase_id,product_variant_id,unit_id,quantity,free_quantity,unit_cost,discount_type,discount_value,tax_rate,batch_reference,manufacture_date,expiry_date,warranty_days,remarks,created_by)
  values(company_uuid,d.id,(item->>'product_variant_id')::uuid,(item->>'unit_id')::uuid,(item->>'quantity')::numeric,coalesce((item->>'free_quantity')::numeric,0),(item->>'unit_cost')::numeric,coalesce((item->>'discount_type')::public.purchase_discount_type,'none'),coalesce((item->>'discount_value')::numeric,0),coalesce((item->>'tax_rate')::numeric,0),nullif(item->>'batch_reference',''),nullif(item->>'manufacture_date','')::date,nullif(item->>'expiry_date','')::date,nullif(item->>'warranty_days','')::integer,nullif(item->>'remarks',''),auth.uid());
 end loop;
 if jsonb_typeof(p_payments)='array' then for pay in select value from jsonb_array_elements(p_payments) loop
  if coalesce((pay->>'amount')::numeric,0)>0 then
   if not public.user_has_permission('supplier_payments.create') then raise exception 'supplier_payments.create permission required for immediate payment' using errcode='42501';end if;
   payment_number:=public.next_document_number(company_uuid,d.branch_id,'payment');
   insert into public.purchase_payments(company_id,branch_id,purchase_id,vendor_id,payment_number,payment_date,payment_method,amount,bank_account_id,cheque_id,reference_number,notes,created_by)
   values(company_uuid,d.branch_id,d.id,d.vendor_id,payment_number,d.purchase_date,(pay->>'payment_method')::public.supplier_payment_method,(pay->>'amount')::numeric,nullif(pay->>'bank_account_id','')::uuid,nullif(pay->>'cheque_id','')::uuid,nullif(pay->>'reference_number',''),nullif(pay->>'notes',''),auth.uid());
  end if;
 end loop;end if;
 d:=public.recalculate_purchase(d.id);
 perform public.purchase_audit(d,'CREATE',null,jsonb_build_object('items',item_count,'grand_total',d.grand_total));
 return jsonb_build_object('id',d.id,'document_number',d.purchase_number,'status',d.status,'grand_total',d.grand_total);
end$$;

create function public.submit_purchase(p_purchase_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.purchases%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('purchases.submit') then raise exception 'purchases.submit permission required' using errcode='42501';end if;
 select * into d from public.purchases where id=p_purchase_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Purchase not found or branch denied' using errcode='42501';end if;
 if d.status<>'draft' then raise exception 'Only draft purchases can be submitted';end if;
 if not exists(select 1 from public.purchase_items where purchase_id=d.id) then raise exception 'At least one purchase item is required';end if;
 d:=public.recalculate_purchase(d.id);perform set_config('app.purchase_workflow','on',true);
 update public.purchases set status='submitted',submitted_at=now(),submitted_by=auth.uid() where id=d.id returning * into d;
 perform public.purchase_audit(d,'SUBMIT');return jsonb_build_object('id',d.id,'document_number',d.purchase_number,'status',d.status);
end$$;

create function public.approve_purchase(p_purchase_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.purchases%rowtype; threshold numeric:=0;
begin
 if auth.uid() is null or not public.user_has_permission('purchases.approve') then raise exception 'purchases.approve permission required' using errcode='42501';end if;
 select * into d from public.purchases where id=p_purchase_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Purchase not found or branch denied' using errcode='42501';end if;
 if d.status<>'submitted' then raise exception 'Only submitted purchases can be approved';end if;
 d:=public.recalculate_purchase(d.id);
 select coalesce((select (setting_value->>'approval_threshold')::numeric from public.business_settings where company_id=d.company_id and setting_key='purchase_policy'),0) into threshold;
 if threshold>0 and d.grand_total>=threshold and not public.current_user_is_admin() then raise exception 'Purchases at or above % require an administrator',threshold using errcode='42501';end if;
 perform set_config('app.purchase_workflow','on',true);update public.purchases set status='approved',approved_at=now(),approved_by=auth.uid() where id=d.id returning * into d;
 perform public.purchase_audit(d,'APPROVE',null,jsonb_build_object('approval_threshold',threshold));return jsonb_build_object('id',d.id,'document_number',d.purchase_number,'status',d.status);
end$$;

create function public.cancel_purchase(p_purchase_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.purchases%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('purchases.cancel') then raise exception 'purchases.cancel permission required' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Cancellation reason is required';end if;
 select * into d from public.purchases where id=p_purchase_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Purchase not found or branch denied' using errcode='42501';end if;
 if d.status not in ('draft','submitted','approved') then raise exception 'Posted or final purchases cannot be cancelled';end if;
 perform set_config('app.purchase_workflow','on',true);update public.purchases set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=p_reason where id=d.id returning * into d;
 perform public.purchase_audit(d,'CANCEL',p_reason);return jsonb_build_object('id',d.id,'document_number',d.purchase_number,'status',d.status);
end$$;

create function public.post_purchase_payment_internal(p_payment_id uuid) returns public.purchase_payments language plpgsql security definer set search_path='' as $$
declare pay public.purchase_payments%rowtype;
begin
 select * into pay from public.purchase_payments where id=p_payment_id for update;
 if not found then raise exception 'Supplier payment not found';end if;
 if pay.status='posted' then return pay;end if;
 if pay.status<>'draft' then raise exception 'Only draft supplier payments can be posted';end if;
 if pay.payment_method='cheque' and pay.clearing_status<>'cleared' then raise exception 'Cheque payment remains pending until verified by the finance module';end if;
 insert into public.vendor_ledger_entries(company_id,branch_id,vendor_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
 values(pay.company_id,pay.branch_id,pay.vendor_id,pay.payment_date,case when pay.purchase_id is null then 'supplier_advance'::public.vendor_ledger_entry_type else 'payment'::public.vendor_ledger_entry_type end,'purchase_payment',pay.id,pay.payment_number,pay.amount,0,pay.notes,auth.uid());
 perform set_config('app.purchase_payment_workflow','on',true);update public.purchase_payments set status='posted',posted_at=now(),posted_by=auth.uid() where id=pay.id returning * into pay;return pay;
end$$;

create function public.post_purchase(p_purchase_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.purchases%rowtype;i public.purchase_items%rowtype;pay public.purchase_payments%rowtype;product_row public.products%rowtype;variant_row public.product_variants%rowtype;
 received numeric(18,4);payment_total numeric(18,2):=0;movement_id uuid;item_count integer:=0;business_date date:=(now() at time zone 'Asia/Colombo')::date;
begin
 if auth.uid() is null or not public.user_has_permission('purchases.post') then raise exception 'purchases.post permission required' using errcode='42501';end if;
 select * into d from public.purchases where id=p_purchase_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Purchase not found or branch denied' using errcode='42501';end if;
 if d.status='posted' then return jsonb_build_object('id',d.id,'document_number',d.purchase_number,'status',d.status,'idempotent',true);end if;
 if d.status<>'approved' then raise exception 'Only approved purchases can be posted';end if;
 if exists(select 1 from public.stock_movements where reference_type='purchase' and reference_id=d.id) or exists(select 1 from public.vendor_ledger_entries where reference_type='purchase' and reference_id=d.id) then raise exception 'Purchase already has posted effects';end if;
 if d.purchase_date<business_date and not public.user_has_permission('purchases.backdate') then raise exception 'Backdated posting requires purchases.backdate' using errcode='42501';end if;
 d:=public.recalculate_purchase(d.id);
 for i in select * from public.purchase_items where purchase_id=d.id order by id for update loop
  item_count:=item_count+1;received:=i.quantity+i.free_quantity;
  perform pg_advisory_xact_lock(hashtextextended(d.stock_location_id::text||i.product_variant_id::text,0));
  select v.* into variant_row from public.product_variants v where v.id=i.product_variant_id and v.company_id=d.company_id and v.is_active and v.deleted_at is null;
  select p.* into product_row from public.products p where p.id=variant_row.product_id and p.company_id=d.company_id and p.product_status='active' and p.deleted_at is null and p.track_stock;
  if variant_row.id is null or product_row.id is null then raise exception 'Invalid active stock product on purchase line';end if;
  insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,product_code,product_name,variant_name,sku,barcode,created_by)
  values(d.company_id,d.branch_id,d.warehouse_id,d.stock_location_id,product_row.id,variant_row.id,d.purchase_date,'purchase_in',received,0,i.final_unit_cost,round(received*i.final_unit_cost,2),'purchase',d.id,d.purchase_number,product_row.product_code,product_row.name,variant_row.variant_name,variant_row.sku,variant_row.barcode,auth.uid()) returning id into movement_id;
  insert into public.inventory_cost_layers(company_id,branch_id,warehouse_id,stock_location_id,product_variant_id,source_movement_id,original_quantity,remaining_quantity,unit_cost,received_date)
  values(d.company_id,d.branch_id,d.warehouse_id,d.stock_location_id,i.product_variant_id,movement_id,received,received,i.final_unit_cost,d.purchase_date);
 end loop;
 if item_count=0 then raise exception 'Purchase has no items';end if;
 insert into public.vendor_ledger_entries(company_id,branch_id,vendor_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,due_date,notes,created_by)
 values(d.company_id,d.branch_id,d.vendor_id,d.purchase_date,'purchase','purchase',d.id,d.purchase_number,0,d.grand_total,d.due_date,d.notes,auth.uid());
 for pay in select * from public.purchase_payments where purchase_id=d.id and status='draft' order by created_at,id for update loop
  if pay.payment_method<>'cheque' or pay.clearing_status='cleared' then pay:=public.post_purchase_payment_internal(pay.id);payment_total:=payment_total+pay.amount;end if;
 end loop;
 if payment_total>d.grand_total then raise exception 'Immediate payments cannot exceed purchase total';end if;
 if d.purchase_type='cash' and payment_total<>d.grand_total then raise exception 'Cash purchase requires full cleared immediate payment';end if;
 if d.purchase_type='mixed' and (payment_total<=0 or payment_total>=d.grand_total) then raise exception 'Mixed purchase requires a partial cleared immediate payment';end if;
 if d.purchase_type='credit' and payment_total>=d.grand_total and d.grand_total>0 then raise exception 'Use cash or mixed type when fully paid immediately';end if;
 perform set_config('app.purchase_workflow','on',true);update public.purchases set status='posted',posted_at=now(),posted_by=auth.uid(),paid_amount=payment_total,balance_amount=grand_total-payment_total,payment_status=case when payment_total=0 then 'unpaid'::public.purchase_payment_status when payment_total=grand_total then 'paid'::public.purchase_payment_status else 'partial'::public.purchase_payment_status end where id=d.id returning * into d;
 if d.purchase_date<business_date then perform public.purchase_audit(d,'BACKDATE',null,jsonb_build_object('purchase_date',d.purchase_date,'posted_date',business_date));end if;
 perform public.purchase_audit(d,'POST',null,jsonb_build_object('grand_total',d.grand_total,'paid_amount',d.paid_amount,'balance_amount',d.balance_amount));
 return jsonb_build_object('id',d.id,'document_number',d.purchase_number,'status',d.status,'grand_total',d.grand_total,'paid_amount',d.paid_amount,'balance_amount',d.balance_amount,'idempotent',false);
end$$;

create function public.create_supplier_payment(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare company_uuid uuid:=public.current_user_company_id();pay public.purchase_payments%rowtype;d public.purchases%rowtype;number text;
begin
 if auth.uid() is null or company_uuid is null or not public.user_has_permission('supplier_payments.create') then raise exception 'supplier_payments.create permission required' using errcode='42501';end if;
 if nullif(p_input->>'purchase_id','') is not null then select * into d from public.purchases where id=(p_input->>'purchase_id')::uuid and company_id=company_uuid;end if;
 number:=public.next_document_number(company_uuid,(p_input->>'branch_id')::uuid,'payment');
 insert into public.purchase_payments(company_id,branch_id,purchase_id,vendor_id,payment_number,payment_date,payment_method,amount,bank_account_id,cheque_id,reference_number,notes,created_by)
 values(company_uuid,(p_input->>'branch_id')::uuid,nullif(p_input->>'purchase_id','')::uuid,(p_input->>'vendor_id')::uuid,number,(p_input->>'payment_date')::date,(p_input->>'payment_method')::public.supplier_payment_method,(p_input->>'amount')::numeric,nullif(p_input->>'bank_account_id','')::uuid,nullif(p_input->>'cheque_id','')::uuid,nullif(p_input->>'reference_number',''),nullif(p_input->>'notes',''),auth.uid()) returning * into pay;
 return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'clearing_status',pay.clearing_status);
end$$;

create function public.post_supplier_payment(p_payment_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare pay public.purchase_payments%rowtype;d public.purchases%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('supplier_payments.post') then raise exception 'supplier_payments.post permission required' using errcode='42501';end if;
 select * into pay from public.purchase_payments where id=p_payment_id for update;
 if not found or pay.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(pay.branch_id) then raise exception 'Supplier payment not found or branch denied' using errcode='42501';end if;
 if pay.status='posted' then return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',true);end if;
 if pay.purchase_id is not null then
  select * into d from public.purchases where id=pay.purchase_id for update;
  if d.status<>'posted' then raise exception 'Later payment requires a posted purchase';end if;
  if pay.amount>d.balance_amount then raise exception 'Payment exceeds remaining purchase balance';end if;
 end if;
 pay:=public.post_purchase_payment_internal(pay.id);
 if pay.purchase_id is not null then
  perform set_config('app.purchase_workflow','on',true);update public.purchases set paid_amount=paid_amount+pay.amount,balance_amount=balance_amount-pay.amount,payment_status=case when balance_amount-pay.amount=0 then 'paid'::public.purchase_payment_status else 'partial'::public.purchase_payment_status end where id=pay.purchase_id;
 end if;
 return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',false);
end$$;

revoke all on function public.purchase_audit(public.purchases,text,text,jsonb),public.recalculate_purchase(uuid),public.post_purchase_payment_internal(uuid) from public,anon,authenticated;
revoke all on function public.create_purchase_draft(jsonb,jsonb,jsonb),public.submit_purchase(uuid),public.approve_purchase(uuid),public.cancel_purchase(uuid,text),public.post_purchase(uuid),public.create_supplier_payment(jsonb),public.post_supplier_payment(uuid) from public,anon;
grant execute on function public.create_purchase_draft(jsonb,jsonb,jsonb),public.submit_purchase(uuid),public.approve_purchase(uuid),public.cancel_purchase(uuid,text),public.post_purchase(uuid),public.create_supplier_payment(jsonb),public.post_supplier_payment(uuid) to authenticated;
