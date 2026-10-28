-- Phase 4: final data-quality constraints and documented policy settings.
alter table public.inventory_documents add column supporting_reference text;
alter table public.inventory_documents add constraint inventory_documents_reversal_company_fk foreign key(company_id,reversal_of_id) references public.inventory_documents(company_id,id) on delete restrict;
alter table public.stock_movements add constraint stock_movements_reference_document_fk foreign key(company_id,reference_id) references public.inventory_documents(company_id,id) on delete restrict;
alter table public.stock_movements add constraint stock_movements_reference_type_check check(reference_type='inventory_document');
alter table public.inventory_document_items drop constraint inventory_items_count_check;
alter table public.inventory_document_items add constraint inventory_items_count_check check(
 (expected_quantity is null and counted_quantity is null) or
 (expected_quantity is not null and counted_quantity is not null and expected_quantity>=0 and counted_quantity>=0)
);
alter table public.inventory_documents add constraint inventory_documents_reason_required_check check(
 document_type not in ('stock_adjustment_in','stock_adjustment_out','stock_count','damaged_stock','stock_write_off') or nullif(btrim(reason),'') is not null
);
create unique index inventory_items_unique_line_idx on public.inventory_document_items(
 inventory_document_id,product_variant_id,source_location_id,coalesce(destination_location_id,'00000000-0000-0000-0000-000000000000'::uuid)
);
create function public.validate_inventory_active_product() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id and p.company_id=v.company_id where v.id=new.product_variant_id and v.company_id=new.company_id and v.deleted_at is null and p.deleted_at is null and p.track_stock and p.product_status='active') then raise exception 'Inventory documents require an active stock-tracked product variant';end if;
 return new;
end $$;
create trigger inventory_items_active_product before insert or update of product_variant_id on public.inventory_document_items for each row execute function public.validate_inventory_active_product();
comment on table public.inventory_cost_layers is 'FIFO-ready receipt layers. Weighted-average ledger valuation is authoritative in Phase 4; FIFO consumption is deferred.';
comment on table public.stock_reservations is 'Reserved for future customer orders; authenticated clients have no write grant in Phase 4.';
comment on column public.inventory_documents.negative_stock_override is 'Effective only with inventory_policy.allow_negative_stock, product allow_negative_stock, a reason, and inventory.negative_stock_override.';
comment on column public.inventory_documents.supporting_reference is 'External evidence or approval reference, especially for stock write-offs.';
revoke all on function public.validate_inventory_active_product() from public,anon,authenticated;

comment on function public.approve_inventory_document(uuid) is 'Uses inventory_policy.write_off_approval_threshold; write-offs at or above the configured LKR amount require an administrator.';
