-- Phase 5: server calculations, document protection, audit, and RLS.
create function public.calculate_purchase_item() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.purchases%rowtype; base numeric(18,2); discounted numeric(18,2);
begin
 select * into d from public.purchases where id=new.purchase_id;
 if not found or d.company_id<>new.company_id then raise exception 'Invalid purchase company';end if;
 if d.status<>'draft' then raise exception 'Purchase items can only change while the purchase is draft';end if;
 if not exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id and p.company_id=v.company_id where v.id=new.product_variant_id and v.company_id=new.company_id and v.is_active and v.deleted_at is null and p.product_status='active' and p.deleted_at is null and p.track_stock) then raise exception 'An active stock product variant is required';end if;
 if not exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id and p.company_id=v.company_id join public.units u on u.id=p.base_unit_id and u.company_id=p.company_id where v.id=new.product_variant_id and v.company_id=new.company_id and u.id=new.unit_id and u.is_active and u.deleted_at is null) then raise exception 'The active product base unit is required; unit conversion is not posted in Phase 5';end if;
 base:=round(new.quantity*new.unit_cost,2);
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
 new.allocated_bill_discount:=0;new.allocated_extra_cost:=0;
 new.final_unit_cost:=case when new.quantity+new.free_quantity=0 then 0 else round(new.line_total/(new.quantity+new.free_quantity),4) end;
 new.created_by:=coalesce(new.created_by,auth.uid());return new;
end $$;
create trigger purchase_items_calculate before insert or update of product_variant_id,unit_id,quantity,free_quantity,unit_cost,discount_type,discount_value,tax_rate,batch_reference,manufacture_date,expiry_date,warranty_days on public.purchase_items for each row execute function public.calculate_purchase_item();

create function public.validate_purchase_document() returns trigger language plpgsql security definer set search_path='' as $$
declare business_date date:=(now() at time zone 'Asia/Colombo')::date;
begin
 if tg_op='INSERT' then
  if new.reversal_of_id is null and (new.subtotal<>0 or new.item_discount_total<>0 or new.bill_discount_amount<>0 or new.tax_total<>0 or new.grand_total<>0 or new.paid_amount<>0 or new.balance_amount<>0) then raise exception 'Authoritative purchase totals must start at zero';end if;
  if auth.uid() is not null and (new.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(new.branch_id) or not public.user_has_permission(case when new.reversal_of_id is null then 'purchases.create' else 'purchases.reverse' end)) then raise exception 'Not authorised to create this purchase document' using errcode='42501';end if;
  if new.purchase_date<business_date and auth.uid() is not null and not public.user_has_permission('purchases.backdate') then raise exception 'Backdated purchases require purchases.backdate' using errcode='42501';end if;
 elsif coalesce(current_setting('app.purchase_workflow',true),'')<>'on' then
 if old.status<>'draft' then raise exception 'Only draft purchases can be edited';end if;
  if new.subtotal is distinct from old.subtotal or new.item_discount_total is distinct from old.item_discount_total or new.bill_discount_amount is distinct from old.bill_discount_amount or new.tax_total is distinct from old.tax_total or new.grand_total is distinct from old.grand_total or new.paid_amount is distinct from old.paid_amount or new.balance_amount is distinct from old.balance_amount then raise exception 'Purchase totals are calculated by PostgreSQL';end if;
  if auth.uid() is not null and not public.user_has_permission('purchases.update_draft') then raise exception 'purchases.update_draft permission required' using errcode='42501';end if;
  if new.company_id<>old.company_id or new.branch_id<>old.branch_id or new.purchase_number is distinct from old.purchase_number then raise exception 'Purchase identity cannot be changed';end if;
 end if;
 if not exists(select 1 from public.vendors v where v.id=new.vendor_id and v.company_id=new.company_id and (new.reversal_of_id is not null or (v.status='active' and v.deleted_at is null))) then raise exception 'A valid vendor from the same company is required';end if;
 if not exists(select 1 from public.stock_locations l where l.id=new.stock_location_id and l.company_id=new.company_id and l.branch_id=new.branch_id and l.warehouse_id=new.warehouse_id and (new.reversal_of_id is not null or (l.is_active and l.deleted_at is null))) then raise exception 'A valid stock location in the selected warehouse is required';end if;
 if new.due_date<new.purchase_date then raise exception 'Due date cannot precede purchase date';end if;
 new.updated_at:=now();new.updated_by:=coalesce(auth.uid(),new.updated_by);return new;
end $$;
create trigger purchases_validate before insert or update on public.purchases for each row execute function public.validate_purchase_document();

create function public.validate_purchase_return_document() returns trigger language plpgsql security definer set search_path='' as $$
declare original public.purchases%rowtype;
begin
 if tg_op='INSERT' then
  if auth.uid() is not null and (new.company_id<>public.current_user_company_id() or not public.user_can_transact_in_branch(new.branch_id) or not public.user_has_permission(case when new.reversal_of_id is null then 'purchase_returns.create' else 'purchase_returns.reverse' end)) then raise exception 'Not authorised to create this purchase-return document' using errcode='42501';end if;
 elsif coalesce(current_setting('app.purchase_return_workflow',true),'')<>'on' then
  if old.status<>'draft' then raise exception 'Only draft purchase returns can be edited';end if;
  if new.company_id<>old.company_id or new.branch_id<>old.branch_id or new.return_number is distinct from old.return_number then raise exception 'Purchase return identity cannot be changed';end if;
 end if;
 if not exists(select 1 from public.vendors v where v.id=new.vendor_id and v.company_id=new.company_id and (new.reversal_of_id is not null or (v.status='active' and v.deleted_at is null))) then raise exception 'A valid vendor from the same company is required';end if;
 if not exists(select 1 from public.stock_locations l where l.id=new.stock_location_id and l.company_id=new.company_id and l.branch_id=new.branch_id and l.warehouse_id=new.warehouse_id and (new.reversal_of_id is not null or (l.is_active and l.deleted_at is null))) then raise exception 'A valid stock location in the selected warehouse is required';end if;
 if new.purchase_id is not null then
  select * into original from public.purchases where id=new.purchase_id and company_id=new.company_id;
  if not found or original.vendor_id<>new.vendor_id or (new.reversal_of_id is null and original.status<>'posted') then raise exception 'Linked purchase must be posted and belong to the selected vendor';end if;
 elsif auth.uid() is not null and not public.user_has_permission('purchase_returns.unlinked') then raise exception 'Unlinked returns require purchase_returns.unlinked' using errcode='42501';end if;
 new.updated_at:=now();new.updated_by:=coalesce(auth.uid(),new.updated_by);return new;
end $$;
create trigger purchase_returns_validate before insert or update on public.purchase_returns for each row execute function public.validate_purchase_return_document();

create function public.calculate_purchase_return_item() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.purchase_returns%rowtype; original public.purchase_items%rowtype;
begin
 select * into d from public.purchase_returns where id=new.purchase_return_id;
 if not found or d.company_id<>new.company_id or d.status<>'draft' then raise exception 'Return items require a draft return in the same company';end if;
 if new.original_purchase_item_id is not null then
  select * into original from public.purchase_items where id=new.original_purchase_item_id and company_id=new.company_id;
  if not found or original.purchase_id<>d.purchase_id or original.product_variant_id<>new.product_variant_id then raise exception 'Invalid original purchase item';end if;
  new.unit_cost:=original.final_unit_cost;
 elsif auth.uid() is not null and (not public.user_has_permission('purchase_returns.unlinked') or not public.user_has_permission('purchases.view_cost')) then raise exception 'Unlinked return cost requires additional permission' using errcode='42501';
 elsif new.unit_cost<=0 then raise exception 'An unlinked return requires a positive authorised unit cost';end if;
 new.line_total:=round(new.quantity*new.unit_cost-new.discount_amount+new.tax_amount,2);
 if new.line_total<0 then raise exception 'Return line total cannot be negative';end if;
 new.created_by:=coalesce(new.created_by,auth.uid());return new;
end $$;
create trigger purchase_return_items_calculate before insert or update on public.purchase_return_items for each row execute function public.calculate_purchase_return_item();

create function public.validate_purchase_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.purchases%rowtype;
begin
 if tg_op='UPDATE' and old.status in ('posted','reversed','cancelled') and coalesce(current_setting('app.purchase_payment_workflow',true),'')<>'on' then raise exception 'Posted payments are immutable';end if;
 if new.company_id<>public.current_user_company_id() and auth.uid() is not null then raise exception 'Invalid payment company' using errcode='42501';end if;
 if auth.uid() is not null and not public.user_can_transact_in_branch(new.branch_id) then raise exception 'Payment branch denied' using errcode='42501';end if;
 if new.purchase_id is not null then
  select * into d from public.purchases where id=new.purchase_id and company_id=new.company_id;
  if not found or d.vendor_id<>new.vendor_id or d.branch_id<>new.branch_id then raise exception 'Payment does not match its purchase';end if;
 end if;
 if new.payment_method in ('bank','card','online') and (new.bank_account_id is null or not exists(select 1 from public.bank_accounts b where b.id=new.bank_account_id and b.company_id=new.company_id and b.branch_id=new.branch_id and b.is_active)) then raise exception 'An active branch bank account is required';end if;
 if new.payment_method='cash' and not exists(select 1 from public.account_mappings m where m.company_id=new.company_id and m.mapping_key='cash_in_hand') then raise exception 'Cash account mapping is required';end if;
 if new.payment_method='cheque' then new.clearing_status:='pending';else new.clearing_status:='cleared';end if;
 new.created_by:=coalesce(new.created_by,auth.uid());return new;
end $$;
create trigger purchase_payments_validate before insert or update on public.purchase_payments for each row execute function public.validate_purchase_payment();

create function public.prevent_vendor_ledger_change() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Vendor ledger entries are immutable; create a reversal entry';end$$;
create trigger vendor_ledger_immutable before update or delete on public.vendor_ledger_entries for each row execute function public.prevent_vendor_ledger_change();

create function public.vendor_opening_balance_entry() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.opening_balance>0 then
  insert into public.vendor_ledger_entries(company_id,branch_id,vendor_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
  values(new.company_id,new.branch_id,new.id,(now() at time zone 'Asia/Colombo')::date,'opening_balance','vendor',new.id,new.vendor_code,case when new.opening_balance_type='debit' then new.opening_balance else 0 end,case when new.opening_balance_type='credit' then new.opening_balance else 0 end,'Vendor opening balance',new.created_by);
 end if;return new;
end $$;
create trigger vendors_opening_ledger after insert on public.vendors for each row execute function public.vendor_opening_balance_entry();
insert into public.vendor_ledger_entries(company_id,branch_id,vendor_id,entry_date,entry_type,reference_type,reference_id,reference_number,debit_amount,credit_amount,notes,created_by)
select v.company_id,v.branch_id,v.id,v.created_at::date,'opening_balance','vendor',v.id,v.vendor_code,case when v.opening_balance_type='debit' then v.opening_balance else 0 end,case when v.opening_balance_type='credit' then v.opening_balance else 0 end,'Vendor opening balance migration',v.created_by
from public.vendors v where v.opening_balance>0 and not exists(select 1 from public.vendor_ledger_entries e where e.reference_type='vendor' and e.reference_id=v.id and e.entry_type='opening_balance');

create function public.protect_vendor_opening_balance() returns trigger language plpgsql set search_path='' as $$begin if new.opening_balance is distinct from old.opening_balance or new.opening_balance_type is distinct from old.opening_balance_type then raise exception 'Opening balance is immutable after vendor creation; use a supplier adjustment';end if;return new;end$$;
create trigger vendors_protect_opening_balance before update of opening_balance,opening_balance_type on public.vendors for each row execute function public.protect_vendor_opening_balance();

do $$declare n text;begin
 foreach n in array array['purchases','purchase_items','purchase_payments','purchase_returns','purchase_return_items'] loop
  execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()',n,n);
 end loop;
end$$;

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchase_payments enable row level security;
alter table public.vendor_ledger_entries enable row level security;
alter table public.purchase_returns enable row level security;
alter table public.purchase_return_items enable row level security;
revoke all on public.purchases,public.purchase_items,public.purchase_payments,public.vendor_ledger_entries,public.purchase_returns,public.purchase_return_items from anon;
grant select,insert,update on public.purchases,public.purchase_items,public.purchase_payments,public.purchase_returns,public.purchase_return_items to authenticated;
grant select on public.vendor_ledger_entries to authenticated;
revoke insert,update,delete on public.vendor_ledger_entries from authenticated;
revoke delete on public.purchases,public.purchase_items,public.purchase_payments,public.purchase_returns,public.purchase_return_items from authenticated;

create policy purchases_read on public.purchases for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('purchases.view'));
create policy purchases_insert on public.purchases for insert to authenticated with check(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('purchases.create'));
create policy purchases_update_draft on public.purchases for update to authenticated using(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and status='draft' and public.user_has_permission('purchases.update_draft')) with check(company_id=public.current_user_company_id());
create policy purchase_items_read on public.purchase_items for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_permission('purchases.view_cost') and exists(select 1 from public.purchases p where p.id=purchase_id and public.user_has_branch_access(p.branch_id)));
create policy purchase_items_manage on public.purchase_items for all to authenticated using(company_id=public.current_user_company_id() and exists(select 1 from public.purchases p where p.id=purchase_id and p.status='draft' and public.user_can_transact_in_branch(p.branch_id)) and public.user_has_permission('purchases.update_draft')) with check(company_id=public.current_user_company_id());
create policy purchase_payments_read on public.purchase_payments for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and (public.user_has_permission('purchases.view') or public.user_has_permission('vendor_statements.view')));
create policy purchase_payments_insert on public.purchase_payments for insert to authenticated with check(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('supplier_payments.create'));
create policy purchase_payments_update_draft on public.purchase_payments for update to authenticated using(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and status='draft' and public.user_has_permission('supplier_payments.create')) with check(company_id=public.current_user_company_id());
create policy vendor_ledger_read on public.vendor_ledger_entries for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('vendor_statements.view'));
create policy purchase_returns_read on public.purchase_returns for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_branch_access(branch_id) and public.user_has_permission('purchase_returns.view'));
create policy purchase_returns_insert on public.purchase_returns for insert to authenticated with check(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and public.user_has_permission('purchase_returns.create'));
create policy purchase_returns_update_draft on public.purchase_returns for update to authenticated using(company_id=public.current_user_company_id() and public.user_can_transact_in_branch(branch_id) and status='draft' and public.user_has_permission('purchase_returns.create')) with check(company_id=public.current_user_company_id());
create policy purchase_return_items_read on public.purchase_return_items for select to authenticated using(company_id=public.current_user_company_id() and public.user_has_permission('purchases.view_cost') and exists(select 1 from public.purchase_returns r where r.id=purchase_return_id and public.user_has_branch_access(r.branch_id)));
create policy purchase_return_items_manage on public.purchase_return_items for all to authenticated using(company_id=public.current_user_company_id() and exists(select 1 from public.purchase_returns r where r.id=purchase_return_id and r.status='draft' and public.user_can_transact_in_branch(r.branch_id)) and public.user_has_permission('purchase_returns.create')) with check(company_id=public.current_user_company_id());

revoke all on function public.calculate_purchase_item(),public.validate_purchase_document(),public.validate_purchase_return_document(),public.calculate_purchase_return_item(),public.validate_purchase_payment(),public.prevent_vendor_ledger_change(),public.vendor_opening_balance_entry(),public.protect_vendor_opening_balance(),public.validate_stock_movement_reference() from public,anon,authenticated;
