-- Migration 41: RLS Policies for Admin, Banking & Finance tables

alter table public.user_permissions enable row level security;
alter table public.pos_registers enable row level security;
alter table public.pos_shifts enable row level security;
alter table public.cheque_books enable row level security;
alter table public.cheques enable row level security;
alter table public.bank_cards enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;
alter table public.debit_credit_notes enable row level security;

-- user_permissions
create policy user_permissions_select on public.user_permissions
  for select using (company_id = public.current_user_company_id());
create policy user_permissions_manage on public.user_permissions
  for all using (
    company_id = public.current_user_company_id()
    and public.user_has_granular_permission(auth.uid(), 'admin.privileges')
  );

-- pos_registers
create policy pos_registers_select on public.pos_registers
  for select using (
    company_id = public.current_user_company_id()
    and public.user_has_branch_access(branch_id)
  );
create policy pos_registers_manage on public.pos_registers
  for all using (
    company_id = public.current_user_company_id()
    and public.user_can_transact_in_branch(branch_id)
    and public.user_has_granular_permission(auth.uid(), 'admin.counters')
  );

-- pos_shifts
create policy pos_shifts_select on public.pos_shifts
  for select using (
    company_id = public.current_user_company_id()
    and public.user_has_branch_access(branch_id)
  );
create policy pos_shifts_manage on public.pos_shifts
  for all using (
    company_id = public.current_user_company_id()
    and public.user_can_transact_in_branch(branch_id)
  );

-- cheque_books
create policy cheque_books_select on public.cheque_books
  for select using (
    company_id = public.current_user_company_id()
    and public.user_has_branch_access(branch_id)
  );
create policy cheque_books_manage on public.cheque_books
  for all using (
    company_id = public.current_user_company_id()
    and public.user_can_transact_in_branch(branch_id)
    and public.user_has_granular_permission(auth.uid(), 'banking.cheque_books')
  );

-- cheques
create policy cheques_select on public.cheques
  for select using (
    company_id = public.current_user_company_id()
    and public.user_has_branch_access(branch_id)
  );
create policy cheques_manage on public.cheques
  for all using (
    company_id = public.current_user_company_id()
    and public.user_can_transact_in_branch(branch_id)
  );

-- bank_cards
create policy bank_cards_select on public.bank_cards
  for select using (
    company_id = public.current_user_company_id()
    and public.user_has_branch_access(branch_id)
  );
create policy bank_cards_manage on public.bank_cards
  for all using (
    company_id = public.current_user_company_id()
    and public.user_can_transact_in_branch(branch_id)
    and public.user_has_granular_permission(auth.uid(), 'banking.cards')
  );

-- journal_entries
create policy journal_entries_select on public.journal_entries
  for select using (
    company_id = public.current_user_company_id()
    and public.user_has_branch_access(branch_id)
  );
create policy journal_entries_manage on public.journal_entries
  for all using (
    company_id = public.current_user_company_id()
    and public.user_can_transact_in_branch(branch_id)
    and public.user_has_granular_permission(auth.uid(), 'accounting.journals')
  );

-- journal_entry_lines
create policy journal_entry_lines_select on public.journal_entry_lines
  for select using (company_id = public.current_user_company_id());
create policy journal_entry_lines_manage on public.journal_entry_lines
  for all using (
    company_id = public.current_user_company_id()
    and public.user_has_granular_permission(auth.uid(), 'accounting.journals')
  );

-- debit_credit_notes
create policy debit_credit_notes_select on public.debit_credit_notes
  for select using (
    company_id = public.current_user_company_id()
    and public.user_has_branch_access(branch_id)
  );
create policy debit_credit_notes_manage on public.debit_credit_notes
  for all using (
    company_id = public.current_user_company_id()
    and public.user_can_transact_in_branch(branch_id)
    and public.user_has_granular_permission(auth.uid(), 'accounting.debit_credit_notes')
  );
