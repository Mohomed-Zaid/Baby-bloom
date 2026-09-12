-- Phase 4: document validation and approval lifecycle.
create function public.inventory_create_permission(p_type public.inventory_document_type) returns text language sql immutable set search_path='' as $$
 select case p_type when 'opening_stock' then 'inventory.create_opening_stock' when 'stock_transfer' then 'inventory.create_transfer'
 when 'stock_adjustment_in' then 'inventory.create_adjustment' when 'stock_adjustment_out' then 'inventory.create_adjustment'
 when 'stock_count' then 'inventory.create_adjustment' when 'damaged_stock' then 'inventory.record_damage'
 when 'stock_write_off' then 'inventory.write_off' else 'inventory.reverse' end
$$;

create function public.validate_inventory_document() returns trigger language plpgsql security definer set search_path='' as $$
declare business_date date:=(now() at time zone 'Asia/Colombo')::date;
begin
 if tg_op='INSERT' then
  if auth.uid() is not null and (new.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(new.branch_id) or not public.user_has_permission(public.inventory_create_permission(new.document_type))) then raise exception 'Not authorised to create this inventory document' using errcode='42501'; end if;
  if new.document_date<business_date and auth.uid() is not null and not public.user_has_permission('inventory.backdate') then raise exception 'Backdated inventory documents require inventory.backdate' using errcode='42501'; end if;
  if new.destination_branch_id is not null and auth.uid() is not null and not public.user_can_transact_in_branch(new.destination_branch_id) then raise exception 'Destination branch is not authorised' using errcode='42501'; end if;
 elsif coalesce(current_setting('app.inventory_workflow',true),'')<>'on' then
  if old.status not in ('draft','rejected') then raise exception 'Submitted, posted, cancelled or reversed documents cannot be edited directly'; end if;
  if new.company_id<>old.company_id or new.branch_id<>old.branch_id or new.document_type<>old.document_type or new.document_number<>old.document_number then raise exception 'Document identity cannot be changed'; end if;
 end if;
 new.updated_at:=now(); new.updated_by:=coalesce(auth.uid(),new.updated_by); return new;
end $$;
drop trigger inventory_documents_protect on public.inventory_documents;
drop function public.protect_inventory_document();
create trigger inventory_documents_validate before insert or update on public.inventory_documents for each row execute function public.validate_inventory_document();

create function public.inventory_audit(p_document public.inventory_documents,p_action text,p_reason text default null,p_values jsonb default null) returns void
language plpgsql security definer set search_path='' as $$ begin
 insert into public.audit_logs(company_id,branch_id,user_id,action,module,table_name,record_id,new_values,reason)
 values(p_document.company_id,p_document.branch_id,auth.uid(),p_action,'inventory','inventory_documents',p_document.id,p_values,p_reason);
end $$;

create function public.submit_inventory_document(p_document_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.inventory_documents%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('inventory.submit') then raise exception 'inventory.submit permission required' using errcode='42501'; end if;
 select * into d from public.inventory_documents where id=p_document_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Inventory document not found or branch denied' using errcode='42501'; end if;
 if d.status not in ('draft','rejected') then raise exception 'Only draft or rejected documents can be submitted'; end if;
 if not exists(select 1 from public.inventory_document_items where inventory_document_id=d.id) then raise exception 'Add at least one inventory item'; end if;
 perform set_config('app.inventory_workflow','on',true);
 update public.inventory_documents set status='submitted',submitted_at=now(),submitted_by=auth.uid(),cancellation_reason=null where id=d.id returning * into d;
 perform public.inventory_audit(d,'SUBMIT'); return jsonb_build_object('id',d.id,'status',d.status,'document_number',d.document_number);
end $$;

create function public.approve_inventory_document(p_document_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.inventory_documents%rowtype; i public.inventory_document_items%rowtype; stock_state record;
 write_off_threshold numeric:=0; estimated_total numeric(18,2):=0;
begin
 if auth.uid() is null or not public.user_has_permission('inventory.approve') then raise exception 'inventory.approve permission required' using errcode='42501'; end if;
 select * into d from public.inventory_documents where id=p_document_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Inventory document not found or branch denied' using errcode='42501'; end if;
 if d.status<>'submitted' then raise exception 'Only submitted documents can be approved'; end if;
 if d.document_type='stock_write_off' then
  select coalesce((select (setting_value->>'write_off_approval_threshold')::numeric from public.business_settings where company_id=d.company_id and setting_key='inventory_policy'),0) into write_off_threshold;
  for i in select * from public.inventory_document_items where inventory_document_id=d.id loop
   select * into stock_state from public.inventory_stock_state(d.company_id,i.source_location_id,i.product_variant_id);
   estimated_total:=estimated_total+round(i.quantity*stock_state.average_cost,2);
  end loop;
  if write_off_threshold>0 and estimated_total>=write_off_threshold and not public.current_user_is_admin() then raise exception 'Write-offs at or above % require an administrator',write_off_threshold using errcode='42501'; end if;
 end if;
 perform set_config('app.inventory_workflow','on',true); update public.inventory_documents set status='approved',approved_at=now(),approved_by=auth.uid(),total_cost=case when document_type='stock_write_off' then estimated_total else total_cost end where id=d.id returning * into d;
 perform public.inventory_audit(d,'APPROVE',null,jsonb_build_object('estimated_total',estimated_total,'write_off_approval_threshold',write_off_threshold)); return jsonb_build_object('id',d.id,'status',d.status,'document_number',d.document_number);
end $$;

create function public.reject_inventory_document(p_document_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.inventory_documents%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('inventory.approve') then raise exception 'inventory.approve permission required' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Rejection reason is required'; end if;
 select * into d from public.inventory_documents where id=p_document_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Inventory document not found or branch denied' using errcode='42501'; end if;
 if d.status<>'submitted' then raise exception 'Only submitted documents can be rejected'; end if;
 perform set_config('app.inventory_workflow','on',true); update public.inventory_documents set status='rejected',approved_at=null,approved_by=null,cancellation_reason=p_reason where id=d.id returning * into d;
 perform public.inventory_audit(d,'REJECT',p_reason); return jsonb_build_object('id',d.id,'status',d.status,'document_number',d.document_number);
end $$;

create function public.cancel_inventory_document(p_document_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.inventory_documents%rowtype;
begin
 if auth.uid() is null or not public.user_has_permission('inventory.submit') then raise exception 'inventory.submit permission required' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Cancellation reason is required'; end if;
 select * into d from public.inventory_documents where id=p_document_id for update;
 if not found or d.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Inventory document not found or branch denied' using errcode='42501'; end if;
 if d.status not in ('draft','submitted','approved','rejected') then raise exception 'Posted, cancelled or reversed documents cannot be cancelled'; end if;
 perform set_config('app.inventory_workflow','on',true); update public.inventory_documents set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=p_reason where id=d.id returning * into d;
 perform public.inventory_audit(d,'CANCEL',p_reason); return jsonb_build_object('id',d.id,'status',d.status,'document_number',d.document_number);
end $$;

revoke all on function public.inventory_create_permission(public.inventory_document_type),public.validate_inventory_document(),public.inventory_audit(public.inventory_documents,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.submit_inventory_document(uuid),public.approve_inventory_document(uuid),public.reject_inventory_document(uuid,text),public.cancel_inventory_document(uuid,text) from public,anon;
grant execute on function public.submit_inventory_document(uuid),public.approve_inventory_document(uuid),public.reject_inventory_document(uuid,text),public.cancel_inventory_document(uuid,text) to authenticated;
