-- RLS-safe helpers. SECURITY DEFINER functions use an empty search_path and qualified objects.
create function public.current_user_company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.company_id from public.profiles p
  where p.id = auth.uid() and p.status = 'active'::public.user_status
$$;

create function public.user_has_company_access(company_uuid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.companies c on c.id = p.company_id
    where p.id = auth.uid() and p.company_id = company_uuid
      and p.status = 'active'::public.user_status and c.is_active
  )
$$;

create function public.user_has_branch_access(branch_uuid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_branch_access uba
    join public.profiles p on p.id = uba.user_id and p.company_id = uba.company_id
    join public.branches b on b.id = uba.branch_id and b.company_id = uba.company_id
    where uba.user_id = auth.uid() and uba.branch_id = branch_uuid and uba.can_view
      and p.status = 'active'::public.user_status and b.is_active and b.deleted_at is null
  )
$$;

create function public.user_can_transact_in_branch(branch_uuid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_branch_access uba
    join public.profiles p on p.id = uba.user_id and p.company_id = uba.company_id
    join public.branches b on b.id = uba.branch_id and b.company_id = uba.company_id
    where uba.user_id = auth.uid() and uba.branch_id = branch_uuid
      and uba.can_view and uba.can_transact
      and p.status = 'active'::public.user_status and b.is_active and b.deleted_at is null
  )
$$;

create function public.user_has_permission(p_permission_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id and ur.company_id = p.company_id
    join public.roles r on r.id = ur.role_id and r.company_id = ur.company_id and r.is_active
    join public.role_permissions rp on rp.role_id = r.id and rp.company_id = r.company_id and rp.is_allowed
    join public.permissions permission on permission.id = rp.permission_id
    where p.id = auth.uid() and p.status = 'active'::public.user_status
      and permission.permission_key = p_permission_key
  )
$$;

create function public.current_user_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join public.user_roles ur on ur.user_id = p.id and ur.company_id = p.company_id
    join public.roles r on r.id = ur.role_id and r.company_id = ur.company_id
    where p.id = auth.uid() and p.status = 'active'::public.user_status
      and r.is_active and r.code in ('OWNER', 'ADMIN')
  )
$$;
create function public.role_is_assigned_to_current_user(role_uuid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role_id = role_uuid)
$$;

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
declare patch jsonb := jsonb_build_object('updated_at', now());
begin
  if to_jsonb(new) ? 'updated_by' and auth.uid() is not null then
    patch := patch || jsonb_build_object('updated_by', auth.uid());
  end if;
  new := jsonb_populate_record(new, patch);
  return new;
end;
$$;


create function public.set_created_by() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and to_jsonb(new) ? 'created_by' then
    new := jsonb_populate_record(new, jsonb_build_object('created_by', auth.uid()));
  end if;
  return new;
end;
$$;
create function public.validate_same_company_references() returns trigger
language plpgsql set search_path = '' as $$
declare
  new_json jsonb := to_jsonb(new);
  ref_id uuid;
  ref_company uuid;
  i integer := 0;
  allow_global boolean;
begin
  while i < tg_nargs loop
    ref_id := nullif(new_json ->> tg_argv[i], '')::uuid;
    allow_global := coalesce(tg_argv[i + 2]::boolean, false);
    if ref_id is not null then
      execute format('select company_id from public.%I where id = $1', tg_argv[i + 1]) into ref_company using ref_id;
      if not found or (ref_company is distinct from new.company_id and not (allow_global and ref_company is null)) then
        raise exception 'Cross-company reference rejected for %.%', tg_table_name, tg_argv[i];
      end if;
    end if;
    i := i + 3;
  end loop;
  return new;
end;
$$;

create function public.validate_bank_references() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.bank_branch_id is not null and not exists (
    select 1 from public.bank_branches bb
    where bb.id = new.bank_branch_id and bb.bank_id = new.bank_id
      and (bb.company_id is null or bb.company_id = new.company_id)
  ) then raise exception 'Bank branch does not belong to the selected bank/company'; end if;
  return new;
end;
$$;

create function public.write_audit_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  payload jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  company_uuid uuid := nullif(payload ->> 'company_id', '')::uuid;
  branch_uuid uuid := nullif(payload ->> 'branch_id', '')::uuid;
  record_uuid uuid := nullif(payload ->> 'id', '')::uuid;
begin
  insert into public.audit_logs (
    company_id, branch_id, user_id, action, module, table_name, record_id, old_values, new_values
  ) values (
    company_uuid, branch_uuid, auth.uid(), tg_op, tg_table_schema, tg_table_name, record_uuid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function public.next_document_number(
  p_company_id uuid,
  p_branch_id uuid,
  p_sequence_type public.sequence_type
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  seq public.number_sequences%rowtype;
  business_date date := (now() at time zone 'Asia/Colombo')::date;
  should_reset boolean;
  result text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and (
    auth.uid() is null
    or not public.user_has_company_access(p_company_id)
    or not public.user_can_transact_in_branch(p_branch_id)
    or not exists (select 1 from public.branches b where b.id = p_branch_id and b.company_id = p_company_id)
  ) then raise exception 'Unauthorised company or branch sequence access' using errcode = '42501'; end if;

  select * into seq from public.number_sequences s
  where s.company_id = p_company_id and s.branch_id = p_branch_id and s.sequence_type = p_sequence_type
  for update;
  if not found then raise exception 'Number sequence is not configured'; end if;

  should_reset := case seq.reset_frequency
    when 'daily' then seq.last_reset_date is distinct from business_date
    when 'monthly' then seq.last_reset_date is null or date_trunc('month', seq.last_reset_date) <> date_trunc('month', business_date)
    when 'yearly' then seq.last_reset_date is null or extract(year from seq.last_reset_date) <> extract(year from business_date)
    else false end;
  if should_reset then seq.next_number := 1; seq.last_reset_date := business_date; end if;
  result := seq.prefix || lpad(seq.next_number::text, seq.padding_length, '0');
  update public.number_sequences set next_number = seq.next_number + 1,
    last_reset_date = coalesce(seq.last_reset_date, last_reset_date), updated_at = now()
  where id = seq.id;
  return result;
end;
$$;

revoke all on function public.current_user_company_id() from public, anon;
revoke all on function public.user_has_company_access(uuid) from public, anon;
revoke all on function public.user_has_branch_access(uuid) from public, anon;
revoke all on function public.user_can_transact_in_branch(uuid) from public, anon;
revoke all on function public.user_has_permission(text) from public, anon;
revoke all on function public.current_user_is_admin() from public, anon;
revoke all on function public.next_document_number(uuid, uuid, public.sequence_type) from public, anon;
revoke all on function public.role_is_assigned_to_current_user(uuid) from public, anon;
grant execute on function public.current_user_company_id() to authenticated, service_role;
grant execute on function public.user_has_company_access(uuid) to authenticated, service_role;
grant execute on function public.user_has_branch_access(uuid) to authenticated, service_role;
grant execute on function public.user_can_transact_in_branch(uuid) to authenticated, service_role;
grant execute on function public.user_has_permission(text) to authenticated, service_role;
grant execute on function public.current_user_is_admin() to authenticated, service_role;
grant execute on function public.next_document_number(uuid, uuid, public.sequence_type) to authenticated, service_role;
grant execute on function public.role_is_assigned_to_current_user(uuid) to authenticated, service_role;

create trigger profiles_validate_default_branch before insert or update of company_id, default_branch_id on public.profiles
for each row execute function public.validate_same_company_references('default_branch_id', 'branches', 'false');
create trigger products_validate_references before insert or update of company_id, category_id, brand_id, base_unit_id, preferred_vendor_id on public.products
for each row execute function public.validate_same_company_references(
  'category_id', 'categories', 'false', 'brand_id', 'brands', 'false',
  'base_unit_id', 'units', 'false', 'preferred_vendor_id', 'vendors', 'false'
);
create trigger bank_accounts_validate_scope before insert or update of company_id, bank_id, bank_branch_id on public.bank_accounts
for each row execute function public.validate_same_company_references('bank_id', 'banks', 'true', 'bank_branch_id', 'bank_branches', 'true');
create trigger bank_accounts_validate_branch before insert or update of bank_id, bank_branch_id on public.bank_accounts
for each row execute function public.validate_bank_references();

-- Apply uniform timestamps only to tables that own an updated_at column.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'companies','branches','profiles','roles','business_settings','warehouses','stock_locations',
    'customers','vendors','categories','brands','units','products','product_variants','bank_accounts',
    'chart_of_accounts','account_mappings','number_sequences'
  ] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

-- Audit master-data changes. Hard deletes remain blocked by RLS for normal users.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'branches','profiles','roles','user_roles','role_permissions','user_branch_access','business_settings',
    'warehouses','stock_locations','customers','vendors','categories','brands','units','products',
    'product_variants','product_barcodes','product_unit_conversions','bank_accounts','chart_of_accounts',
    'account_mappings','number_sequences'
  ] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()', table_name, table_name);
  end loop;
end $$;
-- Browser-supplied actor IDs are ignored; authenticated identity is authoritative.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'branches','customers','vendors','products','product_variants','bank_accounts'
  ] loop
    execute format('create trigger %I_set_created_by before insert on public.%I for each row execute function public.set_created_by()', table_name, table_name);
  end loop;
end $$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.set_created_by() from public, anon, authenticated;
revoke all on function public.validate_same_company_references() from public, anon, authenticated;
revoke all on function public.validate_bank_references() from public, anon, authenticated;
revoke all on function public.write_audit_log() from public, anon, authenticated;