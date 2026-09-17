-- Migration 42: Admin & Financial Report Projections / Views

-- 1. Trial Balance View
create or replace view public.v_trial_balance as
select
  coa.company_id,
  coa.id as account_id,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  coa.normal_balance,
  coalesce(sum(jel.debit), 0) as total_debit,
  coalesce(sum(jel.credit), 0) as total_credit,
  case
    when coa.normal_balance = 'debit' then coalesce(sum(jel.debit - jel.credit), 0)
    else coalesce(sum(jel.credit - jel.debit), 0)
  end as net_balance
from public.chart_of_accounts coa
left join public.journal_entry_lines jel on jel.account_id = coa.id and jel.company_id = coa.company_id
left join public.journal_entries je on je.id = jel.journal_entry_id and je.status = 'posted'
where coa.is_active = true
group by coa.company_id, coa.id, coa.account_code, coa.account_name, coa.account_type, coa.normal_balance;

-- 2. Day Book View (aggregates posted journal lines by entry_date)
create or replace view public.v_day_book as
select
  je.company_id,
  je.branch_id,
  je.entry_date,
  je.entry_number,
  je.description as entry_description,
  jel.id as line_id,
  coa.account_code,
  coa.account_name,
  jel.description as line_description,
  jel.debit,
  jel.credit,
  je.created_at
from public.journal_entries je
join public.journal_entry_lines jel on jel.journal_entry_id = je.id
join public.chart_of_accounts coa on coa.id = jel.account_id
where je.status = 'posted';

-- 3. Profit & Loss View (aggregates revenue/income, COGS, expenses)
create or replace view public.v_profit_loss as
select
  coa.company_id,
  coa.account_type,
  coa.account_code,
  coa.account_name,
  sum(case when coa.account_type = 'income' then jel.credit - jel.debit else jel.debit - jel.credit end) as net_amount
from public.chart_of_accounts coa
join public.journal_entry_lines jel on jel.account_id = coa.id
join public.journal_entries je on je.id = jel.journal_entry_id and je.status = 'posted'
where coa.account_type in ('income', 'cost_of_sales', 'expense')
group by coa.company_id, coa.account_type, coa.account_code, coa.account_name;

-- 4. Expense Summary View
create or replace view public.v_expense_summary as
select
  je.company_id,
  je.branch_id,
  b.name as branch_name,
  coa.account_code,
  coa.account_name,
  sum(jel.debit - jel.credit) as total_expense
from public.journal_entry_lines jel
join public.journal_entries je on je.id = jel.journal_entry_id and je.status = 'posted'
join public.chart_of_accounts coa on coa.id = jel.account_id
join public.branches b on b.id = je.branch_id
where coa.account_type = 'expense'
group by je.company_id, je.branch_id, b.name, coa.account_code, coa.account_name;

-- 5. Cheque Pipeline Summary View
create or replace view public.v_cheque_pipeline as
select
  c.company_id,
  c.branch_id,
  c.direction,
  c.status,
  count(c.id) as count_cheques,
  sum(c.amount) as total_amount
from public.cheques c
group by c.company_id, c.branch_id, c.direction, c.status;
