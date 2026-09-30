-- ==============================================================================
-- CONSOLIDATED CUSTOMERS & CUSTOMER REGISTRATION RESET SCRIPT
-- ==============================================================================
-- This script ensures all customer master columns, indexes, triggers,
-- RLS policies, and default records match the eMark dark-teal system.
-- Safe to run in Supabase SQL Editor.
-- ==============================================================================

-- 1. ADD / ENSURE REQUIRED COLUMNS ON public.customers
alter table public.customers add column if not exists nick_name text;
alter table public.customers add column if not exists nic text;
alter table public.customers add column if not exists area text;
alter table public.customers add column if not exists join_date date default current_date;
alter table public.customers add column if not exists payment_plan text default 'None';
alter table public.customers add column if not exists vat_no text;
alter table public.customers add column if not exists vat_percentage numeric(7,4) default 0;
alter table public.customers add column if not exists discount_level text default 'none';
alter table public.customers add column if not exists dealer_code text;
alter table public.customers add column if not exists sales_rep_id uuid references auth.users(id) on delete set null;
alter table public.customers add column if not exists sales_rep_name text;

-- 2. CREATE PERFORMANCE & SEARCH INDEXES
create index if not exists customers_company_code_idx on public.customers(company_id, customer_code);
create index if not exists customers_company_name_idx on public.customers(company_id, name) where deleted_at is null;
create index if not exists customers_company_phone_idx on public.customers(company_id, phone) where deleted_at is null;
create index if not exists customers_company_nic_idx on public.customers(company_id, nic) where deleted_at is null and nic is not null;
create index if not exists customers_company_area_idx on public.customers(company_id, area) where deleted_at is null and area is not null;

-- 3. ENSURE CUSTOMER PERMISSIONS
insert into public.permissions(permission_key, module, name, description) values
  ('customers.view', 'customers', 'View Customers', 'View customer details and balances'),
  ('customers.create', 'customers', 'Create Customers', 'Register new customers'),
  ('customers.update', 'customers', 'Update Customers', 'Edit existing customer profiles'),
  ('customers.delete', 'customers', 'Delete Customers', 'Archive or delete customers')
on conflict(permission_key) do update set module=excluded.module, name=excluded.name, description=excluded.description;

insert into public.role_permissions(role_id, permission_id, company_id, is_allowed)
select r.id, p.id, r.company_id, true from public.roles r cross join public.permissions p
where r.code in ('OWNER', 'ADMIN') and p.permission_key like 'customers.%'
on conflict(role_id, permission_id) do update set is_allowed=true;

-- 4. ROW LEVEL SECURITY (RLS) POLICIES
alter table public.customers enable row level security;

revoke all on public.customers from anon;
grant select, insert, update, delete on public.customers to authenticated;

drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers for select to authenticated
  using (company_id = public.current_user_company_id() and deleted_at is null and public.user_has_permission('customers.view'));

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers for insert to authenticated
  with check (company_id = public.current_user_company_id() and public.user_has_permission('customers.create'));

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers for update to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_permission('customers.update'))
  with check (company_id = public.current_user_company_id());

drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers for delete to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_permission('customers.delete'));

-- 5. AUDIT LOGGING TRIGGER
drop trigger if exists customers_audit on public.customers;
create trigger customers_audit
  after insert or update or delete on public.customers
  for each row execute function public.write_audit_log();

-- 6. OPENING BALANCE TRIGGER (If customer ledger entries exist)
create or replace function public.customer_opening_balance_entry() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.opening_balance > 0 and exists (select 1 from pg_tables where schemaname='public' and tablename='customer_ledger_entries') then
    insert into public.customer_ledger_entries(
      company_id, branch_id, customer_id, entry_date, entry_type, reference_type,
      reference_id, reference_number, debit_amount, credit_amount, notes, created_by
    )
    values(
      new.company_id, new.branch_id, new.id, (now() at time zone 'Asia/Colombo')::date,
      'opening_balance', 'customer', new.id, new.customer_code,
      case when new.opening_balance_type = 'debit' then new.opening_balance else 0 end,
      case when new.opening_balance_type = 'credit' then new.opening_balance else 0 end,
      'Customer opening balance', new.created_by
    );
  end if;
  return new;
end $$;

drop trigger if exists customers_opening_ledger on public.customers;
create trigger customers_opening_ledger
  after insert on public.customers
  for each row execute function public.customer_opening_balance_entry();

-- 7. SEED DEFAULT WALK-IN CASH CUSTOMER (If none exists for each company & branch)
insert into public.customers (
  company_id, branch_id, customer_code, customer_type, name, nick_name,
  phone, address, city, area, is_active, credit_limit, credit_days, price_level
)
select
  b.company_id, b.id, '5000', 'retail', 'Cash Customer', 'Walk-in',
  '0770000000', 'Counter Sales', 'Colombo', 'Colombo', true, 0, 0, 'retail'
from public.branches b
where not exists (
  select 1 from public.customers c
  where c.company_id = b.company_id and (c.customer_code = '5000' or lower(c.name) = 'cash customer')
)
on conflict do nothing;

-- 8. SERVICE ROLE PRIVILEGES
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines in schema public to service_role;
