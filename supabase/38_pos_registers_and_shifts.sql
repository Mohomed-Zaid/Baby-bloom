-- Migration 38: POS Registers / Counters and Shift Sessions

create table public.pos_registers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  register_code text not null check (btrim(register_code) <> ''),
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default true,
  is_locked boolean not null default false,
  current_cashier_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, branch_id, register_code),
  unique (company_id, id),
  constraint pos_registers_branch_company_fk foreign key (company_id, branch_id) references public.branches(company_id, id) on delete restrict
);

create index pos_registers_branch_idx on public.pos_registers(company_id, branch_id) where is_active;

create table public.pos_shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  register_id uuid not null references public.pos_registers(id) on delete restrict,
  cashier_id uuid not null references public.profiles(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_balance numeric(18,2) not null default 0 check (opening_balance >= 0),
  closing_balance_expected numeric(18,2) default 0,
  closing_balance_actual numeric(18,2) default 0,
  cash_sales numeric(18,2) not null default 0,
  card_sales numeric(18,2) not null default 0,
  cheque_sales numeric(18,2) not null default 0,
  status text not null default 'open' check (status in ('open', 'closed', 'reconciled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint pos_shifts_branch_company_fk foreign key (company_id, branch_id) references public.branches(company_id, id) on delete restrict,
  constraint pos_shifts_register_company_fk foreign key (company_id, register_id) references public.pos_registers(company_id, id) on delete restrict
);

-- Index for fast lookup of active/open shifts per register
create unique index pos_shifts_one_open_per_register_uidx on public.pos_shifts(company_id, register_id) where status = 'open';
create index pos_shifts_cashier_idx on public.pos_shifts(company_id, cashier_id);
