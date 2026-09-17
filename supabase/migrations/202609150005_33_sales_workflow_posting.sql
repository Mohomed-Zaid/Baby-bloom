-- Phase 6: atomic sales invoice drafts, hold/recall, posting, payments.
create function public.sales_audit(p public.sales_invoices,p_action text,p_reason text default null,p_values jsonb default null) returns void
language plpgsql security definer set search_path='' as $$begin
 insert into public.audit_logs(company_id,branch_id,user_id,action,module,table_name,record_id,new_values,reason)
 values(p.company_id,p.branch_id,auth.uid(),p_action,'sales','sales_invoices',p.id,p_values,p_reason);
end$$;

create function public.recalculate_sales_invoice(p_invoice_id uuid) returns public.sales_invoices language plpgsql security definer set search_path='' as $$
declare d public.sales_invoices%rowtype; line_base numeric(18,2); bill_amount numeric(18,2); result public.sales_invoices%rowtype;
begin
 select * into d from public.sales_invoices where id=p_invoice_id for update;
 if not found or d.status not in ('draft','held') then raise exception 'Invoice cannot be recalculated';end if;
 select coalesce(sum(line_subtotal),0),coalesce(sum(discount_amount),0),coalesce(sum(tax_amount),0),coalesce(sum(line_total),0)
 into result.subtotal,result.item_discount_total,result.tax_total,line_base from public.sales_invoice_items where invoice_id=d.id;
 if d.bill_discount_type='percentage' then
  if d.bill_discount_value>100 then raise exception 'Bill discount percentage cannot exceed 100';end if;
  bill_amount:=round(line_base*d.bill_discount_value/100,2);
 elsif d.bill_discount_type='fixed' then
  if d.bill_discount_value>line_base then raise exception 'Fixed bill discount cannot exceed item total';end if;
  bill_amount:=round(d.bill_discount_value,2);
 else bill_amount:=0;end if;
 perform set_config('app.sales_workflow','on',true);
 update public.sales_invoices set subtotal=result.subtotal,item_discount_total=result.item_discount_total,bill_discount_amount=bill_amount,
  tax_total=result.tax_total,grand_total=round(line_base-bill_amount,2),
  balance_amount=greatest(round(line_base-bill_amount,2)-paid_amount,0),
  payment_status=case when paid_amount<=0 then 'unpaid'::public.sales_payment_status when paid_amount>=round(line_base-bill_amount,2) then 'paid'::public.sales_payment_status else 'partial'::public.sales_payment_status end
 where id=d.id returning * into result;
 return result;
end$$;

create function public.create_sales_draft(p_header jsonb,p_items jsonb,p_payments jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare company_uuid uuid:=public.current_user_company_id(); d public.sales_invoices%rowtype; item jsonb; pay jsonb; number text; payment_number text; item_count integer:=0;
begin
 if auth.uid() is null or company_uuid is null or not public.user_has_permission('sales.create') then raise exception 'sales.create permission required' using errcode='42501';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one invoice item is required';end if;
 number:=public.next_document_number(company_uuid,(p_header->>'branch_id')::uuid,'invoice');
 insert into public.sales_invoices(company_id,branch_id,warehouse_id,stock_location_id,invoice_number,customer_id,invoice_date,due_date,invoice_type,bill_discount_type,bill_discount_value,notes,internal_reference,rep_id,cashier_id,created_by)
 values(company_uuid,(p_header->>'branch_id')::uuid,(p_header->>'warehouse_id')::uuid,(p_header->>'stock_location_id')::uuid,number,(p_header->>'customer_id')::uuid,(p_header->>'invoice_date')::date,(p_header->>'due_date')::date,coalesce((p_header->>'invoice_type')::public.sales_invoice_type,'cash'),coalesce((p_header->>'bill_discount_type')::public.sales_discount_type,'none'),coalesce((p_header->>'bill_discount_value')::numeric,0),nullif(p_header->>'notes',''),nullif(p_header->>'internal_reference',''),nullif(p_header->>'rep_id','')::uuid,nullif(p_header->>'cashier_id','')::uuid,auth.uid()) returning * into d;
 for item in select value from jsonb_array_elements(p_items) loop
  item_count:=item_count+1;
  insert into public.sales_invoice_items(company_id,invoice_id,product_variant_id,quantity,unit_price,discount_type,discount_value,tax_rate,batch_reference,warranty_period,remarks,created_by)
  values(company_uuid,d.id,(item->>'product_variant_id')::uuid,(item->>'quantity')::numeric,(item->>'unit_price')::numeric,coalesce((item->>'discount_type')::public.sales_discount_type,'none'),coalesce((item->>'discount_value')::numeric,0),coalesce((item->>'tax_rate')::numeric,0),nullif(item->>'batch_reference',''),nullif(item->>'warranty_period','')::integer,nullif(item->>'remarks',''),auth.uid());
 end loop;
 if jsonb_typeof(p_payments)='array' then for pay in select value from jsonb_array_elements(p_payments) loop
  if coalesce((pay->>'amount')::numeric,0)>0 then
   if not public.user_has_permission('customer_payments.create') then raise exception 'customer_payments.create permission required' using errcode='42501';end if;
   payment_number:=public.next_document_number(company_uuid,d.branch_id,'receipt');
   insert into public.invoice_payments(company_id,branch_id,invoice_id,customer_id,payment_number,payment_date,payment_method,amount,bank_account_id,card_reference,cheque_number,cheque_date,notes,created_by)
   values(company_uuid,d.branch_id,d.id,d.customer_id,payment_number,d.invoice_date,(pay->>'payment_method')::public.customer_payment_method,(pay->>'amount')::numeric,nullif(pay->>'bank_account_id','')::uuid,nullif(pay->>'card_reference',''),nullif(pay->>'cheque_number',''),nullif(pay->>'cheque_date','')::date,nullif(pay->>'notes',''),auth.uid());
  end if;
 end loop;end if;
 d:=public.recalculate_sales_invoice(d.id);
 perform public.sales_audit(d,'CREATE',null,jsonb_build_object('items',item_count,'grand_total',d.grand_total));
 return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status,'grand_total',d.grand_total);
end$$;

create function public.hold_sales_invoice(p_invoice_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.sales_invoices%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('sales.create') then raise exception 'sales.create permission required' using errcode='42501';end if;
 select * into d from public.sales_invoices where id=p_invoice_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Invoice not found or branch denied' using errcode='42501';end if;
 if d.status<>'draft' then raise exception 'Only draft invoices can be held';end if;
 if not exists(select 1 from public.sales_invoice_items where invoice_id=d.id) then raise exception 'At least one invoice item is required to hold';end if;
 d:=public.recalculate_sales_invoice(d.id);perform set_config('app.sales_workflow','on',true);
 update public.sales_invoices set status='held',held_at=now(),held_by=auth.uid() where id=d.id returning * into d;
 perform public.sales_audit(d,'HOLD');return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status);
end$$;

create function public.recall_sales_invoice(p_invoice_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.sales_invoices%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('sales.create') then raise exception 'sales.create permission required' using errcode='42501';end if;
 select * into d from public.sales_invoices where id=p_invoice_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Invoice not found or branch denied' using errcode='42501';end if;
 if d.status<>'held' then raise exception 'Only held invoices can be recalled';end if;
 perform set_config('app.sales_workflow','on',true);
 update public.sales_invoices set status='draft',held_at=null,held_by=null where id=d.id returning * into d;
 perform public.sales_audit(d,'RECALL');return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status);
end$$;

create function public.cancel_sales_invoice(p_invoice_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.sales_invoices%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('sales.cancel') then raise exception 'sales.cancel permission required' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Cancellation reason is required';end if;
 select * into d from public.sales_invoices where id=p_invoice_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Invoice not found or branch denied' using errcode='42501';end if;
 if d.status not in ('draft','held') then raise exception 'Posted, cancelled or reversed invoices cannot be cancelled';end if;
 perform set_config('app.sales_workflow','on',true);update public.sales_invoices set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=p_reason where id=d.id returning * into d;
 perform public.sales_audit(d,'CANCEL',p_reason);return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status);
end$$;

create function public.post_invoice_payment_internal(p_payment_id uuid) returns public.invoice_payments language plpgsql security definer set search_path='' as $$
declare pay public.invoice_payments%rowtype;
begin
 select * into pay from public.invoice_payments where id=p_payment_id for update;
 if not found then raise exception 'Invoice payment not found';end if;
 if pay.status='posted' then return pay;end if;
 if pay.status<>'draft' then raise exception 'Only draft invoice payments can be posted';end if;
 if pay.payment_method='cheque' and pay.clearing_status<>'cleared' then raise exception 'Cheque payment remains pending until verified by the finance module';end if;
 insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
 values(pay.company_id,pay.branch_id,pay.customer_id,pay.payment_date,case when pay.invoice_id is null then 'payment'::public.customer_ledger_entry_type else 'payment'::public.customer_ledger_entry_type end,'invoice_payment',pay.id,pay.payment_number,0,pay.amount,pay.notes,auth.uid());
 perform set_config('app.sales_payment_workflow','on',true);update public.invoice_payments set status='posted',posted_at=now(),posted_by=auth.uid() where id=pay.id returning * into pay;return pay;
end$$;

create function public.post_sales_invoice(p_invoice_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.sales_invoices%rowtype;i public.sales_invoice_items%rowtype;pay public.invoice_payments%rowtype;
 product_row public.products%rowtype;variant_row public.product_variants%rowtype;
 state record;payment_total numeric(18,2):=0;item_count integer:=0;business_date date:=(now() at time zone 'Asia/Colombo')::date;
 allow_company_negative boolean:=false;product_negative boolean;avg_cost numeric(18,4);
begin
 if auth.uid() is null or not public.user_has_permission('sales.post') then raise exception 'sales.post permission required' using errcode='42501';end if;
 select * into d from public.sales_invoices where id=p_invoice_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Invoice not found or branch denied' using errcode='42501';end if;
 if d.status='posted' then return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status,'idempotent',true);end if;
 if d.status not in ('draft','held') then raise exception 'Only draft or held invoices can be posted';end if;
 if exists(select 1 from public.stock_movements where reference_type='sales_invoice' and reference_id=d.id) or exists(select 1 from public.customer_ledger_entries where reference_type='sales_invoice' and reference_id=d.id) then raise exception 'Invoice already has posted effects';end if;
 if d.invoice_date<business_date and not public.user_has_permission('sales.backdate') then raise exception 'Backdated posting requires sales.backdate' using errcode='42501';end if;
 d:=public.recalculate_sales_invoice(d.id);
 select coalesce((setting_value->>'allow_negative_stock')::boolean,false) into allow_company_negative from public.business_settings where company_id=d.company_id and setting_key='inventory_policy';
 for i in select * from public.sales_invoice_items where invoice_id=d.id order by id for update loop
  item_count:=item_count+1;
  perform pg_advisory_xact_lock(hashtextextended(d.stock_location_id::text||i.product_variant_id::text,0));
  select * into state from public.inventory_stock_state(d.company_id,d.stock_location_id,i.product_variant_id);
  avg_cost:=coalesce(state.average_cost,0);
  select v.* into variant_row from public.product_variants v where v.id=i.product_variant_id and v.company_id=d.company_id and v.is_active and v.deleted_at is null;
  select p.* into product_row from public.products p where p.id=variant_row.product_id and p.company_id=d.company_id and p.product_status='active' and p.deleted_at is null and p.track_stock;
  if variant_row.id is null or product_row.id is null then raise exception 'Invalid active stock product on invoice line';end if;
  select p.allow_negative_stock into product_negative from public.product_variants v join public.products p on p.id=v.product_id where v.id=i.product_variant_id;
  if i.quantity>state.available and not (allow_company_negative and product_negative and public.user_has_permission('sales.negative_stock_override')) then raise exception 'Insufficient available stock for variant %: available %, requested %',i.product_variant_id,state.available,i.quantity;end if;
  -- Snapshot the current average cost into cost_price before inserting movement
  perform set_config('app.sales_workflow','on',true);
  update public.sales_invoice_items set cost_price=avg_cost where id=i.id;
  insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,product_code,product_name,variant_name,sku,barcode,created_by)
  values(d.company_id,d.branch_id,d.warehouse_id,d.stock_location_id,product_row.id,variant_row.id,d.invoice_date,'sale_out',0,i.quantity,avg_cost,round(i.quantity*avg_cost,2),'sales_invoice',d.id,d.invoice_number,product_row.product_code,product_row.name,variant_row.variant_name,variant_row.sku,variant_row.barcode,auth.uid());
  -- Update cost layer remaining quantity (FIFO drain is a future enhancement; WAC approach used here)
 end loop;
 if item_count=0 then raise exception 'Invoice has no items';end if;
 -- Post customer ledger debit if credit/mixed sale
 if d.grand_total>0 then
  insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,due_date,notes,created_by)
  values(d.company_id,d.branch_id,d.customer_id,d.invoice_date,'invoice','sales_invoice',d.id,d.invoice_number,d.grand_total,0,d.due_date,d.notes,auth.uid());
 end if;
 -- Post any draft payments
 for pay in select * from public.invoice_payments where invoice_id=d.id and status='draft' order by created_at,id for update loop
  if pay.payment_method<>'cheque' or pay.clearing_status='cleared' then pay:=public.post_invoice_payment_internal(pay.id);payment_total:=payment_total+pay.amount;end if;
 end loop;
 if payment_total>d.grand_total+0.005 then raise exception 'Immediate payments cannot exceed invoice total';end if;
 if d.invoice_type='cash' and payment_total<d.grand_total then raise exception 'Cash invoice requires full cleared immediate payment';end if;
 if d.invoice_type='mixed' and (payment_total<=0 or payment_total>=d.grand_total) then raise exception 'Mixed invoice requires a partial cleared immediate payment';end if;
 perform set_config('app.sales_workflow','on',true);
 update public.sales_invoices set status='posted',posted_at=now(),posted_by=auth.uid(),paid_amount=payment_total,change_amount=greatest(payment_total-grand_total,0),balance_amount=greatest(grand_total-payment_total,0),payment_status=case when payment_total=0 then 'unpaid'::public.sales_payment_status when payment_total>=grand_total then 'paid'::public.sales_payment_status else 'partial'::public.sales_payment_status end where id=d.id returning * into d;
 if d.invoice_date<business_date then perform public.sales_audit(d,'BACKDATE',null,jsonb_build_object('invoice_date',d.invoice_date,'posted_date',business_date));end if;
 perform public.sales_audit(d,'POST',null,jsonb_build_object('grand_total',d.grand_total,'paid_amount',d.paid_amount,'balance_amount',d.balance_amount,'change_amount',d.change_amount));
 return jsonb_build_object('id',d.id,'document_number',d.invoice_number,'status',d.status,'grand_total',d.grand_total,'paid_amount',d.paid_amount,'balance_amount',d.balance_amount,'change_amount',d.change_amount,'idempotent',false);
end$$;

create function public.create_customer_payment(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare company_uuid uuid:=public.current_user_company_id();pay public.invoice_payments%rowtype;number text;
begin
 if auth.uid() is null or company_uuid is null or not public.user_has_permission('customer_payments.create') then raise exception 'customer_payments.create permission required' using errcode='42501';end if;
 number:=public.next_document_number(company_uuid,(p_input->>'branch_id')::uuid,'receipt');
 insert into public.invoice_payments(company_id,branch_id,invoice_id,customer_id,payment_number,payment_date,payment_method,amount,bank_account_id,card_reference,cheque_number,cheque_date,notes,created_by)
 values(company_uuid,(p_input->>'branch_id')::uuid,nullif(p_input->>'invoice_id','')::uuid,(p_input->>'customer_id')::uuid,number,(p_input->>'payment_date')::date,(p_input->>'payment_method')::public.customer_payment_method,(p_input->>'amount')::numeric,nullif(p_input->>'bank_account_id','')::uuid,nullif(p_input->>'card_reference',''),nullif(p_input->>'cheque_number',''),nullif(p_input->>'cheque_date','')::date,nullif(p_input->>'notes',''),auth.uid()) returning * into pay;
 return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'clearing_status',pay.clearing_status);
end$$;

create function public.post_customer_payment(p_payment_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare pay public.invoice_payments%rowtype;d public.sales_invoices%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('customer_payments.post') then raise exception 'customer_payments.post permission required' using errcode='42501';end if;
 select * into pay from public.invoice_payments where id=p_payment_id for update;
 if not found or pay.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(pay.branch_id) then raise exception 'Customer payment not found or branch denied' using errcode='42501';end if;
 if pay.status='posted' then return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',true);end if;
 if pay.invoice_id is not null then
  select * into d from public.sales_invoices where id=pay.invoice_id for update;
  if d.status<>'posted' then raise exception 'Later payment requires a posted invoice';end if;
  if pay.amount>d.balance_amount then raise exception 'Payment exceeds remaining invoice balance';end if;
 end if;
 pay:=public.post_invoice_payment_internal(pay.id);
 if pay.invoice_id is not null then
  perform set_config('app.sales_workflow','on',true);update public.sales_invoices set paid_amount=paid_amount+pay.amount,balance_amount=balance_amount-pay.amount,payment_status=case when balance_amount-pay.amount<=0 then 'paid'::public.sales_payment_status else 'partial'::public.sales_payment_status end where id=pay.invoice_id;
 end if;
 return jsonb_build_object('id',pay.id,'document_number',pay.payment_number,'status',pay.status,'idempotent',false);
end$$;

revoke all on function public.sales_audit(public.sales_invoices,text,text,jsonb),public.recalculate_sales_invoice(uuid),public.post_invoice_payment_internal(uuid) from public,anon,authenticated;
revoke all on function public.create_sales_draft(jsonb,jsonb,jsonb),public.hold_sales_invoice(uuid),public.recall_sales_invoice(uuid),public.cancel_sales_invoice(uuid,text),public.post_sales_invoice(uuid),public.create_customer_payment(jsonb),public.post_customer_payment(uuid) from public,anon;
grant execute on function public.create_sales_draft(jsonb,jsonb,jsonb),public.hold_sales_invoice(uuid),public.recall_sales_invoice(uuid),public.cancel_sales_invoice(uuid,text),public.post_sales_invoice(uuid),public.create_customer_payment(jsonb),public.post_customer_payment(uuid) to authenticated;
