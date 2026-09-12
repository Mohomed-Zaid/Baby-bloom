-- Phase 2 documented verification queries
-- Run only against a disposable local database after provisioning Company A/User A and Company B/User B.
-- Set the UUID variables in psql/Supabase SQL editor, then SET ROLE authenticated and set JWT sub claims.
-- Every query states its required outcome; use BEGIN/ROLLBACK around mutation checks.

-- 1. Company A cannot read Company B.
-- select set_config('request.jwt.claim.sub', '<user-a-uuid>', true);
-- select count(*) = 0 as pass from public.companies where id = '<company-b-uuid>'; -- expected true

-- 2. No branch access means no branch read.
-- select count(*) = 0 as pass from public.branches where id = '<company-a-unassigned-branch-uuid>'; -- expected true

-- 3. View-only branch user cannot create a branch-owned record even if a create permission was assigned.
-- insert into public.customers(company_id, branch_id, customer_code, name)
-- values ('<company-a-uuid>', '<view-only-branch-uuid>', 'RLS-TEST', 'Must Fail'); -- expected 42501 / RLS violation

-- 4. A cashier without products.view_cost receives NULL cost columns through the only granted cost-safe view.
-- select purchase_price is null and average_cost is null and minimum_price is null as pass
-- from public.product_variants_secure limit 1; -- expected true
-- select purchase_price from public.product_variants; -- expected permission denied

-- 5. A user cannot assign themselves a role.
-- insert into public.user_roles(user_id, role_id, company_id)
-- values ('<user-a-uuid>', '<role-a-uuid>', '<company-a-uuid>'); -- expected 42501

-- 6. Duplicate barcodes are rejected both within and across variant/additional-barcode tables.
-- insert the same (company_id, barcode) into product_variants twice, or once in product_variants and
-- once in product_barcodes. -- expected unique_violation or "Barcode already exists for this company"

-- 7. Concurrent document numbers are unique.
-- In two SQL sessions, BEGIN and call the following before either session commits:
-- select public.next_document_number('<company-a-uuid>', '<branch-a-uuid>', 'invoice');
-- The second session waits for the row lock; after the first commits it returns the next value.
-- Expected: e.g. INV-000001 and INV-000002, never duplicates.

-- 8. Cross-company foreign keys are rejected.
-- insert into public.products(company_id, product_code, name, category_id, base_unit_id)
-- values ('<company-a-uuid>', 'X-COMPANY', 'Must Fail', '<company-b-category-uuid>', '<company-a-unit-uuid>');
-- expected foreign_key_violation / cross-company reference rejection

-- 9. Audit logs are append-only to authenticated users.
-- update public.audit_logs set reason = 'tamper' where company_id = '<company-a-uuid>'; -- expected permission denied
-- delete from public.audit_logs where company_id = '<company-a-uuid>'; -- expected permission denied

-- 10. Soft-deleted records are excluded by normal RLS reads.
-- update public.customers set deleted_at = now() where id = '<company-a-customer-uuid>';
-- select count(*) = 0 as pass from public.customers where id = '<company-a-customer-uuid>'; -- expected true

-- Constraint smoke checks that can run as database owner in a disposable transaction:
begin;
do $$
declare company_uuid uuid; branch_uuid uuid;
begin
  insert into public.companies(code, name) values ('VERIFY-' || substr(gen_random_uuid()::text, 1, 8), 'Verification Company') returning id into company_uuid;
  insert into public.branches(company_id, code, name, is_head_office) values (company_uuid, 'HO', 'Head Office', true) returning id into branch_uuid;
  begin
    insert into public.branches(company_id, code, name, is_head_office) values (company_uuid, 'B2', 'Second Head Office', true);
    raise exception 'Verification failed: duplicate head office was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.customers(company_id, branch_id, customer_code, name, credit_limit) values (company_uuid, branch_uuid, 'BAD', 'Invalid Credit', -1);
    raise exception 'Verification failed: negative credit was accepted';
  exception when check_violation then null;
  end;
end $$;
rollback;