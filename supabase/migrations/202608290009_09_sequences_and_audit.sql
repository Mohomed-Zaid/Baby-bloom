-- Atomic document numbering and append-only audit storage
create table public.number_sequences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null,
  sequence_type public.sequence_type not null,
  prefix text not null default '',
  next_number bigint not null default 1 check (next_number > 0),
  padding_length smallint not null default 6 check (padding_length between 1 and 18),
  reset_frequency text not null default 'never' check (reset_frequency in ('never', 'daily', 'monthly', 'yearly')),
  last_reset_date date,
  updated_at timestamptz not null default now(),
  unique (company_id, branch_id, sequence_type),
  constraint number_sequences_branch_company_fk foreign key (company_id, branch_id) references public.branches(company_id, id) on delete cascade
);
create index number_sequences_branch_idx on public.number_sequences(company_id, branch_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  module text not null,
  table_name text not null,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint audit_logs_branch_company_fk foreign key (company_id, branch_id) references public.branches(company_id, id) on delete restrict
);
create index audit_logs_company_created_idx on public.audit_logs(company_id, created_at desc);
create index audit_logs_company_record_idx on public.audit_logs(company_id, table_name, record_id);
create index audit_logs_user_idx on public.audit_logs(user_id, created_at desc);