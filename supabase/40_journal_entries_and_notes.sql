-- Migration 40: Manual Journal Entries & Debit/Credit Adjustment Notes

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  entry_number text not null check (btrim(entry_number) <> ''),
  entry_date date not null default current_date,
  description text not null check (btrim(description) <> ''),
  reference_type text,
  reference_id uuid,
  total_debit numeric(18,2) not null default 0 check (total_debit >= 0),
  total_credit numeric(18,2) not null default 0 check (total_credit >= 0),
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  unique (company_id, entry_number),
  unique (company_id, id),
  constraint journal_entries_branch_company_fk foreign key (company_id, branch_id) references public.branches(company_id, id) on delete restrict,
  constraint journal_entries_balanced_check check (
    status <> 'posted' or total_debit = total_credit
  )
);

create index journal_entries_company_branch_idx on public.journal_entries(company_id, branch_id);
create index journal_entries_status_idx on public.journal_entries(company_id, status);

create table public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  description text,
  debit numeric(18,2) not null default 0 check (debit >= 0),
  credit numeric(18,2) not null default 0 check (credit >= 0),
  partner_type text check (partner_type in ('customer', 'vendor', 'staff', 'none')),
  partner_id uuid,
  created_at timestamptz not null default now(),
  constraint journal_entry_lines_one_side_check check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  ),
  constraint journal_entry_lines_account_company_fk foreign key (company_id, account_id) references public.chart_of_accounts(company_id, id) on delete restrict
);

create index journal_entry_lines_entry_idx on public.journal_entry_lines(journal_entry_id);
create index journal_entry_lines_account_idx on public.journal_entry_lines(company_id, account_id);

create table public.debit_credit_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  note_number text not null check (btrim(note_number) <> ''),
  note_type text not null check (note_type in ('debit_note', 'credit_note')),
  entity_type text not null check (entity_type in ('customer', 'vendor')),
  entity_id uuid not null,
  note_date date not null default current_date,
  amount numeric(18,2) not null check (amount > 0),
  reason text not null check (btrim(reason) <> ''),
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  unique (company_id, note_number),
  unique (company_id, id),
  constraint debit_credit_notes_branch_company_fk foreign key (company_id, branch_id) references public.branches(company_id, id) on delete restrict
);

create index debit_credit_notes_company_entity_idx on public.debit_credit_notes(company_id, entity_type, entity_id);
