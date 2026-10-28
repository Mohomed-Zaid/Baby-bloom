-- Phase 4: inventory document workflow.
create type public.inventory_document_type as enum ('opening_stock','stock_transfer','stock_adjustment_in','stock_adjustment_out','damaged_stock','stock_write_off','stock_count','reversal');
create type public.inventory_document_status as enum ('draft','submitted','approved','posted','rejected','cancelled','reversed');
create type public.stock_movement_type as enum ('opening_stock','transfer_out','transfer_in','adjustment_in','adjustment_out','damaged','write_off','stock_count_in','stock_count_out','reversal_in','reversal_out');
create type public.stock_reservation_status as enum ('active','fulfilled','released','expired','cancelled');

create table public.inventory_documents (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null, document_number text not null check(btrim(document_number)<>''), document_type public.inventory_document_type not null,
 document_date date not null, status public.inventory_document_status not null default 'draft', warehouse_id uuid not null,
 destination_branch_id uuid, destination_warehouse_id uuid, reason text, notes text, total_cost numeric(18,2) not null default 0 check(total_cost>=0),
 source_document_type text, source_document_id uuid, reversal_of_id uuid references public.inventory_documents(id) on delete restrict,
 negative_stock_override boolean not null default false,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 submitted_at timestamptz, submitted_by uuid references auth.users(id) on delete set null,
 approved_at timestamptz, approved_by uuid references auth.users(id) on delete set null,
 posted_at timestamptz, posted_by uuid references auth.users(id) on delete set null,
 cancelled_at timestamptz, cancelled_by uuid references auth.users(id) on delete set null, cancellation_reason text,
 unique(company_id,branch_id,document_number), unique(company_id,id),
 constraint inventory_documents_branch_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
 constraint inventory_documents_warehouse_fk foreign key(company_id,branch_id,warehouse_id) references public.warehouses(company_id,branch_id,id) on delete restrict,
 constraint inventory_documents_destination_branch_fk foreign key(company_id,destination_branch_id) references public.branches(company_id,id) on delete restrict,
 constraint inventory_documents_destination_warehouse_fk foreign key(company_id,destination_branch_id,destination_warehouse_id) references public.warehouses(company_id,branch_id,id) on delete restrict,
 constraint inventory_documents_transfer_destination_check check(document_type<>'stock_transfer' or (destination_branch_id is not null and destination_warehouse_id is not null)),
 constraint inventory_documents_reversal_shape_check check((document_type='reversal')=(reversal_of_id is not null))
);
create unique index inventory_documents_one_reversal_idx on public.inventory_documents(reversal_of_id) where reversal_of_id is not null;
create index inventory_documents_company_date_idx on public.inventory_documents(company_id,document_date desc,created_at desc);
create index inventory_documents_branch_status_idx on public.inventory_documents(company_id,branch_id,status);

create table public.inventory_document_items (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 inventory_document_id uuid not null, product_variant_id uuid not null, source_location_id uuid not null, destination_location_id uuid,
 quantity numeric(18,4) not null check(quantity>0), unit_cost numeric(18,4) not null default 0 check(unit_cost>=0),
 total_cost numeric(18,2) generated always as (round(quantity*unit_cost,2)) stored,
 expected_quantity numeric(18,4), counted_quantity numeric(18,4), batch_reference text, expiry_date date, remarks text,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null,
 unique(inventory_document_id,product_variant_id,source_location_id,destination_location_id), unique(company_id,id),
 constraint inventory_items_document_fk foreign key(company_id,inventory_document_id) references public.inventory_documents(company_id,id) on delete cascade,
 constraint inventory_items_variant_fk foreign key(company_id,product_variant_id) references public.product_variants(company_id,id) on delete restrict,
 constraint inventory_items_source_location_fk foreign key(company_id,source_location_id) references public.stock_locations(company_id,id) on delete restrict,
 constraint inventory_items_destination_location_fk foreign key(company_id,destination_location_id) references public.stock_locations(company_id,id) on delete restrict,
 constraint inventory_items_count_check check((expected_quantity is null and counted_quantity is null) or (expected_quantity>=0 and counted_quantity>=0))
);
create index inventory_document_items_document_idx on public.inventory_document_items(inventory_document_id);

insert into public.permissions(permission_key,module,name,description) values
 ('inventory.create_opening_stock','inventory','Create opening stock','Create opening stock drafts'),('inventory.create_transfer','inventory','Create transfer','Create stock transfers'),
 ('inventory.create_adjustment','inventory','Create adjustment','Create stock adjustments and counts'),('inventory.record_damage','inventory','Record damage','Create damaged stock documents'),
 ('inventory.write_off','inventory','Write off stock','Create stock write-off documents'),('inventory.submit','inventory','Submit','Submit inventory documents'),
 ('inventory.approve','inventory','Approve','Approve inventory documents'),('inventory.post','inventory','Post','Post inventory documents to the ledger'),
 ('inventory.reverse','inventory','Reverse','Reverse posted inventory documents'),('inventory.backdate','inventory','Backdate','Use a prior business date'),
 ('inventory.negative_stock_override','inventory','Override negative stock','Authorise audited negative stock'),('inventory.view_cost','inventory','View inventory cost','View costs and inventory valuation'),
 ('inventory.export','inventory','Export inventory','Export inventory reports'),('inventory.print','inventory','Print inventory','Print inventory documents')
on conflict(permission_key) do update set name=excluded.name,description=excluded.description;
insert into public.role_permissions(role_id,permission_id,company_id,is_allowed)
select r.id,p.id,r.company_id,true from public.roles r cross join public.permissions p where r.code in ('OWNER','ADMIN') and p.permission_key like 'inventory.%'
on conflict(role_id,permission_id) do update set is_allowed=true;

create function public.validate_inventory_item() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.inventory_documents%rowtype; src public.stock_locations%rowtype; dst public.stock_locations%rowtype;
begin
 select * into d from public.inventory_documents where id=new.inventory_document_id;
 if not found or d.company_id<>new.company_id then raise exception 'Invalid inventory document company'; end if;
 if d.status<>'draft' then raise exception 'Items can only be changed while the document is draft'; end if;
 select * into src from public.stock_locations where id=new.source_location_id and company_id=new.company_id;
 if not found or src.warehouse_id<>d.warehouse_id or src.branch_id<>d.branch_id then raise exception 'Source location does not belong to the document warehouse'; end if;
 if d.document_type='stock_transfer' then
  if new.destination_location_id is null then raise exception 'Destination location is required for transfers'; end if;
  select * into dst from public.stock_locations where id=new.destination_location_id and company_id=new.company_id;
  if not found or dst.warehouse_id<>d.destination_warehouse_id or dst.branch_id<>d.destination_branch_id then raise exception 'Invalid transfer destination location'; end if;
  if new.destination_location_id=new.source_location_id then raise exception 'Transfer destination must differ from source'; end if;
 elsif new.destination_location_id is not null then raise exception 'Destination location is only valid for transfers'; end if;
 if not exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id and p.company_id=v.company_id where v.id=new.product_variant_id and v.company_id=new.company_id and v.deleted_at is null and p.track_stock) then raise exception 'Invalid or non-stock product variant'; end if;
 new.created_by:=coalesce(new.created_by,auth.uid()); return new;
end $$;
create trigger inventory_items_validate before insert or update on public.inventory_document_items for each row execute function public.validate_inventory_item();
create trigger inventory_documents_created_by before insert on public.inventory_documents for each row execute function public.set_created_by();
create trigger inventory_documents_audit after insert or update on public.inventory_documents for each row execute function public.write_audit_log();
create trigger inventory_items_audit after insert or update or delete on public.inventory_document_items for each row execute function public.write_audit_log();
