-- Migration 39: Cheque Book Registry, Cheque Lifecycle & Bank Cards

create table public.cheque_books (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  book_number text not null check (btrim(book_number) <> ''),
  start_number text not null check (btrim(start_number) <> ''),
  end_number text not null check (btrim(end_number) <> ''),
  current_number text not null check (btrim(current_number) <> ''),
  status text not null default 'active' check (status in ('active', 'exhausted', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, bank_account_id, book_number),
  unique (company_id, id),
  constraint cheque_books_branch_company_fk foreign key (company_id, branch_id) references public.branches(company_id, id) on delete restrict,
  constraint cheque_books_bank_account_company_fk foreign key (company_id, bank_account_id) references public.bank_accounts(company_id, id) on delete restrict
);

create table public.cheques (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  direction text not null check (direction in ('inbound', 'outbound')),
  bank_account_id uuid references public.bank_accounts(id) on delete restrict,
  cheque_book_id uuid references public.cheque_books(id) on delete restrict,
  cheque_number text not null check (btrim(cheque_number) <> ''),
  payee_payor_name text not null check (btrim(payee_payor_name) <> ''),
  bank_name text,
  amount numeric(18,2) not null check (amount > 0),
  issue_date date not null default current_date,
  due_date date not null default current_date,
  status text not null default 'in_hand' check (status in ('in_hand', 'deposited', 'cleared', 'returned', 'cancelled')),
  deposit_date date,
  clear_date date,
  return_reason text,
  reference_type text check (reference_type in ('invoice', 'purchase', 'customer_payment', 'vendor_payment', 'journal', 'direct')),
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint cheques_branch_company_fk foreign key (company_id, branch_id) references public.branches(company_id, id) on delete restrict
);

create unique index cheques_company_number_direction_bank_uidx on public.cheques(company_id, cheque_number, direction, coalesce(bank_account_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index cheques_status_idx on public.cheques(company_id, status);
create index cheques_direction_idx on public.cheques(company_id, direction);

create table public.bank_cards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  card_holder text not null check (btrim(card_holder) <> ''),
  card_number_last4 text not null check (card_number_last4 ~ '^[0-9]{4}$'),
  card_type text not null check (card_type in ('debit', 'credit')),
  expiry_month integer not null check (expiry_month between 1 and 12),
  expiry_year integer not null check (expiry_year >= 2024),
  status text not null default 'active' check (status in ('active', 'blocked', 'expired')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, id),
  constraint bank_cards_branch_company_fk foreign key (company_id, branch_id) references public.branches(company_id, id) on delete restrict,
  constraint bank_cards_bank_account_company_fk foreign key (company_id, bank_account_id) references public.bank_accounts(company_id, id) on delete restrict
);

create index bank_cards_bank_account_idx on public.bank_cards(company_id, bank_account_id);
