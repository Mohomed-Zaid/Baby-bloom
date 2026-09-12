# Secure first-owner onboarding

`provision_first_company_owner` is intentionally revoked from `PUBLIC`, `anon`, and `authenticated`. Only PostgreSQL administration and the Supabase `service_role` may execute it.

1. Create and verify the first owner in Supabase Auth from a trusted server-side/admin workflow.
2. Capture the new `auth.users.id`.
3. Run the function from the Supabase SQL editor, CLI-connected PostgreSQL session, or a protected server process using the service-role credential:

```sql
select public.provision_first_company_owner(
  p_owner_user_id := '<auth-user-uuid>',
  p_company_code := 'BB',
  p_company_name := 'Baby Bloom',
  p_owner_full_name := '<owner name>',
  p_owner_username := '<owner username>'
);
```

The function creates one company boundary, head-office branch, default warehouse/location, owner profile, six controlled roles, full owner permissions, head-office access, the onboarding-only C-001 Cash Customer, document sequences, standard chart of accounts, and mappings in one transaction. Any failure rolls the transaction back.

Never put the service-role key in Vite environment variables, browser code, localStorage, or a public deployment. Rotate the credential immediately if it is exposed.