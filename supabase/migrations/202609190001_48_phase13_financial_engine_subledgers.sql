-- Migration 48: Phase 13 Core Financial Engine, Double-Entry General Ledger, Customer Receipts, Vendor Payables, Direct Income & Expenses, Cash/Bank Books & Bank Reconciliation

-- ============================================================================
-- 1. Chart of Accounts Hierarchy & Subtype Extensions
-- ============================================================================

alter table public.chart_of_accounts 
  add column if not exists subtype text 
  check (subtype is null or subtype in (
    'cash', 'bank', 'accounts_receivable', 'accounts_payable', 'inventory', 
    'direct_income', 'indirect_income', 'operating_expense', 'admin_expense', 'retained_earnings'
  ));

alter table public.chart_of_accounts 
  add column if not exists currency text not null default 'LKR';

-- Update system mapping subtypes where known
update public.chart_of_accounts set subtype = 'cash' where account_code like '1010%' and subtype is null;
update public.chart_of_accounts set subtype = 'bank' where account_code like '1020%' and subtype is null;
update public.chart_of_accounts set subtype = 'accounts_receivable' where account_code like '1100%' and subtype is null;
update public.chart_of_accounts set subtype = 'inventory' where account_code like '1200%' and subtype is null;
update public.chart_of_accounts set subtype = 'accounts_payable' where account_code like '2000%' and subtype is null;
update public.chart_of_accounts set subtype = 'direct_income' where account_code like '4000%' and subtype is null;
update public.chart_of_accounts set subtype = 'operating_expense' where account_code like '5000%' or account_code like '6000%' and subtype is null;

-- ============================================================================
-- 2. Immutable Double-Entry General Ledger
-- ============================================================================

create table if not exists public.general_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  entry_date date not null default (now() at time zone 'Asia/Colombo')::date,
  entry_type text not null check (entry_type in (
    'customer_payment', 'vendor_payment', 'expense', 'income', 
    'journal', 'bank_transfer', 'reversal', 'petty_cash'
  )),
  reference_type text not null,
  reference_id uuid not null,
  reference_number text not null,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  debit_amount numeric(18,2) not null default 0 check (debit_amount >= 0),
  credit_amount numeric(18,2) not null default 0 check (credit_amount >= 0),
  narration text not null,
  reversal_of_id uuid references public.general_ledger_entries(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint gl_one_sided_check check (
    (debit_amount > 0 and credit_amount = 0) or 
    (credit_amount > 0 and debit_amount = 0)
  )
);

create index if not exists gl_entries_account_date_idx 
  on public.general_ledger_entries(company_id, account_id, entry_date asc);

create index if not exists gl_entries_branch_date_idx 
  on public.general_ledger_entries(company_id, branch_id, entry_date desc);

create index if not exists gl_entries_reference_idx 
  on public.general_ledger_entries(reference_type, reference_id);

-- Enforce Immutability Trigger (Prevent direct UPDATE or DELETE)
create or replace function public.prevent_general_ledger_mutation()
returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'General Ledger entries are strictly immutable. Post an offsetting reversal entry instead.'
    using errcode = '55000';
end;
$$;

drop trigger if exists general_ledger_immutable on public.general_ledger_entries;
create trigger general_ledger_immutable
  before update or delete on public.general_ledger_entries
  for each row execute function public.prevent_general_ledger_mutation();

-- ============================================================================
-- 3. Customer Receipts & Open Invoice Allocations
-- ============================================================================

create table if not exists public.customer_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  receipt_number text not null check (btrim(receipt_number) <> ''),
  receipt_date date not null default (now() at time zone 'Asia/Colombo')::date,
  customer_id uuid not null references public.customers(id) on delete restrict,
  payment_method text not null check (payment_method in ('cash', 'bank_transfer', 'card', 'cheque')),
  amount numeric(18,2) not null check (amount > 0),
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  cheque_id uuid references public.cheques(id) on delete set null,
  card_reference text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'posted', 'reversed')),
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, receipt_number)
);

create index if not exists customer_receipts_customer_idx 
  on public.customer_receipts(company_id, customer_id, receipt_date desc);

-- Invoice Allocations Table
create table if not exists public.customer_receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  receipt_id uuid not null references public.customer_receipts(id) on delete cascade,
  invoice_id uuid not null references public.sales_invoices(id) on delete restrict,
  allocated_amount numeric(18,2) not null check (allocated_amount > 0),
  created_at timestamptz not null default now(),
  unique (receipt_id, invoice_id)
);

create index if not exists customer_receipt_allocations_inv_idx 
  on public.customer_receipt_allocations(invoice_id);

-- ============================================================================
-- 4. Direct Incomes and Expenses
-- ============================================================================

create table if not exists public.income_and_expense_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  entry_number text not null check (btrim(entry_number) <> ''),
  entry_date date not null default (now() at time zone 'Asia/Colombo')::date,
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  category_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  paid_through_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  amount numeric(18,2) not null check (amount > 0),
  payee_or_payer text not null check (btrim(payee_or_payer) <> ''),
  payment_mode text not null default 'cash' check (payment_mode in ('cash', 'bank_transfer', 'cheque', 'card')),
  reference_number text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'posted', 'reversed')),
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, entry_number)
);

create index if not exists inc_exp_type_date_idx 
  on public.income_and_expense_entries(company_id, transaction_type, entry_date desc);

-- ============================================================================
-- 5. Bank Reconciliation Engine
-- ============================================================================

create table if not exists public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  statement_date date not null,
  opening_balance numeric(18,2) not null default 0,
  closing_balance numeric(18,2) not null default 0,
  reconciled_at timestamptz,
  reconciled_by uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'reconciled')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists bank_statements_acc_idx 
  on public.bank_statements(company_id, bank_account_id, statement_date desc);

create table if not exists public.bank_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  bank_statement_id uuid not null references public.bank_statements(id) on delete cascade,
  general_ledger_entry_id uuid not null references public.general_ledger_entries(id) on delete restrict,
  is_cleared boolean not null default false,
  cleared_date date,
  notes text,
  created_at timestamptz not null default now(),
  unique (bank_statement_id, general_ledger_entry_id)
);

create index if not exists bank_rec_items_gl_idx 
  on public.bank_reconciliation_items(general_ledger_entry_id);

-- ============================================================================
-- 6. Permissions Registration
-- ============================================================================

insert into public.permissions (permission_key, module, name, description)
values
  ('receivables.view', 'finance', 'View Customer Receivables', 'Allows viewing customer outstanding balances and ledger'),
  ('receivables.receive', 'finance', 'Receive Customer Payments', 'Allows posting customer payment receipts and invoice allocations'),
  ('payables.view', 'finance', 'View Vendor Payables', 'Allows viewing supplier outstanding payables and aging'),
  ('payables.settle', 'finance', 'Settle Vendor Bills', 'Allows posting payments to suppliers'),
  ('income_expense.view', 'finance', 'View Direct Income & Expenses', 'Allows viewing income and expense voucher logs'),
  ('income_expense.create', 'finance', 'Create Income & Expense Entries', 'Allows posting direct expenses and non-sales income'),
  ('cash_bank_book.view', 'finance', 'View Cash & Bank Books', 'Allows viewing real-time running cash and bank account ledgers'),
  ('bank_recon.view', 'finance', 'View Bank Reconciliation', 'Allows accessing bank reconciliation screens'),
  ('bank_recon.reconcile', 'finance', 'Execute Bank Reconciliation', 'Allows finalizing bank statements and clearing GL entries')
on conflict (permission_key) do nothing;

-- ============================================================================
-- 7. Transactional RPCs: Posting & Ledgers
-- ============================================================================

-- RPC: Post Customer Payment Receipt
create or replace function public.post_customer_receipt(p_receipt_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_user_company_id();
  v_rec record;
  v_cust record;
  v_cash_acc_id uuid;
  v_ar_acc_id uuid;
  v_bank_acc record;
  v_deposit_acc_id uuid;
  v_alloc record;
  v_inv record;
  v_allocated_sum numeric(18,2) := 0;
  v_inv_new_paid numeric(18,2);
  v_inv_new_bal numeric(18,2);
  v_inv_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.user_has_permission('receivables.receive') then
    raise exception 'Permission receivables.receive required' using errcode = '42501';
  end if;

  select * into v_rec from public.customer_receipts 
  where id = p_receipt_id and company_id = v_company_id for update;
  if not found then raise exception 'Customer receipt not found'; end if;

  if v_rec.status <> 'draft' then
    raise exception 'Receipt is already %', v_rec.status;
  end if;

  select * into v_cust from public.customers where id = v_rec.customer_id and company_id = v_company_id;

  -- 1. Identify Accounts (Cash/Bank and AR)
  select ledger_account_id into v_ar_acc_id 
  from public.account_mappings 
  where company_id = v_company_id and mapping_key = 'accounts_receivable';

  if v_ar_acc_id is null then
    select id into v_ar_acc_id from public.chart_of_accounts 
    where company_id = v_company_id and account_code = '1100' limit 1;
  end if;

  if v_rec.payment_method = 'cash' then
    select ledger_account_id into v_deposit_acc_id 
    from public.account_mappings 
    where company_id = v_company_id and mapping_key = 'cash_in_hand';
    if v_deposit_acc_id is null then
      select id into v_deposit_acc_id from public.chart_of_accounts 
      where company_id = v_company_id and (subtype = 'cash' or account_code = '1010') limit 1;
    end if;
  else
    if v_rec.bank_account_id is not null then
      select * into v_bank_acc from public.bank_accounts where id = v_rec.bank_account_id;
      v_deposit_acc_id := v_bank_acc.gl_account_id;
    end if;
    if v_deposit_acc_id is null then
      select id into v_deposit_acc_id from public.chart_of_accounts 
      where company_id = v_company_id and (subtype = 'bank' or account_code like '1020%') limit 1;
    end if;
  end if;

  if v_deposit_acc_id is null or v_ar_acc_id is null then
    raise exception 'Required ledger accounts (Deposit account or AR account) not configured in Chart of Accounts';
  end if;

  -- 2. Post to Immutable Customer Subledger (Credit reduces customer receivable)
  insert into public.customer_ledger_entries (
    company_id, branch_id, customer_id, entry_date, entry_type,
    reference_type, reference_id, reference_number,
    debit_amount, credit_amount, notes, created_by
  ) values (
    v_company_id, v_rec.branch_id, v_rec.customer_id, v_rec.receipt_date,
    'payment'::public.customer_ledger_entry_type, 'customer_receipt', v_rec.id, v_rec.receipt_number,
    0, v_rec.amount, 'Customer payment receipt ' || v_rec.receipt_number || ' (' || v_rec.payment_method || ')', auth.uid()
  );

  -- 3. Post Double-Entry General Ledger (Debit Cash/Bank, Credit AR)
  -- Debit: Inflow to Cash/Bank
  insert into public.general_ledger_entries (
    company_id, branch_id, entry_date, entry_type,
    reference_type, reference_id, reference_number,
    account_id, debit_amount, credit_amount, narration, created_by
  ) values (
    v_company_id, v_rec.branch_id, v_rec.receipt_date, 'customer_payment',
    'customer_receipt', v_rec.id, v_rec.receipt_number,
    v_deposit_acc_id, v_rec.amount, 0,
    'Payment received from ' || v_cust.name || ' (' || v_rec.receipt_number || ')', auth.uid()
  );

  -- Credit: Reduction of Accounts Receivable
  insert into public.general_ledger_entries (
    company_id, branch_id, entry_date, entry_type,
    reference_type, reference_id, reference_number,
    account_id, debit_amount, credit_amount, narration, created_by
  ) values (
    v_company_id, v_rec.branch_id, v_rec.receipt_date, 'customer_payment',
    'customer_receipt', v_rec.id, v_rec.receipt_number,
    v_ar_acc_id, 0, v_rec.amount,
    'Receivable settlement for ' || v_cust.name || ' (' || v_rec.receipt_number || ')', auth.uid()
  );

  -- 4. Process Allocations against Sales Invoices
  perform set_config('app.sales_workflow', 'on', true);

  for v_alloc in select * from public.customer_receipt_allocations where receipt_id = v_rec.id loop
    v_allocated_sum := v_allocated_sum + v_alloc.allocated_amount;
    
    select * into v_inv from public.sales_invoices where id = v_alloc.invoice_id for update;
    if found then
      v_inv_new_paid := v_inv.paid_amount + v_alloc.allocated_amount;
      v_inv_new_bal := greatest(0, v_inv.grand_total - v_inv_new_paid);
      v_inv_status := case 
        when v_inv_new_bal = 0 then 'paid'
        when v_inv_new_paid > 0 then 'partial'
        else 'unpaid'
      end;

      update public.sales_invoices set
        paid_amount = v_inv_new_paid,
        balance_amount = v_inv_new_bal,
        payment_status = v_inv_status::public.sales_payment_status,
        updated_at = now(),
        updated_by = auth.uid()
      where id = v_inv.id;
    end if;
  end loop;

  -- 5. Mark Receipt Posted
  update public.customer_receipts set
    status = 'posted',
    posted_at = now(),
    posted_by = auth.uid(),
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_rec.id;

  -- 6. Audit Log
  perform public.log_system_audit_event(
    v_rec.branch_id, 'customer_receipt_post', 'info',
    'customer_receipts', v_rec.id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'status', 'posted',
      'receipt_number', v_rec.receipt_number,
      'amount', v_rec.amount,
      'allocated_sum', v_allocated_sum
    ),
    jsonb_build_object('customer_name', v_cust.name)
  );

  return jsonb_build_object(
    'success', true,
    'receipt_id', v_rec.id,
    'receipt_number', v_rec.receipt_number,
    'status', 'posted',
    'amount', v_rec.amount,
    'allocated_amount', v_allocated_sum
  );
end;
$$;

grant execute on function public.post_customer_receipt(uuid) to authenticated;

-- RPC: Post Direct Income or Expense Entry
create or replace function public.post_income_expense(p_entry_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_user_company_id();
  v_entry record;
  v_cat_acc record;
  v_paid_acc record;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.user_has_permission('income_expense.create') then
    raise exception 'Permission income_expense.create required' using errcode = '42501';
  end if;

  select * into v_entry from public.income_and_expense_entries 
  where id = p_entry_id and company_id = v_company_id for update;
  if not found then raise exception 'Voucher entry not found'; end if;

  if v_entry.status <> 'draft' then
    raise exception 'Voucher is already %', v_entry.status;
  end if;

  select * into v_cat_acc from public.chart_of_accounts where id = v_entry.category_account_id;
  select * into v_paid_acc from public.chart_of_accounts where id = v_entry.paid_through_account_id;

  -- Double-entry posting:
  if v_entry.transaction_type = 'expense' then
    -- Debit Expense Category Account
    insert into public.general_ledger_entries (
      company_id, branch_id, entry_date, entry_type,
      reference_type, reference_id, reference_number,
      account_id, debit_amount, credit_amount, narration, created_by
    ) values (
      v_company_id, v_entry.branch_id, v_entry.entry_date, 'expense',
      'income_and_expense', v_entry.id, v_entry.entry_number,
      v_cat_acc.id, v_entry.amount, 0,
      'Expense: ' || v_cat_acc.account_name || ' to ' || v_entry.payee_or_payer || coalesce(' (' || v_entry.notes || ')', ''), auth.uid()
    );

    -- Credit Paid-Through Account (Cash/Bank Outflow)
    insert into public.general_ledger_entries (
      company_id, branch_id, entry_date, entry_type,
      reference_type, reference_id, reference_number,
      account_id, debit_amount, credit_amount, narration, created_by
    ) values (
      v_company_id, v_entry.branch_id, v_entry.entry_date, 'expense',
      'income_and_expense', v_entry.id, v_entry.entry_number,
      v_paid_acc.id, 0, v_entry.amount,
      'Payment for ' || v_cat_acc.account_name || ' (' || v_entry.entry_number || ')', auth.uid()
    );
  else
    -- Transaction Type = Income
    -- Debit Paid-Through Account (Cash/Bank Inflow)
    insert into public.general_ledger_entries (
      company_id, branch_id, entry_date, entry_type,
      reference_type, reference_id, reference_number,
      account_id, debit_amount, credit_amount, narration, created_by
    ) values (
      v_company_id, v_entry.branch_id, v_entry.entry_date, 'income',
      'income_and_expense', v_entry.id, v_entry.entry_number,
      v_paid_acc.id, v_entry.amount, 0,
      'Direct Income received into ' || v_paid_acc.account_name || ' from ' || v_entry.payee_or_payer, auth.uid()
    );

    -- Credit Income Category Account
    insert into public.general_ledger_entries (
      company_id, branch_id, entry_date, entry_type,
      reference_type, reference_id, reference_number,
      account_id, debit_amount, credit_amount, narration, created_by
    ) values (
      v_company_id, v_entry.branch_id, v_entry.entry_date, 'income',
      'income_and_expense', v_entry.id, v_entry.entry_number,
      v_cat_acc.id, 0, v_entry.amount,
      'Income: ' || v_cat_acc.account_name || ' (' || v_entry.entry_number || ')', auth.uid()
    );
  end if;

  update public.income_and_expense_entries set
    status = 'posted',
    posted_at = now(),
    posted_by = auth.uid(),
    updated_at = now(),
    updated_by = auth.uid()
  where id = v_entry.id;

  -- Audit Log
  perform public.log_system_audit_event(
    v_entry.branch_id, 'income_expense_post', 'info',
    'income_and_expense_entries', v_entry.id,
    jsonb_build_object('status', 'draft'),
    jsonb_build_object(
      'status', 'posted',
      'entry_number', v_entry.entry_number,
      'type', v_entry.transaction_type,
      'amount', v_entry.amount
    ),
    jsonb_build_object('payee_or_payer', v_entry.payee_or_payer)
  );

  return jsonb_build_object(
    'success', true,
    'entry_id', v_entry.id,
    'entry_number', v_entry.entry_number,
    'status', 'posted',
    'amount', v_entry.amount
  );
end;
$$;

grant execute on function public.post_income_expense(uuid) to authenticated;

-- RPC: Finalize Bank Statement Reconciliation
create or replace function public.reconcile_bank_statement(
  p_statement_id uuid,
  p_cleared_items jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_user_company_id();
  v_stmt record;
  v_item record;
  v_total_cleared_debit numeric(18,2) := 0;
  v_total_cleared_credit numeric(18,2) := 0;
  v_calculated_book_balance numeric(18,2);
  v_variance numeric(18,2);
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.user_has_permission('bank_recon.reconcile') then
    raise exception 'Permission bank_recon.reconcile required' using errcode = '42501';
  end if;

  select * into v_stmt from public.bank_statements 
  where id = p_statement_id and company_id = v_company_id for update;
  if not found then raise exception 'Bank statement not found'; end if;

  if v_stmt.status = 'reconciled' then
    raise exception 'Bank statement is already reconciled';
  end if;

  -- Clear each item
  for v_item in select * from jsonb_to_recordset(p_cleared_items) as x(
    general_ledger_entry_id uuid,
    is_cleared boolean,
    cleared_date date,
    notes text
  ) loop
    insert into public.bank_reconciliation_items (
      company_id, bank_statement_id, general_ledger_entry_id,
      is_cleared, cleared_date, notes
    ) values (
      v_company_id, v_stmt.id, v_item.general_ledger_entry_id,
      v_item.is_cleared, coalesce(v_item.cleared_date, v_stmt.statement_date), v_item.notes
    )
    on conflict (bank_statement_id, general_ledger_entry_id) do update set
      is_cleared = excluded.is_cleared,
      cleared_date = excluded.cleared_date,
      notes = excluded.notes;
  end loop;

  -- Compute reconciled totals from cleared GL entries
  select 
    coalesce(sum(gle.debit_amount), 0),
    coalesce(sum(gle.credit_amount), 0)
  into v_total_cleared_debit, v_total_cleared_credit
  from public.bank_reconciliation_items bri
  join public.general_ledger_entries gle on gle.id = bri.general_ledger_entry_id
  where bri.bank_statement_id = v_stmt.id and bri.is_cleared = true;

  v_calculated_book_balance := v_stmt.opening_balance + (v_total_cleared_debit - v_total_cleared_credit);
  v_variance := round(abs(v_stmt.closing_balance - v_calculated_book_balance), 2);

  if v_variance > 0.01 then
    raise exception 'Statement cannot be finalized with an unreconciled difference of Rs. % (Statement: Rs. %, Cleared Book: Rs. %)',
      v_variance, v_stmt.closing_balance, v_calculated_book_balance;
  end if;

  update public.bank_statements set
    status = 'reconciled',
    reconciled_at = now(),
    reconciled_by = auth.uid()
  where id = v_stmt.id;

  return jsonb_build_object(
    'success', true,
    'statement_id', v_stmt.id,
    'status', 'reconciled',
    'closing_balance', v_stmt.closing_balance,
    'cleared_balance', v_calculated_book_balance,
    'variance', 0
  );
end;
$$;

grant execute on function public.reconcile_bank_statement(uuid, jsonb) to authenticated;

-- RPC: Real-Time Cash Book and Bank Book Running Ledger
create or replace function public.get_cash_bank_ledger(
  p_branch_id uuid,
  p_account_id uuid,
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company_id uuid := public.current_user_company_id();
  v_acc record;
  v_opening_balance numeric(18,2) := 0;
  v_total_debit numeric(18,2) := 0;
  v_total_credit numeric(18,2) := 0;
  v_closing_balance numeric(18,2) := 0;
  v_entries jsonb;
begin
  select * into v_acc from public.chart_of_accounts where id = p_account_id and company_id = v_company_id;
  if not found then raise exception 'Account not found'; end if;

  -- 1. Calculate Opening Balance before p_date_from
  select coalesce(sum(debit_amount - credit_amount), 0)
  into v_opening_balance
  from public.general_ledger_entries
  where company_id = v_company_id 
    and account_id = p_account_id
    and (p_branch_id is null or branch_id = p_branch_id)
    and entry_date < p_date_from;

  -- 2. Period Inflow and Outflow
  select 
    coalesce(sum(debit_amount), 0),
    coalesce(sum(credit_amount), 0)
  into v_total_debit, v_total_credit
  from public.general_ledger_entries
  where company_id = v_company_id 
    and account_id = p_account_id
    and (p_branch_id is null or branch_id = p_branch_id)
    and entry_date >= p_date_from and entry_date <= p_date_to;

  v_closing_balance := v_opening_balance + (v_total_debit - v_total_credit);

  -- 3. Retrieve transactions in timeframe
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_entries
  from (
    select 
      gle.id,
      gle.entry_date,
      gle.entry_type,
      gle.reference_type,
      gle.reference_number,
      gle.debit_amount as inflow,
      gle.credit_amount as outflow,
      gle.narration,
      b.name as branch_name,
      sum(gle.debit_amount - gle.credit_amount) over (
        order by gle.entry_date asc, gle.created_at asc, gle.id asc
      ) + v_opening_balance as running_balance
    from public.general_ledger_entries gle
    join public.branches b on b.id = gle.branch_id
    where gle.company_id = v_company_id 
      and gle.account_id = p_account_id
      and (p_branch_id is null or gle.branch_id = p_branch_id)
      and gle.entry_date >= p_date_from and gle.entry_date <= p_date_to
    order by gle.entry_date asc, gle.created_at asc, gle.id asc
  ) x;

  return jsonb_build_object(
    'account_id', v_acc.id,
    'account_code', v_acc.account_code,
    'account_name', v_acc.account_name,
    'subtype', v_acc.subtype,
    'opening_balance', v_opening_balance,
    'total_inflow', v_total_debit,
    'total_outflow', v_total_credit,
    'closing_balance', v_closing_balance,
    'transactions', v_entries
  );
end;
$$;

grant execute on function public.get_cash_bank_ledger(uuid, uuid, date, date) to authenticated;

-- ============================================================================
-- 8. Row Level Security Policies
-- ============================================================================

alter table public.general_ledger_entries enable row level security;
alter table public.customer_receipts enable row level security;
alter table public.customer_receipt_allocations enable row level security;
alter table public.income_and_expense_entries enable row level security;
alter table public.bank_statements enable row level security;
alter table public.bank_reconciliation_items enable row level security;

-- General Ledger Read Policy
create policy gl_entries_read on public.general_ledger_entries
  for select to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id));

-- Customer Receipts Policy
create policy customer_receipts_read on public.customer_receipts
  for select to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id));

create policy customer_receipts_write on public.customer_receipts
  for all to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id))
  with check (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id));

-- Allocations Policy
create policy customer_receipt_allocations_all on public.customer_receipt_allocations
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

-- Income & Expense Policy
create policy income_expense_read on public.income_and_expense_entries
  for select to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id));

create policy income_expense_write on public.income_and_expense_entries
  for all to authenticated
  using (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id))
  with check (company_id = public.current_user_company_id() and public.user_has_branch_access(branch_id));

-- Bank Statements Policy
create policy bank_statements_all on public.bank_statements
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

create policy bank_rec_items_all on public.bank_reconciliation_items
  for all to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
