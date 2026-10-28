-- Phase 4: append-only stock ledger and future reservations/FIFO layers.
create table public.stock_movements (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, warehouse_id uuid not null, stock_location_id uuid not null, product_id uuid not null, product_variant_id uuid not null,
 movement_date date not null, movement_type public.stock_movement_type not null,
 quantity_in numeric(18,4) not null default 0 check(quantity_in>=0), quantity_out numeric(18,4) not null default 0 check(quantity_out>=0),
 unit_cost numeric(18,4) not null check(unit_cost>=0), total_cost numeric(18,2) not null check(total_cost>=0),
 reference_type text not null, reference_id uuid not null, reference_number text not null,
 source_movement_id uuid references public.stock_movements(id) on delete restrict, reversal_movement_id uuid references public.stock_movements(id) on delete restrict,
 product_code text not null, product_name text not null, variant_name text not null, sku text not null, barcode text,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 unique(reference_id,stock_location_id,product_variant_id,movement_type), unique(company_id,id),
 constraint stock_movements_branch_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
 constraint stock_movements_warehouse_fk foreign key(company_id,branch_id,warehouse_id) references public.warehouses(company_id,branch_id,id) on delete restrict,
 constraint stock_movements_location_fk foreign key(company_id,stock_location_id) references public.stock_locations(company_id,id) on delete restrict,
 constraint stock_movements_product_fk foreign key(company_id,product_id) references public.products(company_id,id) on delete restrict,
 constraint stock_movements_variant_fk foreign key(company_id,product_variant_id) references public.product_variants(company_id,id) on delete restrict,
 constraint stock_movements_direction_check check((quantity_in>0 and quantity_out=0) or (quantity_out>0 and quantity_in=0)),
 constraint stock_movements_cost_check check(total_cost=round((quantity_in+quantity_out)*unit_cost,2))
);
create index stock_movements_balance_idx on public.stock_movements(company_id,branch_id,warehouse_id,stock_location_id,product_variant_id);
create index stock_movements_history_idx on public.stock_movements(company_id,movement_date desc,created_at desc,id desc);
create index stock_movements_reference_idx on public.stock_movements(reference_id);

create table public.inventory_cost_layers (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, warehouse_id uuid not null, stock_location_id uuid not null, product_variant_id uuid not null,
 source_movement_id uuid not null references public.stock_movements(id) on delete restrict,
 original_quantity numeric(18,4) not null check(original_quantity>0), remaining_quantity numeric(18,4) not null check(remaining_quantity>=0 and remaining_quantity<=original_quantity),
 unit_cost numeric(18,4) not null check(unit_cost>=0), received_date date not null, created_at timestamptz not null default now(), unique(source_movement_id),
 constraint inventory_cost_layers_location_fk foreign key(company_id,stock_location_id) references public.stock_locations(company_id,id) on delete restrict,
 constraint inventory_cost_layers_variant_fk foreign key(company_id,product_variant_id) references public.product_variants(company_id,id) on delete restrict
);

create table public.stock_reservations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, warehouse_id uuid not null, stock_location_id uuid not null, product_variant_id uuid not null,
 source_type text not null, source_id uuid not null, quantity numeric(18,4) not null check(quantity>0),
 status public.stock_reservation_status not null default 'active', expires_at timestamptz,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 released_at timestamptz, released_by uuid references auth.users(id) on delete set null,
 unique(company_id,source_type,source_id,product_variant_id,stock_location_id),
 constraint stock_reservations_location_fk foreign key(company_id,stock_location_id) references public.stock_locations(company_id,id) on delete restrict,
 constraint stock_reservations_variant_fk foreign key(company_id,product_variant_id) references public.product_variants(company_id,id) on delete restrict
);
create index stock_reservations_active_idx on public.stock_reservations(company_id,stock_location_id,product_variant_id) where status='active';

create function public.protect_inventory_document() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status not in ('draft','rejected') then raise exception 'Submitted, posted, cancelled or reversed documents cannot be edited directly'; end if;
 if new.company_id<>old.company_id or new.branch_id<>old.branch_id or new.document_type<>old.document_type or new.document_number<>old.document_number then raise exception 'Document identity cannot be changed'; end if;
 new.updated_at:=now(); new.updated_by:=coalesce(auth.uid(),new.updated_by); return new;
end $$;
create function public.prevent_stock_movement_change() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Stock movements are immutable; create a reversal'; end $$;
create trigger inventory_documents_protect before update on public.inventory_documents for each row execute function public.protect_inventory_document();
create trigger stock_movements_immutable before update or delete on public.stock_movements for each row execute function public.prevent_stock_movement_change();

alter table public.inventory_documents enable row level security;
alter table public.inventory_document_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.inventory_cost_layers enable row level security;
alter table public.stock_reservations enable row level security;
revoke all on public.inventory_documents,public.inventory_document_items,public.stock_movements,public.inventory_cost_layers,public.stock_reservations from anon;
grant select,insert,update,delete on public.inventory_documents,public.inventory_document_items to authenticated;
grant select on public.stock_movements,public.inventory_cost_layers,public.stock_reservations to authenticated;
revoke insert,update,delete on public.stock_movements,public.inventory_cost_layers,public.stock_reservations from authenticated;

create policy inventory_documents_read on public.inventory_documents for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('inventory.view'));
create policy inventory_documents_insert on public.inventory_documents for insert to authenticated with check(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('inventory.view'));
create policy inventory_documents_update_draft on public.inventory_documents for update to authenticated using(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and status in ('draft','rejected')) with check(company_id=public.current_user_company_id());
create policy inventory_documents_delete_draft on public.inventory_documents for delete to authenticated using(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and status='draft');
create policy inventory_items_read on public.inventory_document_items for select to authenticated using(company_id=public.current_user_company_id() and exists(select 1 from public.inventory_documents d where d.id=inventory_document_id and public.user_has_branch_access(d.branch_id)) and public.user_has_permission('inventory.view'));
create policy inventory_items_manage_draft on public.inventory_document_items for all to authenticated using(company_id=public.current_user_company_id() and exists(select 1 from public.inventory_documents d where d.id=inventory_document_id and d.status='draft' and public.user_can_transact_in_branch(d.branch_id))) with check(company_id=public.current_user_company_id());
create policy stock_movements_read on public.stock_movements for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('inventory.view'));
create policy cost_layers_read on public.inventory_cost_layers for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and (public.user_has_permission('inventory.view_cost') or public.user_has_permission('products.view_cost')));
create policy reservations_read on public.stock_reservations for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('inventory.view'));
revoke all on function public.validate_inventory_item(),public.protect_inventory_document(),public.prevent_stock_movement_change() from public,anon,authenticated;
