-- Migration 48: Ensure Anon and Authenticated Roles Have Execution Grants for Security Functions
-- This prevents fatal "permission denied for function current_user_company_id" errors
-- when RLS policies evaluate tenant boundaries for unauthenticated or public requests.

grant execute on function public.current_user_company_id() to anon, authenticated, service_role;
grant execute on function public.user_has_company_access(uuid) to anon, authenticated, service_role;
grant execute on function public.user_has_branch_access(uuid) to anon, authenticated, service_role;
grant execute on function public.user_can_transact_in_branch(uuid) to anon, authenticated, service_role;
grant execute on function public.current_user_is_admin() to anon, authenticated, service_role;
grant execute on function public.user_has_permission(text) to anon, authenticated, service_role;
grant execute on function public.user_has_granular_permission(uuid, text) to anon, authenticated, service_role;

-- Allow anon and authenticated clients to read standard permissions catalogue
grant select on table public.permissions to anon, authenticated, service_role;
drop policy if exists "permissions_read_all" on public.permissions;
create policy "permissions_read_all" on public.permissions for select using (true);

-- Ensure authenticated & service roles can manage user_permissions
grant select, insert, update, delete on table public.user_permissions to anon, authenticated, service_role;
drop policy if exists "user_permissions_authenticated_all" on public.user_permissions;
create policy "user_permissions_authenticated_all" on public.user_permissions for all using (true) with check (true);

-- Ensure anon, authenticated and service roles can manage pos_registers and pos_shifts
grant select, insert, update, delete on table public.pos_registers to anon, authenticated, service_role;
drop policy if exists "pos_registers_open_all" on public.pos_registers;
create policy "pos_registers_open_all" on public.pos_registers for all using (true) with check (true);

grant select, insert, update, delete on table public.pos_shifts to anon, authenticated, service_role;
drop policy if exists "pos_shifts_open_all" on public.pos_shifts;
create policy "pos_shifts_open_all" on public.pos_shifts for all using (true) with check (true);

grant execute on function public.close_pos_shift(uuid, numeric, text) to anon, authenticated, service_role;


