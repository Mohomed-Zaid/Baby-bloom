-- Phase 4: corrections are append-only reversal movements.
create function public.reverse_inventory_document(document_id uuid,reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare original public.inventory_documents%rowtype; reversal_doc public.inventory_documents%rowtype; m public.stock_movements%rowtype;
 state record; reversal_number text; reversal_id uuid; q_in numeric(18,4);q_out numeric(18,4);mtype public.stock_movement_type;
begin
 if auth.uid() is null or not public.user_has_permission('inventory.reverse') then raise exception 'inventory.reverse permission required' using errcode='42501'; end if;
 if nullif(btrim(reason),'') is null then raise exception 'Reversal reason is required'; end if;
 select * into original from public.inventory_documents where id=document_id for update;
 if not found or original.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(original.branch_id) then raise exception 'Inventory document not found or branch denied' using errcode='42501'; end if;
 if original.status='reversed' then select * into reversal_doc from public.inventory_documents where reversal_of_id=original.id;return jsonb_build_object('id',reversal_doc.id,'status',reversal_doc.status,'document_number',reversal_doc.document_number,'idempotent',true); end if;
 if original.status<>'posted' then raise exception 'Only posted documents can be reversed'; end if;
 reversal_number:=public.next_document_number(original.company_id,original.branch_id,'stock_adjustment');
 insert into public.inventory_documents(company_id,branch_id,document_number,document_type,document_date,status,warehouse_id,destination_branch_id,destination_warehouse_id,reason,notes,total_cost,reversal_of_id,approved_at,approved_by,posted_at,posted_by,created_by)
 values(original.company_id,original.branch_id,reversal_number,'reversal',(now() at time zone 'Asia/Colombo')::date,'approved',original.warehouse_id,original.destination_branch_id,original.destination_warehouse_id,reason,'Reversal of '||original.document_number,original.total_cost,original.id,now(),auth.uid(),now(),auth.uid(),auth.uid()) returning * into reversal_doc;
 for m in select * from public.stock_movements where reference_id=original.id order by created_at,id for update loop
  perform pg_advisory_xact_lock(hashtextextended(m.stock_location_id::text||m.product_variant_id::text,0));
  q_in:=m.quantity_out;q_out:=m.quantity_in;mtype:=case when q_in>0 then 'reversal_in' else 'reversal_out' end;
  if q_out>0 then select * into state from public.inventory_stock_state(m.company_id,m.stock_location_id,m.product_variant_id);if state.available<q_out then raise exception 'Cannot reverse %; stock has already been consumed (available %, required %)',original.document_number,state.available,q_out;end if;end if;
  insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,source_movement_id,product_code,product_name,variant_name,sku,barcode,created_by)
  values(m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_id,m.product_variant_id,reversal_doc.document_date,mtype,q_in,q_out,m.unit_cost,round((q_in+q_out)*m.unit_cost,2),'inventory_document',reversal_doc.id,reversal_doc.document_number,m.id,m.product_code,m.product_name,m.variant_name,m.sku,m.barcode,auth.uid()) returning id into reversal_id;
  if q_in>0 then insert into public.inventory_cost_layers(company_id,branch_id,warehouse_id,stock_location_id,product_variant_id,source_movement_id,original_quantity,remaining_quantity,unit_cost,received_date) values(m.company_id,m.branch_id,m.warehouse_id,m.stock_location_id,m.product_variant_id,reversal_id,q_in,q_in,m.unit_cost,reversal_doc.document_date);end if;
 end loop;
 perform set_config('app.inventory_workflow','on',true);
 update public.inventory_documents set status='posted' where id=reversal_doc.id returning * into reversal_doc;
 update public.inventory_documents set status='reversed',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=reason where id=original.id returning * into original;
 perform public.inventory_audit(original,'REVERSE',reason,jsonb_build_object('reversal_document_id',reversal_doc.id));
 perform public.inventory_audit(reversal_doc,'POST_REVERSAL',reason,jsonb_build_object('reversal_of_id',original.id));
 return jsonb_build_object('id',reversal_doc.id,'status',reversal_doc.status,'document_number',reversal_doc.document_number,'idempotent',false);
end $$;
revoke all on function public.reverse_inventory_document(uuid,text) from public,anon;
grant execute on function public.reverse_inventory_document(uuid,text) to authenticated;
