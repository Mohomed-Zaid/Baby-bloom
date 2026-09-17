-- Phase 6: server-side calculations, document protection, audit, and RLS.
create function public.calculate_sales_invoice_item() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.sales_invoices%rowtype; base numeric(18,2); discounted numeric(18,2); avg_cost numeric(18,4); stock_state record;
begin
 select * into d from public.sales_invoices where id=new.invoice_id;
 if not found or d.company_id<>new.company_id then raise exception 'Invalid sales invoice company';end if;
 if d.status not in ('draft','held') then raise exception 'Invoice items can only change while the invoice is draft or held';end if;
 if not exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id and p.company_id=v.company_id where v.id=new.product_variant_id and v.company_id=new.company_id and v.is_active and v.deleted_at is null and p.product_status='active' and p.deleted_at is null and p.track_stock) then raise exception 'An active stock product variant is required';end if;
 select * into stock_state from public.inventory_stock_state(new.company_id,d.stock_location_id,new.product_variant_id);
 avg_cost:=coalesce(stock_state.average_cost,0);
 new.cost_price:=avg_cost;
 base:=round(new.quantity*new.unit_price,2);
 if new.discount_type='percentage' then
  if new.discount_value>100 then raise exception 'Percentage discount cannot exceed 100';end if;
  new.discount_amount:=round(base*new.discount_value/100,2);
 elsif new.discount_type='fixed' then
  if new.discount_value>base then raise exception 'Fixed discount cannot exceed line subtotal';end if;
  new.discount_amount:=round(new.discount_value,2);
 else new.discount_value:=0;new.discount_amount:=0;end if;
 discounted:=base-new.discount_amount;
 new.line_subtotal:=base;
 new.tax_amount:=round(discounted*new.tax_rate/100,2);
 new.line_total:=discounted+new.tax_amount;
 new.created_by:=coalesce(new.created_by,auth.uid());return new;
end $$;
create trigger sales_invoice_items_calculate before insert or update of product_variant_id,quantity,unit_price,discount_type,discount_value,tax_rate on public.sales_invoice_items for each row execute function public.calculate_sales_invoice_item();

create function public.validate_sales_invoice_document() returns trigger language plpgsql security definer set search_path='' as $$
declare business_date date:=(now() at time zone 'Asia/Colombo')::date;
begin
 if tg_op='INSERT' then
  if new.reversal_of_id is null and (new.subtotal<>0 or new.item_discount_total<>0 or new.bill_discount_amount<>0 or new.tax_total<>0 or new.grand_total<>0 or new.paid_amount<>0 or new.balance_amount<>0) then raise exception 'Authoritative invoice totals must start at zero';end if;
  if auth.uid() is not null and (new.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(new.branch_id) or not public.user_has_permission(case when new.reversal_of_id is null then 'sales.create' else 'sales.reverse' end)) then raise exception 'Not authorised to create this sales invoice' using errcode='42501';end if;
  if new.invoice_date<business_date and auth.uid() is not null and not public.user_has_permission('sales.backdate') then raise exception 'Backdated sales invoices require sales.backdate' using errcode='42501';end if;
 elsif coalesce(current_setting('app.sales_workflow',true),'')<>'on' then
  if old.status not in ('draft','held') then raise exception 'Only draft or held invoices can be edited directly';end if;
  if new.subtotal is distinct from old.subtotal or new.item_discount_total is distinct from old.item_discount_total or new.bill_discount_amount is distinct from old.bill_discount_amount or new.tax_total is distinct from old.tax_total or new.grand_total is distinct from old.grand_total or new.paid_amount is distinct from old.paid_amount or new.balance_amount is distinct from old.balance_amount then raise exception 'Invoice totals are calculated by PostgreSQL';end if;
  if auth.uid() is not null and not public.user_has_permission('sales.update_draft') then raise exception 'sales.update_draft permission required' using errcode='42501';end if;
  if new.company_id<>old.company_id or new.branch_id<>old.branch_id or new.invoice_number is distinct from old.invoice_number then raise exception 'Invoice identity cannot be changed';end if;
 end if;
 if not exists(select 1 from public.customers c where c.id=new.customer_id and c.company_id=new.company_id and (new.reversal_of_id is not null or (c.is_active and c.deleted_at is null))) then raise exception 'A valid customer from the same company is required';end if;
 if not exists(select 1 from public.stock_locations l where l.id=new.stock_location_id and l.company_id=new.company_id and l.branch_id=new.branch_id and l.warehouse_id=new.warehouse_id and (new.reversal_of_id is not null or (l.is_active and l.deleted_at is null))) then raise exception 'A valid stock location in the selected warehouse is required';end if;
 if new.due_date<new.invoice_date then raise exception 'Due date cannot precede invoice date';end if;
 new.updated_at:=now();new.updated_by:=coalesce(auth.uid(),new.updated_by);return new;
end $$;
create trigger sales_invoices_validate before insert or update on public.sales_invoices for each row execute function public.validate_sales_invoice_document();

create function public.validate_sales_return_document() returns trigger language plpgsql security definer set search_path='' as $$
declare original public.sales_invoices%rowtype;
begin
 if tg_op='INSERT' then
  if auth.uid() is not null and (new.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(new.branch_id) or not public.user_has_permission(case when new.reversal_of_id is null then 'sales_returns.create' else 'sales_returns.reverse' end)) then raise exception 'Not authorised to create this sales return' using errcode='42501';end if;
 elsif coalesce(current_setting('app.sales_return_workflow',true),'')<>'on' then
  if old.status not in ('draft','held') then raise exception 'Only draft or held returns can be edited';end if;
  if new.company_id<>old.company_id or new.branch_id<>old.branch_id or new.return_number is distinct from old.return_number then raise exception 'Sales return identity cannot be changed';end if;
 end if;
 if not exists(select 1 from public.customers c where c.id=new.customer_id and c.company_id=new.company_id and (new.reversal_of_id is not null or (c.is_active and c.deleted_at is null))) then raise exception 'A valid customer from the same company is required';end if;
 if not exists(select 1 from public.stock_locations l where l.id=new.stock_location_id and l.company_id=new.company_id and l.branch_id=new.branch_id and l.warehouse_id=new.warehouse_id and (new.reversal_of_id is not null or (l.is_active and l.deleted_at is null))) then raise exception 'A valid stock location in the selected warehouse is required';end if;
 if new.invoice_id is not null then
  select * into original from public.sales_invoices where id=new.invoice_id and company_id=new.company_id;
  if not found or original.customer_id<>new.customer_id or (new.reversal_of_id is null and original.status<>'posted') then raise exception 'Linked invoice must be posted and belong to the selected customer';end if;
 elsif auth.uid() is not null and not public.user_has_permission('sales_returns.unlinked') then raise exception 'Unlinked returns require sales_returns.unlinked' using errcode='42501';end if;
 new.updated_at:=now();new.updated_by:=coalesce(auth.uid(),new.updated_by);return new;
end $$;
create trigger sales_returns_validate before insert or update on public.sales_returns for each row execute function public.validate_sales_return_document();

create function public.calculate_sales_return_item() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.sales_returns%rowtype; original public.sales_invoice_items%rowtype;
begin
 select * into d from public.sales_returns where id=new.sales_return_id;
 if not found or d.company_id<>new.company_id or d.status not in ('draft','held') then raise exception 'Return items require a draft return in the same company';end if;
 if new.original_invoice_item_id is not null then
  select * into original from public.sales_invoice_items where id=new.original_invoice_item_id and company_id=new.company_id;
  if not found or original.invoice_id<>d.invoice_id or original.product_variant_id<>new.product_variant_id then raise exception 'Invalid original invoice item';end if;
  new.unit_price:=original.unit_price;
  new.cost_price:=original.cost_price;
 elsif auth.uid() is not null and not public.user_has_permission('sales_returns.unlinked') then raise exception 'Unlinked return requires sales_returns.unlinked' using errcode='42501';
 elsif new.unit_price<=0 then raise exception 'An unlinked return requires a positive unit price';end if;
 new.line_total:=round(new.quantity*new.unit_price-new.discount_amount+new.tax_amount,2);
 if new.line_total<0 then raise exception 'Return line total cannot be negative';end if;
 new.created_by:=coalesce(new.created_by,auth.uid());return new;
end $$;
create trigger sales_return_items_calculate before insert or update on public.sales_return_items for each row execute function public.calculate_sales_return_item();

create function public.validate_invoice_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.sales_invoices%rowtype;
begin
 if tg_op='UPDATE' and old.status in ('posted','reversed','cancelled') and coalesce(current_setting('app.sales_payment_workflow',true),'')<>'on' then raise exception 'Posted invoice payments are immutable';end if;
 if new.company_id<>public.current_user_company_id() and auth.uid() is not null then raise exception 'Invalid payment company' using errcode='42501';end if;
 if auth.uid() is not null and not public.user_can_transact_in_branch(new.branch_id) then raise exception 'Payment branch denied' using errcode='42501';end if;
 if new.invoice_id is not null then
  select * into d from public.sales_invoices where id=new.invoice_id and company_id=new.company_id;
  if not found or d.customer_id<>new.customer_id or d.branch_id<>new.branch_id then raise exception 'Payment does not match its invoice';end if;
 end if;
 if new.payment_method in ('card','bank_transfer') and (new.bank_account_id is null or not exists(select 1 from public.bank_accounts b where b.id=new.bank_account_id and b.company_id=new.company_id and b.branch_id=new.branch_id and b.is_active)) then raise exception 'An active branch bank account is required';end if;
 if new.payment_method='cheque' then new.clearing_status:='pending';else new.clearing_status:='cleared';end if;
 new.created_by:=coalesce(new.created_by,auth.uid());return new;
end $$;
create trigger invoice_payments_validate before insert or update on public.invoice_payments for each row execute function public.validate_invoice_payment();

create function public.prevent_customer_ledger_change() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Customer ledger entries are immutable; create a reversal entry';end$$;
create trigger customer_ledger_immutable before update or delete on public.customer_ledger_entries for each row execute function public.prevent_customer_ledger_change();

create function public.customer_opening_balance_entry() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.opening_balance>0 then
  insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
  values(new.company_id,new.branch_id,new.id,(now() at time zone 'Asia/Colombo')::date,'opening_balance','customer',new.id,new.customer_code,case when new.opening_balance_type='debit' then new.opening_balance else 0 end,case when new.opening_balance_type='credit' then new.opening_balance else 0 end,'Customer opening balance',new.created_by);
 end if;return new;
end $$;
create trigger customers_opening_ledger after insert on public.customers for each row execute function public.customer_opening_balance_entry();
insert into public.customer_ledger_entries(company_id,branch_id,customer_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
select c.company_id,c.branch_id,c.id,c.created_at::date,'opening_balance','customer',c.id,c.customer_code,case when c.opening_balance_type='debit' then c.opening_balance else 0 end,case when c.opening_balance_type='credit' then c.opening_balance else 0 end,'Customer opening balance migration',c.created_by
from public.customers c where c.opening_balance>0 and not exists(select 1 from public.customer_ledger_entries e where e.reference_type='customer' and e.reference_id=c.id and e.entry_type='opening_balance');

do $$declare n text;begin
 foreach n in array array['sales_invoices','sales_invoice_items','invoice_payments','sales_returns','sales_return_items'] loop
  execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()',n,n);
 end loop;
end$$;

alter table public.sales_invoices enable row level security;
alter table public.sales_invoice_items enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.customer_ledger_entries enable row level security;
alter table public.sales_returns enable row level security;
alter table public.sales_return_items enable row level security;
revoke all on public.sales_invoices,public.sales_invoice_items,public.invoice_payments,public.customer_ledger_entries,public.sales_returns,public.sales_return_items from anon;
grant select,insert,update on public.sales_invoices,public.sales_invoice_items,public.invoice_payments,public.sales_returns,public.sales_return_items to authenticated;
grant select on public.customer_ledger_entries to authenticated;
revoke insert,update,delete on public.customer_ledger_entries from authenticated;
revoke delete on public.sales_invoices,public.sales_invoice_items,public.invoice_payments,public.sales_returns,public.sales_return_items from authenticated;

create policy sales_invoices_read on public.sales_invoices for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('sales.view'));
create policy sales_invoices_insert on public.sales_invoices for insert to authenticated with check(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('sales.create'));
create policy sales_invoices_update_draft on public.sales_invoices for update to authenticated using(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and status in ('draft','held') and public.user_has_permission('sales.update_draft')) with check(company_id=public.current_user_company_id());
create policy sales_items_read on public.sales_invoice_items for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_permission('sales.view') and exists(select 1 from public.sales_invoices s where s.id=invoice_id and public.user_has_branch_access(s.branch_id)));
create policy sales_items_manage on public.sales_invoice_items for all to authenticated using(company_id=public.current_user_company_id() and exists(select 1 from public.sales_invoices s where s.id=invoice_id and s.status in ('draft','held') and public.user_can_transact_in_branch(s.branch_id)) and public.user_has_permission('sales.update_draft')) with check(company_id=public.current_user_company_id());
create policy invoice_payments_read on public.invoice_payments for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and (public.user_has_permission('sales.view') or public.user_has_permission('customer_statements.view')));
create policy invoice_payments_insert on public.invoice_payments for insert to authenticated with check(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('customer_payments.create'));
create policy invoice_payments_update_draft on public.invoice_payments for update to authenticated using(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and status='draft' and public.user_has_permission('customer_payments.create')) with check(company_id=public.current_user_company_id());
create policy customer_ledger_read on public.customer_ledger_entries for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('customer_statements.view'));
create policy sales_returns_read on public.sales_returns for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('sales_returns.view'));
create policy sales_returns_insert on public.sales_returns for insert to authenticated with check(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('sales_returns.create'));
create policy sales_returns_update_draft on public.sales_returns for update to authenticated using(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and status in ('draft','held') and public.user_has_permission('sales_returns.create')) with check(company_id=public.current_user_company_id());
create policy sales_return_items_read on public.sales_return_items for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_permission('sales.view') and exists(select 1 from public.sales_returns r where r.id=sales_return_id and public.user_has_branch_access(r.branch_id)));
create policy sales_return_items_manage on public.sales_return_items for all to authenticated using(company_id=public.current_user_company_id() and exists(select 1 from public.sales_returns r where r.id=sales_return_id and r.status in ('draft','held') and public.user_can_transact_in_branch(r.branch_id)) and public.user_has_permission('sales_returns.create')) with check(company_id=public.current_user_company_id());

revoke all on function public.calculate_sales_invoice_item(),public.validate_sales_invoice_document(),public.validate_sales_return_document(),public.calculate_sales_return_item(),public.validate_invoice_payment(),public.prevent_customer_ledger_change(),public.customer_opening_balance_entry() from public,anon,authenticated;
