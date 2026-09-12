-- Phase 2: extensions and stable domain enums
create extension if not exists pgcrypto with schema extensions;

create type public.user_status as enum ('active', 'inactive', 'suspended');
create type public.customer_type as enum ('cash', 'retail', 'wholesale');
create type public.vendor_status as enum ('active', 'inactive');
create type public.product_status as enum ('active', 'inactive', 'discontinued');
create type public.account_type as enum ('asset', 'liability', 'equity', 'income', 'expense', 'cost_of_sales');
create type public.normal_balance as enum ('debit', 'credit');
create type public.price_level as enum ('retail', 'wholesale', 'special');
create type public.sequence_type as enum (
  'invoice', 'quotation', 'sales_order', 'sales_return', 'purchase', 'purchase_return',
  'receipt', 'payment', 'journal', 'stock_transfer', 'stock_adjustment', 'credit_note',
  'debit_note', 'cheque', 'customer', 'vendor', 'product'
);

comment on type public.sequence_type is 'Business document families. Transaction tables are intentionally deferred.';