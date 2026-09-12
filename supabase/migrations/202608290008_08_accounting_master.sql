-- Chart and account mappings only; no journals or ledger transactions
create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  account_code text not null check (btrim(account_code) <> ''),
  account_name text not null check (btrim(account_name) <> ''),
  account_type public.account_type not null,
  normal_balance public.normal_balance not null,
  parent_account_id uuid,
  is_control_account boolean not null default false,
  is_system_account boolean not null default false,
  allow_manual_entries boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, account_code),
  unique (company_id, id),
  constraint chart_parent_company_fk foreign key (company_id, parent_account_id) references public.chart_of_accounts(company_id, id) on delete restrict,
  constraint chart_not_own_parent_check check (parent_account_id is null or parent_account_id <> id)
);
create index chart_company_type_idx on public.chart_of_accounts(company_id, account_type) where is_active;
create index chart_parent_idx on public.chart_of_accounts(company_id, parent_account_id);

create function public.prevent_account_cycle() returns trigger
language plpgsql set search_path = '' as $$
declare found_cycle boolean;
begin
  if new.parent_account_id is null then return new; end if;
  with recursive ancestors(id, parent_account_id) as (
    select c.id, c.parent_account_id from public.chart_of_accounts c where c.id = new.parent_account_id and c.company_id = new.company_id
    union all
    select c.id, c.parent_account_id from public.chart_of_accounts c join ancestors a on c.id = a.parent_account_id where c.company_id = new.company_id
  )
  select exists(select 1 from ancestors where id = new.id) into found_cycle;
  if found_cycle then raise exception 'Circular chart-of-accounts hierarchy is not allowed'; end if;
  return new;
end;
$$;
create trigger chart_prevent_cycle before insert or update of parent_account_id on public.chart_of_accounts for each row execute function public.prevent_account_cycle();

create table public.account_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mapping_key text not null check (mapping_key in (
    'cash_in_hand', 'accounts_receivable', 'inventory', 'bank', 'accounts_payable',
    'sales_revenue', 'sales_returns', 'cost_of_goods_sold', 'purchase_returns',
    'discounts_allowed', 'discounts_received', 'expenses', 'retained_earnings',
    'customer_advances', 'supplier_advances'
  )),
  account_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, mapping_key),
  constraint account_mappings_account_company_fk foreign key (company_id, account_id) references public.chart_of_accounts(company_id, id) on delete restrict
);
create index account_mappings_account_idx on public.account_mappings(company_id, account_id);

alter table public.bank_accounts add constraint bank_accounts_ledger_company_fk
  foreign key (company_id, ledger_account_id) references public.chart_of_accounts(company_id, id) on delete restrict;