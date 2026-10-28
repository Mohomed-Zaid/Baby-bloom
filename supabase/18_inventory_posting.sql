-- Phase 4: atomic, idempotent weighted-average stock posting.
create function public.inventory_stock_state(p_company uuid,p_location uuid,p_variant uuid)
returns table(quantity numeric,average_cost numeric,available numeric) language sql stable security definer set search_path='' as $$
 with m as (select coalesce(sum(quantity_in-quantity_out),0) q,coalesce(sum(case when quantity_in>0 then total_cost else -total_cost end),0) v from public.stock_movements where company_id=p_company and stock_location_id=p_location and product_variant_id=p_variant),
 r as (select coalesce(sum(quantity),0) q from public.stock_reservations where company_id=p_company and stock_location_id=p_location and product_variant_id=p_variant and status='active' and (expires_at is null or expires_at>now()))
 select m.q::numeric(18,4),case when m.q=0 then 0 else round(m.v/m.q,4) end::numeric(18,4),(m.q-r.q)::numeric(18,4) from m,r
$$;

create function public.insert_inventory_movement(p_doc public.inventory_documents,p_item public.inventory_document_items,p_type public.stock_movement_type,p_branch uuid,p_warehouse uuid,p_location uuid,p_in numeric,p_out numeric,p_cost numeric,p_source uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare movement_id uuid; product_row public.products%rowtype; variant_row public.product_variants%rowtype;
begin
 select v.* into variant_row from public.product_variants v where v.id=p_item.product_variant_id and v.company_id=p_doc.company_id;
 select p.* into product_row from public.products p where p.id=variant_row.product_id and p.company_id=p_doc.company_id;
 insert into public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_id,product_variant_id,movement_date,movement_type,quantity_in,quantity_out,unit_cost,total_cost,reference_type,reference_id,reference_number,source_movement_id,product_code,product_name,variant_name,sku,barcode,created_by)
 values(p_doc.company_id,p_branch,p_warehouse,p_location,product_row.id,variant_row.id,p_doc.document_date,p_type,p_in,p_out,p_cost,round((p_in+p_out)*p_cost,2),'inventory_document',p_doc.id,p_doc.document_number,p_source,product_row.product_code,product_row.name,variant_row.variant_name,variant_row.sku,variant_row.barcode,auth.uid()) returning id into movement_id;
 if p_in>0 then insert into public.inventory_cost_layers(company_id,branch_id,warehouse_id,stock_location_id,product_variant_id,source_movement_id,original_quantity,remaining_quantity,unit_cost,received_date) values(p_doc.company_id,p_branch,p_warehouse,p_location,variant_row.id,movement_id,p_in,p_in,p_cost,p_doc.document_date); end if;
 return movement_id;
end $$;

create function public.post_inventory_document_internal(p_document_id uuid,p_expected public.inventory_document_type) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.inventory_documents%rowtype; i public.inventory_document_items%rowtype; state record; movement_id uuid; source_id uuid;
 qty_in numeric(18,4); qty_out numeric(18,4); cost numeric(18,4); total numeric(18,2):=0; business_date date:=(now() at time zone 'Asia/Colombo')::date;
 allow_company_negative boolean:=false; product_negative boolean; target_type public.stock_movement_type; item_count integer:=0;
begin
 if auth.uid() is null or not public.user_has_permission('inventory.post') then raise exception 'inventory.post permission required' using errcode='42501'; end if;
 select * into d from public.inventory_documents where id=p_document_id for update;
 if not found or d.company_id<>public.current_user_company_id() or d.document_type<>p_expected or not public.user_can_transact_in_branch(d.branch_id) then raise exception 'Inventory document not found, type mismatch, or branch denied' using errcode='42501'; end if;
 if d.destination_branch_id is not null and not public.user_can_transact_in_branch(d.destination_branch_id) then raise exception 'Destination branch denied' using errcode='42501'; end if;
 if d.status='posted' then return jsonb_build_object('id',d.id,'status',d.status,'document_number',d.document_number,'idempotent',true); end if;
 if d.status<>'approved' then raise exception 'Only approved inventory documents can be posted'; end if;
 if exists(select 1 from public.stock_movements where reference_id=d.id) then raise exception 'Document already has stock movements'; end if;
 if d.document_date<business_date and not public.user_has_permission('inventory.backdate') then raise exception 'Backdated posting requires inventory.backdate' using errcode='42501'; end if;
 select coalesce((setting_value->>'allow_negative_stock')::boolean,false) into allow_company_negative from public.business_settings where company_id=d.company_id and setting_key='inventory_policy';
 for i in select * from public.inventory_document_items where inventory_document_id=d.id order by id for update loop
  item_count:=item_count+1;
  perform pg_advisory_xact_lock(hashtextextended(i.source_location_id::text||i.product_variant_id::text,0));
  select * into state from public.inventory_stock_state(d.company_id,i.source_location_id,i.product_variant_id);
  select p.allow_negative_stock into product_negative from public.product_variants v join public.products p on p.id=v.product_id where v.id=i.product_variant_id;
  qty_in:=0; qty_out:=0; cost:=i.unit_cost;
  if d.document_type='opening_stock' then if i.unit_cost<=0 then raise exception 'Opening stock unit cost must be greater than zero'; end if; qty_in:=i.quantity;target_type:='opening_stock';
  elsif d.document_type='stock_adjustment_in' then if i.unit_cost<=0 then raise exception 'Adjustment-in unit cost must be greater than zero'; end if;qty_in:=i.quantity;target_type:='adjustment_in';
  elsif d.document_type='stock_count' then
   if i.expected_quantity is null or i.counted_quantity is null or i.quantity<>abs(i.counted_quantity-i.expected_quantity) then raise exception 'Stock count line must contain the absolute count difference'; end if;
   if i.counted_quantity>=i.expected_quantity then qty_in:=i.quantity;cost:=case when i.unit_cost>0 then i.unit_cost else state.average_cost end;target_type:='stock_count_in'; else qty_out:=i.quantity;cost:=state.average_cost;target_type:='stock_count_out'; end if;
  else qty_out:=i.quantity;cost:=state.average_cost;target_type:=case d.document_type when 'stock_transfer' then 'transfer_out' when 'stock_adjustment_out' then 'adjustment_out' when 'damaged_stock' then 'damaged' else 'write_off' end; end if;
  if qty_out>state.available and not (allow_company_negative and product_negative and d.negative_stock_override and nullif(btrim(d.reason),'') is not null and public.user_has_permission('inventory.negative_stock_override')) then raise exception 'Insufficient available stock for variant %: available %, requested %',i.product_variant_id,state.available,qty_out; end if;
  movement_id:=public.insert_inventory_movement(d,i,target_type,d.branch_id,d.warehouse_id,i.source_location_id,qty_in,qty_out,cost);
  if d.document_type='stock_transfer' then
   perform pg_advisory_xact_lock(hashtextextended(i.destination_location_id::text||i.product_variant_id::text,0));
   source_id:=public.insert_inventory_movement(d,i,'transfer_in',d.destination_branch_id,d.destination_warehouse_id,i.destination_location_id,i.quantity,0,cost,movement_id);
  end if;
  total:=total+round(i.quantity*cost,2);
 end loop;
 if item_count=0 then raise exception 'Inventory document has no items'; end if;
 perform set_config('app.inventory_workflow','on',true);
 update public.inventory_documents set status='posted',posted_at=now(),posted_by=auth.uid(),total_cost=total where id=d.id returning * into d;
 if d.document_date<business_date then perform public.inventory_audit(d,'BACKDATE',d.reason,jsonb_build_object('document_date',d.document_date,'posted_date',business_date)); end if;
 perform public.inventory_audit(d,'POST',case when d.negative_stock_override then d.reason end,jsonb_build_object('total_cost',total,'negative_stock_override',d.negative_stock_override));
 return jsonb_build_object('id',d.id,'status',d.status,'document_number',d.document_number,'total_cost',total,'idempotent',false);
end $$;

create function public.post_opening_stock(document_id uuid) returns jsonb language sql security definer set search_path='' as $$select public.post_inventory_document_internal(document_id,'opening_stock')$$;
create function public.post_stock_transfer(document_id uuid) returns jsonb language sql security definer set search_path='' as $$select public.post_inventory_document_internal(document_id,'stock_transfer')$$;
create function public.post_stock_adjustment(document_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare t public.inventory_document_type;begin select document_type into t from public.inventory_documents where id=document_id;if t not in ('stock_adjustment_in','stock_adjustment_out','stock_count') then raise exception 'Not a stock adjustment document';end if;return public.post_inventory_document_internal(document_id,t);end$$;
create function public.post_damaged_stock(document_id uuid) returns jsonb language sql security definer set search_path='' as $$select public.post_inventory_document_internal(document_id,'damaged_stock')$$;
create function public.post_stock_write_off(document_id uuid) returns jsonb language sql security definer set search_path='' as $$select public.post_inventory_document_internal(document_id,'stock_write_off')$$;

revoke all on function public.inventory_stock_state(uuid,uuid,uuid),public.insert_inventory_movement(public.inventory_documents,public.inventory_document_items,public.stock_movement_type,uuid,uuid,uuid,numeric,numeric,numeric,uuid),public.post_inventory_document_internal(uuid,public.inventory_document_type) from public,anon,authenticated;
revoke all on function public.post_opening_stock(uuid),public.post_stock_transfer(uuid),public.post_stock_adjustment(uuid),public.post_damaged_stock(uuid),public.post_stock_write_off(uuid) from public,anon;
grant execute on function public.post_opening_stock(uuid),public.post_stock_transfer(uuid),public.post_stock_adjustment(uuid),public.post_damaged_stock(uuid),public.post_stock_write_off(uuid) to authenticated;
