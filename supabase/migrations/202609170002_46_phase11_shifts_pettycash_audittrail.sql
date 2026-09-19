-- Migration 46: Phase 11 Shift Management, Cash Drawer Reconciliation (Z-Report), Petty Cash Vouchers & Security Audit Trail

-- ============================================================================
-- 1. POS Register Sessions & Cash Drawer Movements
-- ============================================================================

create table if not exists public.pos_register_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  cashier_id uuid not null references public.profiles(id) on delete restrict,
  terminal_name text not null check (btrim(terminal_name) <> ''),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash_float numeric(18,2) not null default 0 check (opening_cash_float >= 0),
  closing_cash_counted numeric(18,2) check (closing_cash_counted is null or closing_cash_counted >= 0),
  expected_cash_balance numeric(18,2),
  cash_difference numeric(18,2),
  total_sales_cash numeric(18,2) not null default 0 check (total_sales_cash >= 0),
  total_sales_card numeric(18,2) not null default 0 check (total_sales_card >= 0),
  total_sales_credit numeric(18,2) not null default 0 check (total_sales_credit >= 0),
  total_sales_cheque numeric(18,2) not null default 0 check (total_sales_cheque >= 0),
  status text not null default 'open' check (status in ('open', 'closed', 'audited')),
  auto_journal_id uuid references public.journal_entries(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

-- Enforce rule: Only one active open session allowed per cashier and branch at a time
create unique index if not exists pos_register_sessions_cashier_open_uidx 
  on public.pos_register_sessions(company_id, branch_id, cashier_id) 
  where status = 'open';

create index if not exists pos_register_sessions_branch_status_idx 
  on public.pos_register_sessions(company_id, branch_id, status);

create index if not exists pos_register_sessions_cashier_idx 
  on public.pos_register_sessions(company_id, cashier_id, opened_at desc);

-- Cash Movements Table
create table if not exists public.pos_register_cash_movements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pos_register_sessions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  movement_type text not null check (movement_type in ('cash_in', 'cash_out', 'drop_to_safe', 'float_adjustment')),
  amount numeric(18,2) not null check (amount > 0),
  reason text not null check (btrim(reason) <> ''),
  authorized_by_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);

create index if not exists pos_register_cash_movements_session_idx 
  on public.pos_register_cash_movements(session_id, created_at asc);

-- ============================================================================
-- 2. Petty Cash Management
-- ============================================================================

create table if not exists public.petty_cash_vouchers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  voucher_number text not null check (btrim(voucher_number) <> ''),
  voucher_date date not null default current_date,
  expense_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  payee text not null check (btrim(payee) <> ''),
  amount numeric(18,2) not null check (amount > 0),
  description text not null check (btrim(description) <> ''),
  receipt_attachment_url text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'posted', 'reimbursed')),
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, voucher_number),
  unique (company_id, id)
);

create index if not exists petty_cash_vouchers_branch_date_idx 
  on public.petty_cash_vouchers(company_id, branch_id, voucher_date desc);

create index if not exists petty_cash_vouchers_status_idx 
  on public.petty_cash_vouchers(company_id, status);

-- ============================================================================
-- 3. Comprehensive System Audit Log
-- ============================================================================

create table if not exists public.system_audit_trail (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'login', 'session_open', 'session_close', 'invoice_void', 'price_override',
    'manual_journal', 'cheque_bounce', 'stock_reversal', 'cash_movement',
    'petty_cash_post', 'user_privilege_change', 'other'
  )),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  target_table text,
  target_id uuid,
  ip_address inet,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists system_audit_trail_company_idx 
  on public.system_audit_trail(company_id, created_at desc);

create index if not exists system_audit_trail_event_idx 
  on public.system_audit_trail(company_id, event_type, created_at desc);

create index if not exists system_audit_trail_severity_idx 
  on public.system_audit_trail(company_id, severity, created_at desc);

create index if not exists system_audit_trail_user_idx 
  on public.system_audit_trail(company_id, user_id, created_at desc);

-- Enforce immutability trigger preventing UPDATE or DELETE
create or replace function public.prevent_audit_trail_modification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'System audit trail records are immutable and cannot be updated or deleted';
end;
$$;

drop trigger if exists system_audit_trail_immutable on public.system_audit_trail;
create trigger system_audit_trail_immutable
  before update or delete on public.system_audit_trail
  for each row execute function public.prevent_audit_trail_modification();

-- ============================================================================
-- 4. Enable Row Level Security (RLS)
-- ============================================================================

alter table public.pos_register_sessions enable row level security;
alter table public.pos_register_cash_movements enable row level security;
alter table public.petty_cash_vouchers enable row level security;
alter table public.system_audit_trail enable row level security;

-- Policies for pos_register_sessions
create policy "pos_register_sessions_select" on public.pos_register_sessions
  for select using (company_id = public.current_user_company_id());

create policy "pos_register_sessions_insert" on public.pos_register_sessions
  for insert with check (company_id = public.current_user_company_id());

create policy "pos_register_sessions_update" on public.pos_register_sessions
  for update using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

-- Policies for pos_register_cash_movements
create policy "pos_register_cash_movements_select" on public.pos_register_cash_movements
  for select using (company_id = public.current_user_company_id());

create policy "pos_register_cash_movements_insert" on public.pos_register_cash_movements
  for insert with check (company_id = public.current_user_company_id());

-- Policies for petty_cash_vouchers
create policy "petty_cash_vouchers_select" on public.petty_cash_vouchers
  for select using (company_id = public.current_user_company_id());

create policy "petty_cash_vouchers_insert" on public.petty_cash_vouchers
  for insert with check (company_id = public.current_user_company_id());

create policy "petty_cash_vouchers_update" on public.petty_cash_vouchers
  for update using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

create policy "petty_cash_vouchers_delete" on public.petty_cash_vouchers
  for delete using (company_id = public.current_user_company_id() and status = 'draft');

-- Policies for system_audit_trail (Select and Insert only)
create policy "system_audit_trail_select" on public.system_audit_trail
  for select using (company_id = public.current_user_company_id());

create policy "system_audit_trail_insert" on public.system_audit_trail
  for insert with check (company_id = public.current_user_company_id());

-- ============================================================================
-- 5. Global Permissions Registration
-- ============================================================================

insert into public.permissions (permission_key, module, name, description)
values
  ('shifts.view', 'pos', 'View POS Shift History', 'Allows viewing cash register shift history and Z-Reports'),
  ('shifts.manage', 'pos', 'Manage Active Shifts', 'Allows opening shifts and recording drawer cash movements'),
  ('shifts.close', 'pos', 'Close Shift & Z-Report', 'Allows closing shifts and performing drawer cash reconciliation'),
  ('petty_cash.view', 'finance', 'View Petty Cash Ledger', 'Allows viewing petty cash vouchers and balances'),
  ('petty_cash.create', 'finance', 'Create Petty Cash Voucher', 'Allows submitting new petty cash expense claims'),
  ('petty_cash.approve', 'finance', 'Approve Petty Cash Vouchers', 'Allows approving petty cash claims for disbursement'),
  ('petty_cash.post', 'finance', 'Post Petty Cash to General Ledger', 'Allows posting vouchers and replenishing float'),
  ('audit.view', 'admin', 'View System Audit Trail', 'Allows viewing security audit logs and inspection diffs')
on conflict (permission_key) do nothing;

-- ============================================================================
-- 6. Helper Function: Audit Log Writer
-- ============================================================================

create or replace function public.log_system_audit_event(
  p_branch_id uuid,
  p_event_type text,
  p_severity text,
  p_target_table text,
  p_target_id uuid,
  p_old_values jsonb default null,
  p_new_values jsonb default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_log_id uuid;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null then
    return null;
  end if;

  insert into public.system_audit_trail (
    company_id, branch_id, user_id, event_type, severity,
    target_table, target_id, old_values, new_values, metadata
  ) values (
    v_company_id, p_branch_id, auth.uid(), p_event_type, coalesce(p_severity, 'info'),
    p_target_table, p_target_id, p_old_values, p_new_values, p_metadata
  ) returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.log_system_audit_event(uuid, text, text, text, uuid, jsonb, jsonb, jsonb) to authenticated;

-- ============================================================================
-- 7. Transactional RPC: Open POS Session
-- ============================================================================

create or replace function public.open_pos_session(
  p_branch_id uuid,
  p_opening_float numeric,
  p_terminal_name text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_cashier_id uuid;
  v_existing_session_id uuid;
  v_session public.pos_register_sessions%rowtype;
  v_movement_id uuid;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null then
    raise exception 'Unauthorized: No active company context';
  end if;

  v_cashier_id := auth.uid();
  if v_cashier_id is null then
    raise exception 'Unauthorized: User is not authenticated';
  end if;

  if coalesce(p_opening_float, 0) < 0 then
    raise exception 'Opening float cannot be negative';
  end if;

  if p_terminal_name is null or btrim(p_terminal_name) = '' then
    raise exception 'Terminal name is required';
  end if;

  -- Verify branch access
  if not public.user_can_transact_in_branch(p_branch_id) then
    raise exception 'User not authorized to transact in this branch';
  end if;

  -- Check if cashier already has an active open session in this branch
  select id into v_existing_session_id
  from public.pos_register_sessions
  where company_id = v_company_id
    and branch_id = p_branch_id
    and cashier_id = v_cashier_id
    and status = 'open'
  limit 1;

  if v_existing_session_id is not null then
    raise exception 'You already have an active open shift session (ID: %). Please close it first.', v_existing_session_id;
  end if;

  -- Create new POS register session
  insert into public.pos_register_sessions (
    company_id, branch_id, cashier_id, terminal_name,
    opened_at, opening_cash_float, status
  ) values (
    v_company_id, p_branch_id, v_cashier_id, btrim(p_terminal_name),
    now(), coalesce(p_opening_float, 0), 'open'
  ) returning * into v_session;

  -- Log initial float movement if > 0
  if coalesce(p_opening_float, 0) > 0 then
    insert into public.pos_register_cash_movements (
      session_id, company_id, branch_id, movement_type,
      amount, reason, authorized_by_id
    ) values (
      v_session.id, v_company_id, p_branch_id, 'float_adjustment',
      p_opening_float, 'Opening Cash Float', v_cashier_id
    ) returning id into v_movement_id;
  end if;

  -- Audit trail
  perform public.log_system_audit_event(
    p_branch_id, 'session_open', 'info',
    'pos_register_sessions', v_session.id,
    null,
    jsonb_build_object(
      'terminal_name', v_session.terminal_name,
      'opening_cash_float', v_session.opening_cash_float,
      'opened_at', v_session.opened_at
    ),
    jsonb_build_object('action', 'Shift Opened')
  );

  return jsonb_build_object(
    'success', true,
    'session_id', v_session.id,
    'terminal_name', v_session.terminal_name,
    'opened_at', v_session.opened_at,
    'opening_cash_float', v_session.opening_cash_float,
    'status', v_session.status
  );
end;
$$;

grant execute on function public.open_pos_session(uuid, numeric, text) to authenticated;

-- ============================================================================
-- 8. Transactional RPC: Record POS Cash Movement (Cash-In, Cash-Out, Safe Drop)
-- ============================================================================

create or replace function public.record_pos_cash_movement(
  p_session_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_reason text,
  p_authorized_by_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.pos_register_sessions%rowtype;
  v_movement_id uuid;
begin
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Cash movement amount must be greater than 0';
  end if;

  if p_movement_type not in ('cash_in', 'cash_out', 'drop_to_safe', 'float_adjustment') then
    raise exception 'Invalid movement type: %', p_movement_type;
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Reason is required for cash movement';
  end if;

  select * into v_session
  from public.pos_register_sessions
  where id = p_session_id and company_id = public.current_user_company_id()
  for update;

  if not found then
    raise exception 'POS session not found';
  end if;

  if v_session.status <> 'open' then
    raise exception 'Cannot record cash movement on a closed or audited session';
  end if;

  insert into public.pos_register_cash_movements (
    session_id, company_id, branch_id, movement_type,
    amount, reason, authorized_by_id
  ) values (
    v_session.id, v_session.company_id, v_session.branch_id, p_movement_type,
    p_amount, btrim(p_reason), coalesce(p_authorized_by_id, auth.uid())
  ) returning id into v_movement_id;

  -- Audit trail
  perform public.log_system_audit_event(
    v_session.branch_id, 'cash_movement', 'info',
    'pos_register_cash_movements', v_movement_id,
    null,
    jsonb_build_object(
      'session_id', v_session.id,
      'movement_type', p_movement_type,
      'amount', p_amount,
      'reason', p_reason,
      'authorized_by_id', coalesce(p_authorized_by_id, auth.uid())
    )
  );

  return jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'session_id', v_session.id,
    'movement_type', p_movement_type,
    'amount', p_amount
  );
end;
$$;

grant execute on function public.record_pos_cash_movement(uuid, text, numeric, text, uuid) to authenticated;

-- ============================================================================
-- 9. Transactional RPC: Close POS Session & Generate Z-Report
-- ============================================================================

create or replace function public.close_pos_session(
  p_session_id uuid,
  p_counted_cash numeric,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.pos_register_sessions%rowtype;
  v_company_id uuid;
  v_sales_cash numeric(18,2) := 0;
  v_sales_card numeric(18,2) := 0;
  v_sales_credit numeric(18,2) := 0;
  v_sales_cheque numeric(18,2) := 0;
  v_cash_in numeric(18,2) := 0;
  v_cash_out numeric(18,2) := 0;
  v_safe_drops numeric(18,2) := 0;
  v_float_adj numeric(18,2) := 0;
  v_expected_cash numeric(18,2) := 0;
  v_variance numeric(18,2) := 0;
  v_auto_je_id uuid := null;
  v_je_number text;
  v_cash_acc_id uuid := null;
  v_variance_acc_id uuid := null;
  v_cashier_name text := '';
  v_branch_name text := '';
  v_company_name text := '';
  v_invoice_count integer := 0;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null then
    raise exception 'Unauthorized';
  end if;

  if coalesce(p_counted_cash, 0) < 0 then
    raise exception 'Counted cash cannot be negative';
  end if;

  select * into v_session
  from public.pos_register_sessions
  where id = p_session_id and company_id = v_company_id
  for update;

  if not found then
    raise exception 'POS session not found';
  end if;

  if v_session.status <> 'open' then
    raise exception 'Session is already closed or audited';
  end if;

  -- 1. Aggregate Sales by tender during session timeframe
  -- Cash payments
  select coalesce(sum(p.amount), 0), count(distinct p.invoice_id)
  into v_sales_cash, v_invoice_count
  from public.invoice_payments p
  join public.sales_invoices si on si.id = p.invoice_id
  where p.company_id = v_company_id
    and p.branch_id = v_session.branch_id
    and p.status = 'posted'
    and p.payment_method = 'cash'
    and p.created_at >= v_session.opened_at
    and p.created_at <= now()
    and (si.cashier_id = v_session.cashier_id or si.created_by = v_session.cashier_id);

  -- Card payments
  select coalesce(sum(p.amount), 0)
  into v_sales_card
  from public.invoice_payments p
  join public.sales_invoices si on si.id = p.invoice_id
  where p.company_id = v_company_id
    and p.branch_id = v_session.branch_id
    and p.status = 'posted'
    and p.payment_method = 'card'
    and p.created_at >= v_session.opened_at
    and p.created_at <= now()
    and (si.cashier_id = v_session.cashier_id or si.created_by = v_session.cashier_id);

  -- Cheque payments
  select coalesce(sum(p.amount), 0)
  into v_sales_cheque
  from public.invoice_payments p
  join public.sales_invoices si on si.id = p.invoice_id
  where p.company_id = v_company_id
    and p.branch_id = v_session.branch_id
    and p.status = 'posted'
    and p.payment_method = 'cheque'
    and p.created_at >= v_session.opened_at
    and p.created_at <= now()
    and (si.cashier_id = v_session.cashier_id or si.created_by = v_session.cashier_id);

  -- Unpaid / Credit sales balance
  select coalesce(sum(si.balance_amount), 0)
  into v_sales_credit
  from public.sales_invoices si
  where si.company_id = v_company_id
    and si.branch_id = v_session.branch_id
    and si.status = 'posted'
    and si.created_at >= v_session.opened_at
    and si.created_at <= now()
    and (si.cashier_id = v_session.cashier_id or si.created_by = v_session.cashier_id);

  -- 2. Aggregate Cash Drawer movements during session (excluding initial float movement)
  select
    coalesce(sum(case when movement_type = 'cash_in' then amount else 0 end), 0),
    coalesce(sum(case when movement_type = 'cash_out' then amount else 0 end), 0),
    coalesce(sum(case when movement_type = 'drop_to_safe' then amount else 0 end), 0),
    coalesce(sum(case when movement_type = 'float_adjustment' and id <> (
      select id from public.pos_register_cash_movements where session_id = v_session.id order by created_at asc limit 1
    ) then amount else 0 end), 0)
  into v_cash_in, v_cash_out, v_safe_drops, v_float_adj
  from public.pos_register_cash_movements
  where session_id = v_session.id;

  -- 3. Compute Expected Cash Balance & Variance
  v_expected_cash := v_session.opening_cash_float + v_sales_cash + v_cash_in + v_float_adj - v_cash_out - v_safe_drops;
  v_variance := round(p_counted_cash - v_expected_cash, 2);

  -- 4. Auto-journal entry for variance if non-zero
  if abs(v_variance) > 0.005 then
    -- Find Cash in Hand account
    select account_id into v_cash_acc_id
    from public.account_mappings
    where company_id = v_company_id and mapping_key = 'cash_in_hand';

    if v_cash_acc_id is null then
      select id into v_cash_acc_id
      from public.chart_of_accounts
      where company_id = v_company_id and account_code in ('1000', '1010', '1020') and is_active
      order by account_code asc limit 1;
    end if;

    -- Find or identify Over/Short or Expense account
    select id into v_variance_acc_id
    from public.chart_of_accounts
    where company_id = v_company_id and (account_name ilike '%shortage%' or account_name ilike '%overage%' or account_name ilike '%cash over%' or account_code = '5090') and is_active
    limit 1;

    if v_variance_acc_id is null then
      select id into v_variance_acc_id
      from public.chart_of_accounts
      where company_id = v_company_id and account_type = 'expense' and is_active
      order by account_code asc limit 1;
    end if;

    if v_cash_acc_id is not null and v_variance_acc_id is not null then
      v_je_number := 'JE-Z-' || to_char(now(), 'YYYYMMDD-HH24MISS');
      
      insert into public.journal_entries (
        company_id, branch_id, entry_number, entry_date, description,
        reference_type, reference_id, total_debit, total_credit,
        status, created_by, posted_at, posted_by
      ) values (
        v_company_id, v_session.branch_id, v_je_number, current_date,
        'Shift Cash Drawer Reconciliation Variance (' || v_session.terminal_name || ')',
        'pos_session_zreport', v_session.id, abs(v_variance), abs(v_variance),
        'posted', auth.uid(), now(), auth.uid()
      ) returning id into v_auto_je_id;

      if v_variance > 0 then
        -- Overage: Debit Cash in hand, Credit Cash Overage (Income/Expense reduction)
        insert into public.journal_entry_lines (
          journal_entry_id, company_id, account_id, description, debit, credit
        ) values
          (v_auto_je_id, v_company_id, v_cash_acc_id, 'Cash Overage in Drawer', abs(v_variance), 0),
          (v_auto_je_id, v_company_id, v_variance_acc_id, 'Cash Overage Clearing', 0, abs(v_variance));
      else
        -- Shortage: Debit Cash Shortage Expense, Credit Cash in hand
        insert into public.journal_entry_lines (
          journal_entry_id, company_id, account_id, description, debit, credit
        ) values
          (v_auto_je_id, v_company_id, v_variance_acc_id, 'Cash Shortage in Drawer', abs(v_variance), 0),
          (v_auto_je_id, v_company_id, v_cash_acc_id, 'Cash Drawer Shortage Offset', 0, abs(v_variance));
      end if;
    end if;
  end if;

  -- 5. Atomically update and close session
  update public.pos_register_sessions
  set
    closed_at = now(),
    closing_cash_counted = p_counted_cash,
    expected_cash_balance = v_expected_cash,
    cash_difference = v_variance,
    total_sales_cash = v_sales_cash,
    total_sales_card = v_sales_card,
    total_sales_credit = v_sales_credit,
    total_sales_cheque = v_sales_cheque,
    status = 'closed',
    auto_journal_id = v_auto_je_id,
    notes = p_notes,
    updated_at = now()
  where id = v_session.id;

  -- Fetch metadata for receipt
  select p.full_name into v_cashier_name from public.profiles p where p.id = v_session.cashier_id;
  select b.name into v_branch_name from public.branches b where b.id = v_session.branch_id;
  select c.name into v_company_name from public.companies c where c.id = v_company_id;

  -- Audit trail
  perform public.log_system_audit_event(
    v_session.branch_id, 'session_close', case when abs(v_variance) > 500 then 'warning' else 'info' end,
    'pos_register_sessions', v_session.id,
    jsonb_build_object('status', 'open', 'opening_cash_float', v_session.opening_cash_float),
    jsonb_build_object(
      'status', 'closed',
      'counted_cash', p_counted_cash,
      'expected_cash', v_expected_cash,
      'variance', v_variance,
      'total_sales_cash', v_sales_cash,
      'total_sales_card', v_sales_card,
      'total_sales_cheque', v_sales_cheque,
      'total_sales_credit', v_sales_credit
    ),
    jsonb_build_object('terminal', v_session.terminal_name, 'auto_journal_id', v_auto_je_id)
  );

  return jsonb_build_object(
    'success', true,
    'z_report', jsonb_build_object(
      'session_id', v_session.id,
      'company_name', coalesce(v_company_name, 'Baby Bloom Business Suite'),
      'branch_name', coalesce(v_branch_name, 'Main Branch'),
      'terminal_name', v_session.terminal_name,
      'cashier_name', coalesce(v_cashier_name, 'Cashier'),
      'opened_at', v_session.opened_at,
      'closed_at', now(),
      'opening_float', v_session.opening_cash_float,
      'total_sales_cash', v_sales_cash,
      'total_sales_card', v_sales_card,
      'total_sales_cheque', v_sales_cheque,
      'total_sales_credit', v_sales_credit,
      'gross_sales', (v_sales_cash + v_sales_card + v_sales_cheque + v_sales_credit),
      'cash_in', v_cash_in,
      'cash_out', v_cash_out,
      'safe_drops', v_safe_drops,
      'expected_cash', v_expected_cash,
      'counted_cash', p_counted_cash,
      'variance', v_variance,
      'auto_journal_id', v_auto_je_id,
      'invoice_count', v_invoice_count,
      'notes', p_notes
    )
  );
end;
$$;

grant execute on function public.close_pos_session(uuid, numeric, text) to authenticated;

-- ============================================================================
-- 10. RPC: Fetch Active POS Session with Real-Time Drawer Metrics
-- ============================================================================

create or replace function public.get_active_pos_session(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_cashier_id uuid;
  v_session public.pos_register_sessions%rowtype;
  v_cashier_name text;
  v_branch_name text;
  v_sales_cash numeric(18,2) := 0;
  v_sales_card numeric(18,2) := 0;
  v_sales_credit numeric(18,2) := 0;
  v_sales_cheque numeric(18,2) := 0;
  v_cash_in numeric(18,2) := 0;
  v_cash_out numeric(18,2) := 0;
  v_safe_drops numeric(18,2) := 0;
  v_current_drawer_cash numeric(18,2) := 0;
begin
  v_company_id := public.current_user_company_id();
  v_cashier_id := auth.uid();

  if v_company_id is null or v_cashier_id is null then
    return jsonb_build_object('active_session', null);
  end if;

  select * into v_session
  from public.pos_register_sessions
  where company_id = v_company_id
    and cashier_id = v_cashier_id
    and status = 'open'
    and (p_branch_id is null or branch_id = p_branch_id)
  order by opened_at desc
  limit 1;

  if not found then
    return jsonb_build_object('active_session', null);
  end if;

  select p.full_name into v_cashier_name from public.profiles p where p.id = v_session.cashier_id;
  select b.name into v_branch_name from public.branches b where b.id = v_session.branch_id;

  -- Real-time sales
  select coalesce(sum(p.amount), 0) into v_sales_cash
  from public.invoice_payments p
  join public.sales_invoices si on si.id = p.invoice_id
  where p.company_id = v_company_id and p.branch_id = v_session.branch_id and p.status = 'posted'
    and p.payment_method = 'cash' and p.created_at >= v_session.opened_at and (si.cashier_id = v_cashier_id or si.created_by = v_cashier_id);

  select coalesce(sum(p.amount), 0) into v_sales_card
  from public.invoice_payments p
  join public.sales_invoices si on si.id = p.invoice_id
  where p.company_id = v_company_id and p.branch_id = v_session.branch_id and p.status = 'posted'
    and p.payment_method = 'card' and p.created_at >= v_session.opened_at and (si.cashier_id = v_cashier_id or si.created_by = v_cashier_id);

  select coalesce(sum(p.amount), 0) into v_sales_cheque
  from public.invoice_payments p
  join public.sales_invoices si on si.id = p.invoice_id
  where p.company_id = v_company_id and p.branch_id = v_session.branch_id and p.status = 'posted'
    and p.payment_method = 'cheque' and p.created_at >= v_session.opened_at and (si.cashier_id = v_cashier_id or si.created_by = v_cashier_id);

  select coalesce(sum(si.balance_amount), 0) into v_sales_credit
  from public.sales_invoices si
  where si.company_id = v_company_id and si.branch_id = v_session.branch_id and si.status = 'posted'
    and si.created_at >= v_session.opened_at and (si.cashier_id = v_cashier_id or si.created_by = v_cashier_id);

  -- Real-time movements
  select
    coalesce(sum(case when movement_type = 'cash_in' then amount else 0 end), 0),
    coalesce(sum(case when movement_type = 'cash_out' then amount else 0 end), 0),
    coalesce(sum(case when movement_type = 'drop_to_safe' then amount else 0 end), 0)
  into v_cash_in, v_cash_out, v_safe_drops
  from public.pos_register_cash_movements
  where session_id = v_session.id;

  v_current_drawer_cash := v_session.opening_cash_float + v_sales_cash + v_cash_in - v_cash_out - v_safe_drops;

  return jsonb_build_object(
    'active_session', jsonb_build_object(
      'id', v_session.id,
      'branch_id', v_session.branch_id,
      'branch_name', v_branch_name,
      'cashier_id', v_session.cashier_id,
      'cashier_name', v_cashier_name,
      'terminal_name', v_session.terminal_name,
      'opened_at', v_session.opened_at,
      'opening_cash_float', v_session.opening_cash_float,
      'current_drawer_cash', v_current_drawer_cash,
      'total_sales_cash', v_sales_cash,
      'total_sales_card', v_sales_card,
      'total_sales_cheque', v_sales_cheque,
      'total_sales_credit', v_sales_credit,
      'cash_in', v_cash_in,
      'cash_out', v_cash_out,
      'safe_drops', v_safe_drops,
      'status', v_session.status
    )
  );
end;
$$;

grant execute on function public.get_active_pos_session(uuid) to authenticated;

-- ============================================================================
-- 11. Transactional RPC: Post Petty Cash Voucher & Create Balanced GL Entries
-- ============================================================================

create or replace function public.post_petty_cash_voucher(
  p_voucher_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_voucher public.petty_cash_vouchers%rowtype;
  v_company_id uuid;
  v_petty_cash_acc_id uuid;
  v_je_id uuid;
  v_je_number text;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_voucher
  from public.petty_cash_vouchers
  where id = p_voucher_id and company_id = v_company_id
  for update;

  if not found then
    raise exception 'Petty cash voucher not found';
  end if;

  if v_voucher.status = 'posted' then
    raise exception 'Voucher is already posted';
  end if;

  -- 1. Identify Petty Cash Ledger Account (mapping or 1010)
  select account_id into v_petty_cash_acc_id
  from public.account_mappings
  where company_id = v_company_id and mapping_key in ('petty_cash', 'cash_in_hand');

  if v_petty_cash_acc_id is null then
    select id into v_petty_cash_acc_id
    from public.chart_of_accounts
    where company_id = v_company_id and (account_name ilike '%petty%' or account_code = '1010') and is_active
    limit 1;
  end if;

  if v_petty_cash_acc_id is null then
    select id into v_petty_cash_acc_id
    from public.chart_of_accounts
    where company_id = v_company_id and account_type = 'asset' and is_active
    order by account_code asc limit 1;
  end if;

  -- 2. Create Balanced General Ledger Entry
  v_je_number := 'PCV-JE-' || v_voucher.voucher_number;

  insert into public.journal_entries (
    company_id, branch_id, entry_number, entry_date, description,
    reference_type, reference_id, total_debit, total_credit,
    status, created_by, posted_at, posted_by
  ) values (
    v_company_id, v_voucher.branch_id, v_je_number, v_voucher.voucher_date,
    'Petty Cash Expense: ' || v_voucher.payee || ' - ' || v_voucher.description,
    'petty_cash_voucher', v_voucher.id, v_voucher.amount, v_voucher.amount,
    'posted', auth.uid(), now(), auth.uid()
  ) returning id into v_je_id;

  -- Line 1: Debit Expense Account
  insert into public.journal_entry_lines (
    journal_entry_id, company_id, account_id, description, debit, credit
  ) values (
    v_je_id, v_company_id, v_voucher.expense_account_id,
    'Petty Cash: ' || v_voucher.payee || ' - ' || v_voucher.description,
    v_voucher.amount, 0
  );

  -- Line 2: Credit Petty Cash Asset Account
  insert into public.journal_entry_lines (
    journal_entry_id, company_id, account_id, description, debit, credit
  ) values (
    v_je_id, v_company_id, v_petty_cash_acc_id,
    'Petty Cash Disbursement (' || v_voucher.voucher_number || ')',
    0, v_voucher.amount
  );

  -- 3. Update Voucher Status
  update public.petty_cash_vouchers
  set
    status = 'posted',
    journal_entry_id = v_je_id,
    posted_at = now(),
    posted_by = auth.uid(),
    updated_at = now()
  where id = v_voucher.id;

  -- 4. Audit Trail
  perform public.log_system_audit_event(
    v_voucher.branch_id, 'petty_cash_post', 'info',
    'petty_cash_vouchers', v_voucher.id,
    jsonb_build_object('status', v_voucher.status),
    jsonb_build_object('status', 'posted', 'amount', v_voucher.amount, 'journal_entry_id', v_je_id),
    jsonb_build_object('voucher_number', v_voucher.voucher_number, 'payee', v_voucher.payee)
  );

  return jsonb_build_object(
    'success', true,
    'voucher_id', v_voucher.id,
    'voucher_number', v_voucher.voucher_number,
    'journal_entry_id', v_je_id,
    'amount', v_voucher.amount,
    'status', 'posted'
  );
end;
$$;

grant execute on function public.post_petty_cash_voucher(uuid) to authenticated;

-- ============================================================================
-- 12. Transactional RPC: Replenish Petty Cash Float (Bank / Cash to Petty Cash)
-- ============================================================================

create or replace function public.replenish_petty_cash(
  p_branch_id uuid,
  p_source_account_id uuid,
  p_amount numeric,
  p_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_petty_cash_acc_id uuid;
  v_je_id uuid;
  v_je_number text;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null then
    raise exception 'Unauthorized';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Replenishment amount must be greater than 0';
  end if;

  -- 1. Identify Petty Cash Ledger Account
  select account_id into v_petty_cash_acc_id
  from public.account_mappings
  where company_id = v_company_id and mapping_key in ('petty_cash', 'cash_in_hand');

  if v_petty_cash_acc_id is null then
    select id into v_petty_cash_acc_id
    from public.chart_of_accounts
    where company_id = v_company_id and (account_name ilike '%petty%' or account_code = '1010') and is_active
    limit 1;
  end if;

  if v_petty_cash_acc_id is null then
    raise exception 'No Petty Cash asset account configured in Chart of Accounts';
  end if;

  if p_source_account_id = v_petty_cash_acc_id then
    raise exception 'Source account cannot be the Petty Cash account itself';
  end if;

  -- 2. Create Transfer Journal Entry
  v_je_number := 'PC-REP-' || to_char(now(), 'YYYYMMDD-HH24MISS');

  insert into public.journal_entries (
    company_id, branch_id, entry_number, entry_date, description,
    reference_type, total_debit, total_credit,
    status, created_by, posted_at, posted_by
  ) values (
    v_company_id, p_branch_id, v_je_number, current_date,
    'Petty Cash Float Replenishment: ' || coalesce(p_reference, 'Bank/Cash Transfer'),
    'petty_cash_replenishment', p_amount, p_amount,
    'posted', auth.uid(), now(), auth.uid()
  ) returning id into v_je_id;

  -- Line 1: Debit Petty Cash
  insert into public.journal_entry_lines (
    journal_entry_id, company_id, account_id, description, debit, credit
  ) values (
    v_je_id, v_company_id, v_petty_cash_acc_id,
    'Petty Cash Float Replenishment Inflow', p_amount, 0
  );

  -- Line 2: Credit Source Account (Bank or Cash)
  insert into public.journal_entry_lines (
    journal_entry_id, company_id, account_id, description, debit, credit
  ) values (
    v_je_id, v_company_id, p_source_account_id,
    'Petty Cash Float Replenishment Transfer Out', 0, p_amount
  );

  -- 3. Audit Trail
  perform public.log_system_audit_event(
    p_branch_id, 'manual_journal', 'info',
    'journal_entries', v_je_id,
    null,
    jsonb_build_object('type', 'petty_cash_replenishment', 'amount', p_amount, 'source_account_id', p_source_account_id),
    jsonb_build_object('journal_entry_number', v_je_number)
  );

  return jsonb_build_object(
    'success', true,
    'journal_entry_id', v_je_id,
    'journal_entry_number', v_je_number,
    'amount', p_amount
  );
end;
$$;

grant execute on function public.replenish_petty_cash(uuid, uuid, numeric, text) to authenticated;
