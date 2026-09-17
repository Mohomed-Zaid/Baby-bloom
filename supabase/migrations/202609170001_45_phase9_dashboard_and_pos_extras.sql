-- Migration 45: Phase 9 Executive Dashboard RPC, Barcode Label Templates, and POS Shortcut Keys

-- 1. Barcode Label Templates Table
create table if not exists public.barcode_label_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_name text not null check (btrim(template_name) <> ''),
  paper_width_mm numeric(6,2) not null check (paper_width_mm > 0),
  paper_height_mm numeric(6,2) not null check (paper_height_mm > 0),
  columns integer not null default 1 check (columns between 1 and 10),
  show_barcode boolean not null default true,
  show_price boolean not null default true,
  show_mfg_date boolean not null default false,
  show_exp_date boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, template_name)
);

create index if not exists barcode_label_templates_company_idx on public.barcode_label_templates(company_id);

-- Enable RLS
alter table public.barcode_label_templates enable row level security;

create policy "barcode_label_templates_select" on public.barcode_label_templates
  for select using (company_id = public.current_user_company_id());

create policy "barcode_label_templates_insert" on public.barcode_label_templates
  for insert with check (company_id = public.current_user_company_id());

create policy "barcode_label_templates_update" on public.barcode_label_templates
  for update using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

create policy "barcode_label_templates_delete" on public.barcode_label_templates
  for delete using (company_id = public.current_user_company_id());

-- 2. POS Shortcut Keys Table
create table if not exists public.pos_shortcut_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  function_or_product_id text not null check (btrim(function_or_product_id) <> ''),
  key_combination text not null check (btrim(key_combination) <> ''),
  target_type text not null check (target_type in ('product', 'command')),
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, id),
  unique (company_id, branch_id, key_combination)
);

create index if not exists pos_shortcut_keys_company_branch_idx on public.pos_shortcut_keys(company_id, branch_id);

-- Enable RLS
alter table public.pos_shortcut_keys enable row level security;

create policy "pos_shortcut_keys_select" on public.pos_shortcut_keys
  for select using (company_id = public.current_user_company_id());

create policy "pos_shortcut_keys_insert" on public.pos_shortcut_keys
  for insert with check (company_id = public.current_user_company_id());

create policy "pos_shortcut_keys_update" on public.pos_shortcut_keys
  for update using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());

create policy "pos_shortcut_keys_delete" on public.pos_shortcut_keys
  for delete using (company_id = public.current_user_company_id());

-- 3. Executive Dashboard Metrics Engine RPC
create or replace function public.get_dashboard_summary(p_branch_id uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_inward_cheques_total numeric(18,2) := 0;
  v_inward_cheques_count integer := 0;
  v_day_book_balance numeric(18,2) := 0;
  v_day_sales numeric(18,2) := 0;
  v_petty_cash_balance numeric(18,2) := 0;
  v_expiring_soon_count integer := 0;
  v_upcoming_cheques json := '[]'::json;
  v_today_date date;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null then
    return json_build_object(
      'inward_cheques_total', 0,
      'inward_cheques_count', 0,
      'day_book_balance', 0,
      'day_sales', 0,
      'petty_cash_balance', 0,
      'expiring_soon_count', 0,
      'upcoming_inward_cheques', '[]'::json
    );
  end if;

  v_today_date := (now() at time zone 'Asia/Colombo')::date;

  -- 1. Inward Cheques in Hand
  select
    coalesce(sum(amount), 0),
    count(id)
  into
    v_inward_cheques_total,
    v_inward_cheques_count
  from public.cheques
  where company_id = v_company_id
    and direction = 'inbound'
    and status = 'in_hand'
    and (p_branch_id is null or branch_id = p_branch_id);

  -- 2. Day Sales (Posted invoices for today in Asia/Colombo)
  select
    coalesce(sum(grand_total), 0)
  into
    v_day_sales
  from public.sales_invoices
  where company_id = v_company_id
    and status = 'posted'
    and invoice_date = v_today_date
    and (p_branch_id is null or branch_id = p_branch_id);

  -- 3. Day Book Balance (Net cash & bank position for branch)
  select
    coalesce(sum(
      case
        when coa.account_type = 'asset' then jel.debit - jel.credit
        when coa.account_type = 'liability' then jel.credit - jel.debit
        else jel.debit - jel.credit
      end
    ), 0)
  into
    v_day_book_balance
  from public.journal_entry_lines jel
  join public.journal_entries je on je.id = jel.journal_entry_id and je.status = 'posted'
  join public.chart_of_accounts coa on coa.id = jel.account_id
  where je.company_id = v_company_id
    and (coa.account_name ilike '%cash%' or coa.account_name ilike '%bank%' or coa.account_code in ('1000', '1010', '1020', '1050'))
    and (p_branch_id is null or je.branch_id = p_branch_id);

  -- 4. Petty Cash Balance
  select
    coalesce(sum(jel.debit - jel.credit), 0)
  into
    v_petty_cash_balance
  from public.journal_entry_lines jel
  join public.journal_entries je on je.id = jel.journal_entry_id and je.status = 'posted'
  join public.chart_of_accounts coa on coa.id = jel.account_id
  where je.company_id = v_company_id
    and (coa.account_name ilike '%petty%' or coa.account_code = '1010')
    and (p_branch_id is null or je.branch_id = p_branch_id);

  -- If no specific journal lines exist yet, fall back to cash mapping
  if v_petty_cash_balance = 0 then
    select
      coalesce(sum(jel.debit - jel.credit), 0)
    into
      v_petty_cash_balance
    from public.journal_entry_lines jel
    join public.journal_entries je on je.id = jel.journal_entry_id and je.status = 'posted'
    join public.account_mappings am on am.account_id = jel.account_id and am.mapping_key = 'cash_in_hand'
    where je.company_id = v_company_id
      and (p_branch_id is null or je.branch_id = p_branch_id);
  end if;

  -- 5. Expiry Date Counter (Batches / inventory items expiring in the next 30 days or already expired)
  select count(distinct id)
  into v_expiring_soon_count
  from public.purchase_items
  where company_id = v_company_id
    and expiry_date is not null
    and expiry_date <= (v_today_date + interval '30 days');

  -- 6. Top Upcoming Inward Cheques
  select coalesce(json_agg(t), '[]'::json)
  into v_upcoming_cheques
  from (
    select
      c.id,
      c.cheque_number,
      c.payee_payor_name as customer_name,
      c.bank_name,
      c.amount,
      c.due_date,
      c.status,
      c.branch_id
    from public.cheques c
    where c.company_id = v_company_id
      and c.direction = 'inbound'
      and c.status in ('in_hand', 'deposited')
      and (p_branch_id is null or c.branch_id = p_branch_id)
    order by c.due_date asc, c.created_at asc
    limit 10
  ) t;

  return json_build_object(
    'inward_cheques_total', v_inward_cheques_total,
    'inward_cheques_count', v_inward_cheques_count,
    'day_book_balance', v_day_book_balance,
    'day_sales', v_day_sales,
    'petty_cash_balance', v_petty_cash_balance,
    'expiring_soon_count', v_expiring_soon_count,
    'upcoming_inward_cheques', v_upcoming_cheques
  );
end;
$$;

grant execute on function public.get_dashboard_summary(uuid) to authenticated;
