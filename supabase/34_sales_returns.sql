-- Phase 6: sales-return draft, recalculation, and atomic posting.
create function public.sales_return_audit(r public.sales_returns,p_action text,p_reason text default null,p_values jsonb default null) returns void
language plpgsql security definer set search_path='' as $$begin
 insert into public.audit_logs(company_id,branch_id,user_id,action,module,table_name,record_id,new_values,reason)
 values(r.company_id,r.branch_id,auth.uid(),p_action,'sales_returns','sales_returns',r.id,p_values,p_reason);
end$$;

create function public.recalculate_sales_return(p_return_id uuid) returns public.sales_returns language plpgsql security definer set search_path='' as $$
declare r public.sales_returns%rowtype;
begin
 select * into r from public.sales_returns where id=p_return_id for update;
 if not found or r.status not in ('draft','held') then raise exception 'Sales return cannot be recalculated';end if;
 perform set_config('app.sales_return_workflow','on',true);
 update public.sales_returns set subtotal=x.subtotal,discount_total=x.discount_total,tax_total=x.tax_total,grand_total=x.grand_total,
  balance_adjustment=case when settlement_type in ('reduce_receivable','customer_credit') then x.grand_total else 0 end,
  refund_amount=case when settlement_type='customer_refund' then x.grand_total else 0 end
 from (select coalesce(sum(quantity*unit_price),0)::numeric(18,2) subtotal,coalesce(sum(discount_amount),0)::numeric(18,2) discount_total,coalesce(sum(tax_amount),0)::numeric(18,2) tax_total,coalesce(sum(line_total),0)::numeric(18,2) grand_total from public.sales_return_items where sales_return_id=r.id) x
 where id=r.id returning * into r;return r;
end$$;

create function public.create_sales_return_draft(p_header jsonb,p_items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare company_uuid uuid:=public.current_user_company_id();r public.sales_returns%rowtype;item jsonb;number text;
begin
 if auth.uid() is null or company_uuid is null or not public.user_has_permission('sales_returns.create') then raise exception 'sales_returns.create permission required' using errcode='42501';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one return item is required';end if;
 number:=public.next_document_number(company_uuid,(p_header->>'branch_id')::uuid,'sales_return');
 insert into public.sales_returns(company_id,branch_id,warehouse_id,stock_location_id,return_number,invoice_id,customer_id,return_date,settlement_type,reason,notes,created_by)
 values(company_uuid,(p_header->>'branch_id')::uuid,(p_header->>'warehouse_id')::uuid,(p_header->>'stock_location_id')::uuid,number,nullif(p_header->>'invoice_id','')::uuid,(p_header->>'customer_id')::uuid,(p_header->>'return_date')::date,coalesce((p_header->>'settlement_type')::public.sales_return_settlement_type,'reduce_receivable'),btrim(p_header->>'reason'),nullif(p_header->>'notes',''),auth.uid()) returning * into r;
 for item in select value from jsonb_array_elements(p_items) loop
  insert into public.sales_return_items(company_id,sales_return_id,original_invoice_item_id,product_variant_id,quantity,unit_price,discount_amount,tax_amount,batch_reference,reason,condition,created_by)
  values(company_uuid,r.id,nullif(item->>'original_invoice_item_id','')::uuid,(item->>'product_variant_id')::uuid,(item->>'quantity')::numeric,coalesce((item->>'unit_price')::numeric,0),coalesce((item->>'discount_amount')::numeric,0),coalesce((item->>'tax_amount')::numeric,0),nullif(item->>'batch_reference',''),btrim(item->>'reason'),coalesce(nullif(item->>'condition',''),'other'),auth.uid());
 end loop;
 r:=public.recalculate_sales_return(r.id);perform public.sales_return_audit(r,'CREATE',r.reason,jsonb_build_object('grand_total',r.grand_total));
 return jsonb_build_object('id',r.id,'document_number',r.return_number,'status',r.status,'grand_total',r.grand_total);
end$$;

create function public.post_sales_return(p_return_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.sales_returns%rowtype;i public.sales_return_items%rowtype;original public.sales_invoice_items%rowtype;state record;product_row public.products%rowtype;variant_row public.product_variants%rowtype;
 eligible numeric(18,4);already_returned numeric(18,4);item_count integer:=0;movement_id uuid;
begin
 if auth.uid() is null or not public.user_has_permission('sales_returns.post') then raise exception 'sales_returns.post permission required' using errcode='42501';end if;
 select * into r from public.sales_returns where id=p_return_id for update;
 if not found or r.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(r.branch_id) then raise exception 'Sales return not found or branch denied' using errcode='42501';end if;
 if r.status='posted' then return jsonb_build_object('id',r.id,'document_number',r.return_number,'status',r.status,'idempotent',true);end if;
 if r.status not in ('draft','held') then raise exception 'Only draft or held sales returns can be posted';end if;
 if exists(select 1 from public.stock_movements where reference_type='sales_return' and reference_id=r.id) then raise exception 'Sales return already has stock effects';end if;
 r:=public.recalculate_sales_return(r.id);
 for i in select * from public.sales_return_items where sales_return_id=r.id order by id for update loop
  item_count:=item_count+1;perform pg_advisory_xact_lock(hashtextextended(r.stock_location_id::text||i.product_variant_id::text,0));
  if i.original_invoice_item_id is not null then
   select * into original from public.sales_invoice_items where id=i.original_invoice_item_id;
   select coalesce(sum(ri.quantity),0) into already_returned from public.sales_return_items ri join public.sales_returns rr on rr.id=ri.sales_return_id where ri.original_invoice_item_id=i.original_invoice_item_id and rr.status='posted' and rr.id<>r.id;
   eligible:=original.quantity-already_returned;
   if i.quantity>eligible then raise exception 'Return quantity exceeds eligible quantity %',eligible;end if;
   if i.unit_price<>original.unit_price then raise exception 'Linked return must use historical unit price';end if;
  end if;
  select v.* into variant_row from public.product_variants v where v.id=i.product_variant_id and v.company_id=r.company_id;
  select p.* into product_row from public.products p where p.id=variant_row.product_id and p.company_id=r.company_id;
  -- Use historical cost_price for stock movement
  insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,product_code,product_name,variant_name,sku,barcode,created_by)
  values(r.company_id,r.branch_id,r.warehouse_id,r.stock_location_id,product_row.id,variant_row.id,r.return_date,'sale_return_in',i.quantity,0,i.cost_price,round(i.quantity*i.cost_price,2),'sales_return',r.id,r.return_number,product_row.product_code,product_row.name,variant_row.variant_name,variant_row.sku,variant_row.barcode,auth.uid()) returning id into movement_id;
  -- Restore cost layer
  insert into public.inventory_cost_layers(company_id,branch_id,warehouse_id,stock_location_id,product_variant_id,source_movement_id,original_quantity,remaining_quantity,unit_cost,received_date)
  values(r.company_id,r.branch_id,r.warehouse_id,r.stock_location_id,i.product_variant_id,movement_id,i.quantity,i.quantity,i.cost_price,r.return_date);
 end loop;
 if item_count=0 then raise exception 'Sales return has no items';end if;
 -- Customer ledger: credit reduces receivable
 insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
 values(r.company_id,r.branch_id,r.customer_id,r.return_date,'sales_return','sales_return',r.id,r.return_number,0,r.grand_total,r.reason,auth.uid());
 if r.invoice_id is not null then
  perform set_config('app.sales_workflow','on',true);
  update public.sales_invoices set returned_amount=returned_amount+r.grand_total,balance_amount=greatest(balance_amount-r.grand_total,0),payment_status=case when greatest(balance_amount-r.grand_total,0)<=0 then 'paid'::public.sales_payment_status else payment_status end where id=r.invoice_id;
 end if;
 perform set_config('app.sales_return_workflow','on',true);update public.sales_returns set status='posted',posted_at=now(),posted_by=auth.uid() where id=r.id returning * into r;
 perform public.sales_return_audit(r,'POST',r.reason,jsonb_build_object('grand_total',r.grand_total,'settlement_type',r.settlement_type));
 return jsonb_build_object('id',r.id,'document_number',r.return_number,'status',r.status,'grand_total',r.grand_total,'idempotent',false);
end$$;

revoke all on function public.sales_return_audit(public.sales_returns,text,text,jsonb),public.recalculate_sales_return(uuid) from public,anon,authenticated;
revoke all on function public.create_sales_return_draft(jsonb,jsonb),public.post_sales_return(uuid) from public,anon;
grant execute on function public.create_sales_return_draft(jsonb,jsonb),public.post_sales_return(uuid) to authenticated;
