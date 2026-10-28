-- Phase 6: hardening, supplemental projections, and final ledger protections.

-- Revoke direct base-table reads (access via security-definer views only).
revoke select on public.sales_invoices,public.sales_invoice_items,public.sales_returns,public.sales_return_items,public.customer_ledger_entries from authenticated;

comment on function public.post_sales_invoice(uuid) is 'Atomic and idempotent: stock issue at WAC, customer receivable debit, immediate cleared payments, totals, status, and audit.';
comment on function public.post_sales_return(uuid) is 'Atomic and idempotent: eligibility checks, stock receipt at historical cost, customer receivable credit, linked invoice update, and audit.';
comment on function public.reverse_sales_invoice(uuid,text) is 'Append-only reversal: sale_return_in movements, cost layer reinstatement, customer ledger mirror entries, payment reversals.';
comment on index public.sales_invoice_items_line_uidx is 'One line per variant per invoice; batch splitting is deferred until batch-level stock dimensions exist.';
comment on view public.sales_invoice_history is 'Security-definer projection with explicit tenant and branch predicates; direct table reads are revoked.';
