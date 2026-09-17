-- Migration 43: Admin & Finance Posting Procedures & Triggers

-- Procedure to post manual journal entries
create or replace function public.post_journal_entry(
  p_journal_entry_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_je record;
  v_sum_debit numeric(18,2);
  v_sum_credit numeric(18,2);
begin
  -- Fetch journal entry
  select * into v_je from public.journal_entries where id = p_journal_entry_id for update;
  if not found then
    raise exception 'Journal entry not found.';
  end if;

  if v_je.status <> 'draft' then
    raise exception 'Only draft journal entries can be posted.';
  end if;

  -- Validate totals
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into v_sum_debit, v_sum_credit
  from public.journal_entry_lines
  where journal_entry_id = p_journal_entry_id;

  if v_sum_debit <> v_sum_credit or v_sum_debit <= 0 then
    raise exception 'Journal entry is not balanced. Debit: %, Credit: %', v_sum_debit, v_sum_credit;
  end if;

  -- Mark posted
  update public.journal_entries
  set
    status = 'posted',
    total_debit = v_sum_debit,
    total_credit = v_sum_credit,
    posted_at = now(),
    posted_by = p_user_id
  where id = p_journal_entry_id;

  return jsonb_build_object('success', true, 'journal_entry_id', p_journal_entry_id, 'total', v_sum_debit);
end;
$$;

-- Function to update cheque status lifecycle safely
create or replace function public.transition_cheque_status(
  p_cheque_id uuid,
  p_new_status text,
  p_deposit_date date default null,
  p_clear_date date default null,
  p_return_reason text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cheque record;
begin
  select * into v_cheque from public.cheques where id = p_cheque_id for update;
  if not found then
    raise exception 'Cheque not found.';
  end if;

  if v_cheque.status in ('cleared', 'cancelled') then
    raise exception 'Terminal cheque status % cannot be modified.', v_cheque.status;
  end if;

  update public.cheques
  set
    status = p_new_status,
    deposit_date = coalesce(p_deposit_date, deposit_date),
    clear_date = coalesce(p_clear_date, clear_date),
    return_reason = coalesce(p_return_reason, return_reason),
    updated_at = now()
  where id = p_cheque_id;

  return jsonb_build_object('success', true, 'cheque_id', p_cheque_id, 'new_status', p_new_status);
end;
$$;

-- Function to close and reconcile register shift
create or replace function public.close_pos_shift(
  p_shift_id uuid,
  p_closing_balance_actual numeric(18,2),
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_shift record;
  v_expected numeric(18,2);
begin
  select * into v_shift from public.pos_shifts where id = p_shift_id for update;
  if not found then
    raise exception 'Shift session not found.';
  end if;

  if v_shift.status <> 'open' then
    raise exception 'Shift is already closed or reconciled.';
  end if;

  v_expected := v_shift.opening_balance + v_shift.cash_sales;

  update public.pos_shifts
  set
    status = 'closed',
    closed_at = now(),
    closing_balance_expected = v_expected,
    closing_balance_actual = p_closing_balance_actual,
    notes = p_notes,
    updated_at = now()
  where id = p_shift_id;

  return jsonb_build_object(
    'success', true,
    'shift_id', p_shift_id,
    'expected', v_expected,
    'actual', p_closing_balance_actual,
    'variance', p_closing_balance_actual - v_expected
  );
end;
$$;
