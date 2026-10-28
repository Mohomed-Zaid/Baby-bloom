-- Migration 44: Provision & Auto-Promote zaidn2848@gmail.com and babybloom@gmail.com as Admins

-- 0. Ensure validation functions are SECURITY DEFINER so RLS on branches/banks does not block integrity checks
create or replace function public.validate_same_company_references() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  new_json jsonb := to_jsonb(new);
  ref_id uuid;
  ref_company uuid;
  i integer := 0;
  allow_global boolean;
  row_exists boolean;
begin
  while i < tg_nargs loop
    ref_id := nullif(new_json ->> tg_argv[i], '')::uuid;
    allow_global := coalesce(tg_argv[i + 2]::boolean, false);
    if ref_id is not null then
      ref_company := null;
      row_exists := false;
      execute format('select true, company_id from public.%I where id = $1', tg_argv[i + 1])
        into row_exists, ref_company
        using ref_id;
      if not coalesce(row_exists, false) or (ref_company is distinct from new.company_id and not (allow_global and ref_company is null)) then
        raise exception 'Cross-company reference rejected for %.%: ref_id=%, ref_company=%, target_company=%', tg_table_name, tg_argv[i], ref_id, ref_company, new.company_id;
      end if;
    end if;
    i := i + 3;
  end loop;
  return new;
end;
$$;

create or replace function public.validate_bank_references() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.bank_branch_id is not null and not exists (
    select 1 from public.bank_branches bb
    where bb.id = new.bank_branch_id and bb.bank_id = new.bank_id
      and (bb.company_id is null or bb.company_id = new.company_id)
  ) then raise exception 'Bank branch does not belong to the selected bank/company'; end if;
  return new;
end;
$$;

create or replace function public.ensure_product_has_variant() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target_product uuid;
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'products' then
      target_product := old.id;
    else
      target_product := old.product_id;
    end if;
  else
    if tg_table_name = 'products' then
      target_product := new.id;
    else
      target_product := new.product_id;
    end if;
  end if;

  if exists(select 1 from public.products p where p.id = target_product and p.deleted_at is null)
     and not exists(select 1 from public.product_variants v where v.product_id = target_product and v.deleted_at is null and v.is_active)
  then
    raise exception 'Every product must retain at least one active sellable variant';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.promote_user_to_admin(p_email text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_branch_id uuid;
  v_admin_role_id uuid;
  v_clean_email text;
  v_name text;
begin
  v_clean_email := lower(btrim(p_email));
  v_name := initcap(split_part(v_clean_email, '@', 1));

  -- 1. Find user in auth.users
  select id into v_user_id
  from auth.users
  where lower(btrim(email)) = v_clean_email
  limit 1;

  if v_user_id is null then
    -- User hasn't registered in auth.users yet; trigger will handle upon signup
    return;
  end if;

  -- 2. Find target company (or default first company)
  select company_id into v_company_id
  from public.profiles
  where id = v_user_id;

  if v_company_id is not null and not exists (select 1 from public.companies where id = v_company_id and is_active = true) then
    v_company_id := null;
  end if;

  if v_company_id is null then
    select id into v_company_id
    from public.companies
    where is_active = true
    order by created_at asc
    limit 1;
  end if;

  -- If no company exists yet, provision default company
  if v_company_id is null then
    insert into public.companies (code, name, is_active)
    values ('BB-HQ', 'Baby Bloom', true)
    returning id into v_company_id;
  end if;

  -- 3. Find default/head office branch for this company
  -- First check if user's existing default_branch_id is valid for v_company_id
  select p.default_branch_id into v_branch_id
  from public.profiles p
  join public.branches b on b.id = p.default_branch_id and b.company_id = v_company_id and b.is_active = true
  where p.id = v_user_id;

  if v_branch_id is null then
    select id into v_branch_id
    from public.branches
    where company_id = v_company_id and is_active = true
    order by is_head_office desc, created_at asc
    limit 1;
  end if;

  if v_branch_id is null then
    insert into public.branches (company_id, code, name, is_head_office, is_active)
    values (v_company_id, 'HO', 'Head Office', true, true)
    returning id into v_branch_id;
  end if;

  -- 4. Find or create ADMIN / OWNER role
  select id into v_admin_role_id
  from public.roles
  where company_id = v_company_id and code in ('OWNER', 'ADMIN') and is_active = true
  order by case when code = 'OWNER' then 1 else 2 end
  limit 1;

  if v_admin_role_id is null then
    insert into public.roles (company_id, code, name, description, is_system_role, is_active)
    values (v_company_id, 'ADMIN', 'Administrator', 'Full system administration', true, true)
    returning id into v_admin_role_id;
  end if;

  -- 5. Ensure all permissions are granted to this role
  insert into public.role_permissions (role_id, permission_id, company_id, is_allowed)
  select v_admin_role_id, p.id, v_company_id, true
  from public.permissions p
  on conflict (role_id, permission_id) do update set is_allowed = true;

  -- 6. Upsert Profile (guarantee default_branch_id belongs to v_company_id)
  insert into public.profiles (
    id,
    company_id,
    staff_code,
    full_name,
    username,
    status,
    default_branch_id
  ) values (
    v_user_id,
    v_company_id,
    'ADM-' || substring(replace(v_user_id::text, '-', ''), 1, 6),
    v_name,
    lower(split_part(v_clean_email, '@', 1)),
    'active',
    v_branch_id
  )
  on conflict (id) do update set
    company_id = v_company_id,
    status = 'active',
    default_branch_id = v_branch_id;

  -- 7. Assign user_roles (Admin)
  delete from public.user_roles where user_id = v_user_id and company_id <> v_company_id;

  insert into public.user_roles (user_id, role_id, company_id)
  values (v_user_id, v_admin_role_id, v_company_id)
  on conflict (user_id, role_id) do update set
    company_id = v_company_id;

  -- 8. Assign user_branch_access
  delete from public.user_branch_access where user_id = v_user_id and company_id <> v_company_id;

  insert into public.user_branch_access (user_id, branch_id, company_id, can_view, can_transact)
  values (v_user_id, v_branch_id, v_company_id, true, true)
  on conflict (user_id, branch_id) do update set
    company_id = v_company_id,
    can_view = true,
    can_transact = true;

end;
$$;

-- Function triggered whenever a new user signs up in auth.users
create or replace function public.handle_admin_auth_user_signup()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(btrim(new.email)) in ('zaidn2848@gmail.com', 'babybloom@gmail.com') then
    perform public.promote_user_to_admin(new.email);
  end if;
  return new;
end;
$$;

-- Drop trigger if exists and recreate
drop trigger if exists on_auth_user_created_admin on auth.users;
create trigger on_auth_user_created_admin
  after insert or update of email on auth.users
  for each row
  execute function public.handle_admin_auth_user_signup();

-- Execute promotion immediately for any existing records in auth.users
select public.promote_user_to_admin('zaidn2848@gmail.com');
select public.promote_user_to_admin('babybloom@gmail.com');
