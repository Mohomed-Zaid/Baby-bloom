-- ============================================================================
-- FIX: sales_invoices rep_id foreign key constraint
-- ============================================================================
-- Drops the old foreign key constraint pointing to auth.users(id) and
-- links rep_id to public.staff_profiles(id) instead.
-- ============================================================================

alter table public.sales_invoices drop constraint if exists sales_invoices_rep_id_fkey;
alter table public.sales_invoices drop constraint if exists sales_invoices_rep_fk;

-- Clean up any rep_id pointing to nonexistent staff_profiles
update public.sales_invoices set rep_id = null 
where rep_id is not null and rep_id not in (select id from public.staff_profiles);

-- Add correct foreign key to staff_profiles
alter table public.sales_invoices
  add constraint sales_invoices_rep_fk foreign key (rep_id) references public.staff_profiles(id) on delete set null;

notify pgrst, 'reload schema';
