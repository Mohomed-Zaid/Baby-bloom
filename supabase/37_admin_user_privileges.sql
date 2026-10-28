-- Migration 37: User privileges and granular permissions

create table public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  is_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, permission_id),
  constraint user_permissions_user_company_fk foreign key (company_id, user_id) references public.profiles(company_id, id) on delete cascade
);

create index user_permissions_company_user_idx on public.user_permissions(company_id, user_id);

-- Register Phase 7 permission keys into global permission catalogue
insert into public.permissions (permission_key, module, name, description)
values
  ('admin.users', 'admin', 'Manage Staff Users', 'Allows managing user profiles and status'),
  ('admin.roles', 'admin', 'Manage Roles', 'Allows managing security roles'),
  ('admin.privileges', 'admin', 'Manage Privileges', 'Allows assigning page, control, and report rights'),
  ('admin.branches', 'admin', 'Manage Branches', 'Allows creating and editing business branches'),
  ('admin.counters', 'admin', 'Manage Registers & Counters', 'Allows register administration and counter setup'),
  ('admin.register_sessions', 'admin', 'Manage Register Shifts', 'Allows opening, closing, and reconciling shift sessions'),
  ('cheques.view', 'cheques', 'View Cheque Registry', 'Allows viewing inbound and outbound cheques'),
  ('cheques.create', 'cheques', 'Issue Cheques', 'Allows registering and issuing cheque instruments'),
  ('cheques.deposit', 'cheques', 'Deposit Cheques', 'Allows marking cheques as deposited to bank'),
  ('cheques.clear', 'cheques', 'Clear Cheques', 'Allows marking cheques as cleared/realized'),
  ('cheques.return', 'cheques', 'Return / Bounce Cheques', 'Allows marking cheques as returned or bounced'),
  ('cheques.cancel', 'cheques', 'Cancel Cheques', 'Allows cancelling issued cheques'),
  ('banking.cheque_books', 'banking', 'Manage Cheque Books', 'Allows managing cheque book registries'),
  ('banking.cards', 'banking', 'Manage Bank Cards', 'Allows managing bank debit/credit card records'),
  ('banking.transfers', 'banking', 'Bank Transfers', 'Allows recording funds transfers between bank accounts'),
  ('accounting.journals', 'accounting', 'Manage Journal Entries', 'Allows creating and posting manual double-entry journals'),
  ('accounting.debit_credit_notes', 'accounting', 'Manage Adjustment Notes', 'Allows issuing Debit and Credit Notes'),
  ('accounting.reports', 'accounting', 'View Financial Reports', 'Allows viewing Trial Balance, Day Book, P&L, and Expense summaries')
on conflict (permission_key) do nothing;

-- Function to check granular permission combining user-level overrides with role-level permissions
create or replace function public.user_has_granular_permission(
  p_user_id uuid,
  p_permission_key text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user_override boolean;
  v_role_allowed boolean;
begin
  -- 1. Check direct user override
  select is_allowed into v_user_override
  from public.user_permissions up
  join public.permissions p on p.id = up.permission_id
  where up.user_id = p_user_id and p.permission_key = p_permission_key;

  if v_user_override is not null then
    return v_user_override;
  end if;

  -- 2. Fall back to role permissions
  select coalesce(bool_or(rp.is_allowed), false) into v_role_allowed
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.permissions p on p.id = rp.permission_id
  where ur.user_id = p_user_id and p.permission_key = p_permission_key;

  return coalesce(v_role_allowed, false);
end;
$$;
