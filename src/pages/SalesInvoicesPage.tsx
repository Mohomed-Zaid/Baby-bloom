import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ReceiptText,
  Search,
  Filter,
  Eye,
  Printer,
  RotateCcw,
  XCircle,
  ArrowLeft,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Plus,
  Coins,
  X,
  Download,
} from 'lucide-react'
import { getInvoice, invoiceAction, listInvoices } from '../services/sales'
import { listLookup } from '../services/masterData'
import { MOCK_BRANCHES, MOCK_CUSTOMERS } from '../services/mockData'
import { permissions } from '../config/permissions'
import { useAuthStore } from '../stores/authStore'
import { getErrorMessage } from '../lib/errors'
import { ThermalReceiptDocket } from '../components/common/ThermalReceiptDocket'
import type { SalesInvoiceRow, SalesDocumentStatus, SalesPaymentStatus } from '../types/sales'

const formatCurrency = (val: number | null | undefined) => {
  if (val === null || val === undefined) return 'Rs. 0.00'
  return `Rs. ${Number(val).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function SalesInvoicesPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const allowed = useAuthStore((s) => s.user?.permissions) ?? []

  const can = (k: string) => allowed.length === 0 || allowed.includes(k)
  const hasView = can(permissions.salesView)

  // ── Filter State ──────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('')
  const [payStatus, setPayStatus] = useState<string>('')
  const [customer, setCustomer] = useState('')
  const [branch, setBranch] = useState('')
  const [kind, setKind] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  // ── Modals & Toast State ──────────────────────────────────────────────────
  const [actionModal, setActionModal] = useState<{
    open: boolean
    type: 'cancel' | 'reverse'
    row: SalesInvoiceRow | null
    reason: string
  }>({
    open: false,
    type: 'reverse',
    row: null,
    reason: '',
  })
  const [thermalModal, setThermalModal] = useState(false)
  const [a4Modal, setA4Modal] = useState(false)
  const [registerPrintModal, setRegisterPrintModal] = useState(false)

  // Quick Print from register row
  const [quickPrintInvoice, setQuickPrintInvoice] = useState<{
    id: string
    format: 'thermal' | 'a4'
  } | null>(null)

  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)

  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Lookups ───────────────────────────────────────────────────────────────
  const customers = useQuery({
    queryKey: ['lookup', 'customers'],
    queryFn: () => listLookup('customers', 'name'),
    enabled: hasView,
  })

  const branches = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
    enabled: hasView,
  })

  const branchOptions = useMemo(() => {
    if (branches.data && branches.data.length > 0) return branches.data
    return MOCK_BRANCHES.map((b) => ({ value: b.id, label: b.name }))
  }, [branches.data])

  const customerOptions = useMemo(() => {
    if (customers.data && customers.data.length > 0) return customers.data
    return MOCK_CUSTOMERS.map((c) => ({ value: c.id, label: c.name }))
  }, [customers.data])

  // ── Invoices Query ────────────────────────────────────────────────────────
  const list = useQuery({
    queryKey: ['sales', 'list', page, search, status, payStatus, customer, branch, kind, from, to],
    queryFn: () =>
      listInvoices({
        page,
        pageSize,
        search,
        status: status as any,
        paymentStatus: payStatus as any,
        customerId: customer,
        branchId: branch,
        invoiceType: kind as any,
        dateFrom: from,
        dateTo: to,
      }),
    enabled: hasView,
  })

  // ── Single Invoice Detail Query ───────────────────────────────────────────
  const detail = useQuery({
    queryKey: ['sales', 'detail', id],
    queryFn: () => getInvoice(id!),
    enabled: !!id && hasView,
  })

  // ── Quick Invoice Detail Query (for quick printing from table rows) ───────
  const quickInvoiceDetail = useQuery({
    queryKey: ['sales', 'quick-detail', quickPrintInvoice?.id],
    queryFn: () => (quickPrintInvoice?.id ? getInvoice(quickPrintInvoice.id) : null),
    enabled: !!quickPrintInvoice?.id && hasView,
  })

  // ── Action Mutation (Cancel / Reverse) ────────────────────────────────────
  const actionMutation = useMutation({
    mutationFn: ({ name, rowId, reason }: { name: 'cancel' | 'reverse'; rowId: string; reason: string }) => {
      return invoiceAction(name, rowId, reason)
    },
    onSuccess: async (r) => {
      notify(`Invoice #${r.document_number} marked as ${r.status}!`)
      setActionModal({ open: false, type: 'reverse', row: null, reason: '' })
      await queryClient.invalidateQueries({ queryKey: ['sales'] })
      await queryClient.invalidateQueries({ queryKey: ['current-stock'] })
    },
    onError: (e) => notify(getErrorMessage(e), true),
  })

  const handleOpenAction = (type: 'cancel' | 'reverse', row: SalesInvoiceRow) => {
    setActionModal({
      open: true,
      type,
      row,
      reason: '',
    })
  }

  const handleConfirmAction = () => {
    if (!actionModal.row) return
    if (!actionModal.reason.trim()) {
      notify('Please provide a reason for this operation', true)
      return
    }
    actionMutation.mutate({
      name: actionModal.type,
      rowId: actionModal.row.id,
      reason: actionModal.reason.trim(),
    })
  }

  // ── Summary KPI calculations from fetched rows ────────────────────────────
  const rows = list.data?.rows ?? []
  const totalCount = list.data?.count ?? 0
  const grossSales = rows.reduce((acc, r) => acc + (Number(r.grand_total) || 0), 0)
  const paidSales = rows.reduce((acc, r) => acc + (Number(r.paid_amount) || 0), 0)
  const balanceOutstanding = rows.reduce((acc, r) => acc + (Number(r.balance_amount) || 0), 0)

  // ── Export CSV Handler ────────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (rows.length === 0) {
      notify('No billing records available to export', true)
      return
    }
    const headers = [
      'Invoice #',
      'Date',
      'Due Date',
      'Customer Name',
      'Phone',
      'Branch',
      'Type',
      'Status',
      'Payment Status',
      'Grand Total',
      'Paid Amount',
      'Balance',
      'Cashier',
    ]
    const lines = [headers.join(',')]

    for (const r of rows) {
      const line = [
        `"${r.invoice_number}"`,
        `"${r.invoice_date}"`,
        `"${r.due_date || ''}"`,
        `"${(r.customer_name || 'Walk-in').replace(/"/g, '""')}"`,
        `"${r.customer_phone || ''}"`,
        `"${(r.branch_name || 'Main Branch').replace(/"/g, '""')}"`,
        `"${r.invoice_type || 'cash'}"`,
        `"${r.status}"`,
        `"${r.payment_status}"`,
        (r.grand_total || 0).toFixed(2),
        (r.paid_amount || 0).toFixed(2),
        (r.balance_amount || 0).toFixed(2),
        `"${(r.created_user || 'Admin').replace(/"/g, '""')}"`,
      ]
      lines.push(line.join(','))
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `sales_billing_register_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    notify('Billing register exported to CSV successfully!')
  }

  // ── Status Badges ─────────────────────────────────────────────────────────
  const renderDocBadge = (st: SalesDocumentStatus) => {
    switch (st) {
      case 'posted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#092920] text-[#34d399] border border-[#059669]/40">
            <CheckCircle2 size={12} /> Posted
          </span>
        )
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#241f0b] text-[#fbbf24] border border-[#d97706]/40">
            <Clock size={12} /> Draft
          </span>
        )
      case 'held':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#26153b] text-[#c084fc] border border-[#9333ea]/40">
            <ShoppingBag size={12} /> Held (POS)
          </span>
        )
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#290d13] text-[#f87171] border border-[#dc2626]/40">
            <XCircle size={12} /> Cancelled
          </span>
        )
      case 'reversed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#1a1c23] text-[#9ca3af] border border-[#4b5563]/40">
            <RotateCcw size={12} /> Reversed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#0e3b37] text-[#a0c4c0] border border-[#164e48]">
            {st}
          </span>
        )
    }
  }

  const renderPaymentBadge = (st: SalesPaymentStatus) => {
    switch (st) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#063026] text-[#10b981] border border-[#10b981]/30">
            Paid
          </span>
        )
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#322307] text-[#f59e0b] border border-[#f59e0b]/30">
            Partial
          </span>
        )
      case 'unpaid':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#360d13] text-[#f43f5e] border border-[#f43f5e]/30">
            Unpaid
          </span>
        )
    }
  }

  // Active invoice being printed via quick-print modal or detail view
  const activePrintInvoice = quickPrintInvoice?.id ? quickInvoiceDetail.data : detail.data

  // ══════════════════════════════════════════════════════════════════════════
  // DETAIL VIEW (when /sales/invoices/:id is active)
  // ══════════════════════════════════════════════════════════════════════════
  if (id) {
    const invData = detail.data
    const r = invData?.header

    return (
      <div
        className="min-h-screen text-[#e2f1ef] p-6 space-y-6"
        style={{
          background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
        }}
      >
        {/* Toast */}
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 transition-all duration-300 ${
              toast.isError
                ? 'bg-[#1e0a0f] border-[#5e1624] text-[#f43f5e]'
                : 'bg-[#062320] border-[#164e48] text-[#38d4c5]'
            }`}
          >
            {toast.isError ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        )}

        {/* Action Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#164e48] pb-6 no-print">
          <div className="flex items-center gap-3.5">
            <Link
              to="/sales/invoices"
              className="p-2.5 bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] rounded-xl text-[#a0c4c0] hover:text-white transition-colors"
              title="Back to Sales Invoices Register"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
              <ReceiptText className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Invoice {r ? r.invoice_number : 'Loading...'}
                </h1>
                {r && renderDocBadge(r.status)}
                {r && renderPaymentBadge(r.payment_status)}
              </div>
              <p className="text-sm text-[#7aa5a0] mt-0.5">
                {r ? `${r.customer_name} • Placed on ${new Date(r.invoice_date).toLocaleDateString()}` : 'Retrieving invoice details...'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/sales/invoices"
              className="px-3.5 py-2 text-sm font-medium rounded-xl bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] hover:text-white transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft size={16} /> Register
            </Link>

            {can(permissions.salesPrint) && (
              <>
                <button
                  type="button"
                  onClick={() => setThermalModal(true)}
                  className="px-3.5 py-2 text-sm font-medium rounded-xl bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={16} /> Thermal Slip (80mm)
                </button>
                <button
                  type="button"
                  onClick={() => setA4Modal(true)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white shadow-lg shadow-[#059669]/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={16} /> Print A4 Tax Invoice
                </button>
              </>
            )}

            {r && r.status === 'posted' && can(permissions.salesReverse) && (
              <button
                type="button"
                onClick={() => handleOpenAction('reverse', r)}
                className="px-3.5 py-2 text-sm font-medium rounded-xl bg-[#2b1016] hover:bg-[#3d141e] border border-[#5e1624] text-[#f87171] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={15} /> Reverse Invoice
              </button>
            )}

            {r && r.status === 'draft' && can(permissions.salesCancel) && (
              <button
                type="button"
                onClick={() => handleOpenAction('cancel', r)}
                className="px-3.5 py-2 text-sm font-medium rounded-xl bg-[#2b1016] hover:bg-[#3d141e] border border-[#5e1624] text-[#f87171] hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <XCircle size={15} /> Cancel Draft
              </button>
            )}
          </div>
        </div>

        {detail.isLoading ? (
          <div className="p-20 text-center text-[#7aa5a0] flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-[#38d4c5] animate-spin" />
            <span>Loading invoice details and transaction ledger...</span>
          </div>
        ) : detail.isError || !r ? (
          <div className="p-12 bg-[#1e0a0f] border border-[#5e1624] rounded-2xl text-center text-[#f87171]">
            <AlertCircle className="w-10 h-10 mx-auto mb-2" />
            <h3 className="text-lg font-bold">Failed to load invoice</h3>
            <p className="text-sm mt-1 text-[#fca5a5]">{getErrorMessage(detail.error)}</p>
            <div className="mt-4">
              <Link to="/sales/invoices" className="px-4 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-xl text-white text-sm">
                Return to Invoices List
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Metadata Card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3.5 bg-[#061e1c]/80 border border-[#164e48] p-4 rounded-2xl shadow-lg backdrop-blur-sm text-xs">
              <div>
                <span className="text-[#7aa5a0]">Customer</span>
                <div className="font-semibold text-white mt-1 text-sm">{r.customer_name}</div>
                <div className="text-[11px] text-[#527d78] font-mono">{r.customer_code}</div>
              </div>
              <div>
                <span className="text-[#7aa5a0]">Branch / Location</span>
                <div className="font-medium text-white mt-1">{r.branch_name || 'Main Branch'}</div>
                <div className="text-[11px] text-[#527d78]">{r.warehouse_name ? `${r.warehouse_name} / ${r.location_name}` : 'Main Warehouse'}</div>
              </div>
              <div>
                <span className="text-[#7aa5a0]">Invoice Type</span>
                <div className="font-bold text-[#38d4c5] uppercase mt-1">{r.invoice_type}</div>
                <div className="text-[11px] text-[#527d78]">Due: {new Date(r.due_date).toLocaleDateString()}</div>
              </div>
              <div>
                <span className="text-[#7aa5a0]">Cashier / Issued By</span>
                <div className="font-medium text-white mt-1">{r.created_user || 'Admin'}</div>
                <div className="text-[11px] text-[#527d78]">Terminal User</div>
              </div>
              <div>
                <span className="text-[#7aa5a0]">Grand Total</span>
                <div className="font-bold text-white mt-1 text-sm">{formatCurrency(r.grand_total)}</div>
                <div className="text-[11px] text-[#34d399]">Paid: {formatCurrency(r.paid_amount)}</div>
              </div>
              <div>
                <span className="text-[#7aa5a0]">Remaining Balance</span>
                <div className={`font-bold mt-1 text-sm ${r.balance_amount > 0 ? 'text-[#f87171]' : 'text-[#34d399]'}`}>
                  {formatCurrency(r.balance_amount)}
                </div>
                <div className="text-[11px] text-[#7aa5a0]">
                  {r.change_amount > 0 ? `Change: ${formatCurrency(r.change_amount)}` : 'Zero change'}
                </div>
              </div>
            </div>

            {/* Invoiced Items Table */}
            <div className="bg-[#061e1c]/80 rounded-2xl border border-[#164e48] shadow-xl overflow-hidden backdrop-blur-md">
              <div className="px-5 py-4 border-b border-[#164e48] flex items-center justify-between bg-[#092925]">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#a0c4c0] flex items-center gap-2">
                  <FileText size={16} className="text-[#38d4c5]" /> Invoiced Items & Variant Breakdown
                </h3>
                <span className="text-xs text-[#7aa5a0]">{invData.items.length} items</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#092925]/60 text-xs font-semibold text-[#7aa5a0] uppercase border-b border-[#164e48]">
                    <tr>
                      <th className="px-5 py-3">#</th>
                      <th className="px-5 py-3">Product / Variant</th>
                      <th className="px-5 py-3 text-right">Qty</th>
                      <th className="px-5 py-3 text-right">Unit Rate</th>
                      <th className="px-5 py-3 text-right">Discount</th>
                      <th className="px-5 py-3 text-right">Tax</th>
                      <th className="px-5 py-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#113e3a]/60">
                    {invData.items.map((it, idx) => (
                      <tr key={it.id || idx} className="hover:bg-[#0c312d]/60 transition-colors">
                        <td className="px-5 py-3.5 text-xs text-[#527d78]">{idx + 1}</td>
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-white">
                            {it.product_name || 'Product'} {it.variant_name ? `(${it.variant_name})` : ''}
                          </div>
                          <div className="text-xs text-[#527d78] font-mono mt-0.5">
                            SKU: {it.sku || '-'} {it.barcode ? `• Barcode: ${it.barcode}` : ''}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold text-white">{it.quantity}</td>
                        <td className="px-5 py-3.5 text-right text-xs font-mono text-[#a0c4c0]">{formatCurrency(it.unit_price)}</td>
                        <td className="px-5 py-3.5 text-right text-xs font-mono text-[#34d399]">
                          {it.discount_amount > 0 ? `-${formatCurrency(it.discount_amount)}` : '-'}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs font-mono text-[#7aa5a0]">
                          {it.tax_amount > 0 ? formatCurrency(it.tax_amount) : '0%'}
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold font-mono text-[#38d4c5] whitespace-nowrap">
                          {formatCurrency(it.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payments & Totals Split */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Payment History Subledger */}
              <div className="bg-[#061e1c]/80 rounded-2xl border border-[#164e48] p-5 shadow-lg backdrop-blur-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#a0c4c0] mb-3 flex items-center gap-2">
                  <CreditCard size={16} className="text-[#38d4c5]" /> Settlement & Payment Receipts
                </h3>

                {invData.payments.length > 0 ? (
                  <div className="divide-y divide-[#164e48]/50 text-xs">
                    {invData.payments.map((p, idx) => (
                      <div key={p.id || idx} className="py-2.5 flex justify-between items-center">
                        <div>
                          <div className="font-bold text-white uppercase">{p.payment_method}</div>
                          <div className="text-[11px] text-[#7aa5a0]">
                            {new Date(p.payment_date).toLocaleDateString()} {p.payment_number ? `• ${p.payment_number}` : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-base text-[#34d399]">{formatCurrency(p.amount)}</div>
                          <span className="text-[10px] text-[#38d4c5] bg-[#0c2e2a] px-2 py-0.5 rounded border border-[#164e48]">
                            {p.clearing_status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[#7aa5a0] p-4 bg-[#031413] rounded-xl text-center">
                    No payment transactions recorded for this invoice yet.
                  </div>
                )}
              </div>

              {/* Financial Calculation Summary */}
              <div className="bg-[#061e1c]/80 rounded-2xl border border-[#164e48] p-5 shadow-lg backdrop-blur-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#a0c4c0] mb-3 flex items-center gap-2">
                  <Coins size={16} className="text-[#38d4c5]" /> Invoice Summary
                </h3>

                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between text-[#a0c4c0]">
                    <span>Item Subtotal:</span>
                    <span className="font-medium text-white">{formatCurrency(r.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-[#34d399]">
                    <span>Discounts Total:</span>
                    <span className="font-medium">
                      -{formatCurrency((r.item_discount_total ?? 0) + (r.bill_discount_amount ?? 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#a0c4c0]">
                    <span>Tax (VAT/NBT):</span>
                    <span className="font-medium text-white">{formatCurrency(r.tax_total)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-[#164e48]">
                    <span>Grand Total:</span>
                    <span className="text-[#38d4c5]">{formatCurrency(r.grand_total)}</span>
                  </div>
                  <div className="flex justify-between text-[#34d399] pt-1">
                    <span>Paid Amount:</span>
                    <span className="font-bold">{formatCurrency(r.paid_amount)}</span>
                  </div>
                  {r.change_amount > 0 && (
                    <div className="flex justify-between text-[#a0c4c0]">
                      <span>Change Given:</span>
                      <span className="font-semibold text-white">{formatCurrency(r.change_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-[#164e48]">
                    <span className="text-white">Outstanding Balance:</span>
                    <span className={r.balance_amount > 0 ? 'text-[#f87171]' : 'text-[#34d399]'}>
                      {formatCurrency(r.balance_amount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: Thermal Receipt Preview (80mm) ───────────────────────── */}
        {thermalModal && r && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-sm w-full overflow-hidden text-white flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#164e48] bg-[#0c2e2a] no-print">
                <div className="flex items-center gap-2">
                  <Printer size={18} className="text-[#38d4c5]" />
                  <h3 className="text-sm font-bold text-white">80mm Thermal Receipt</h3>
                </div>
                <button
                  type="button"
                  className="text-[#7aa5a0] hover:text-white p-1 rounded-lg cursor-pointer"
                  onClick={() => setThermalModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Thermal Slip Content */}
              <div className="p-4 bg-slate-900/60 overflow-y-auto flex justify-center max-h-[70vh]">
                <div className="shadow-2xl rounded border border-gray-400 bg-white">
                  <ThermalReceiptDocket
                    receipt={{
                      number: r.invoice_number,
                      date: r.invoice_date,
                      cashier: r.created_user || 'POS',
                      storeName: r.branch_name ? r.branch_name.toUpperCase() : 'CHICKEN KING',
                      addressLine1: 'No: 15, Station Road,',
                      addressLine2: 'Gelioya.',
                      phoneLine: '0775040808 | 0755552222',
                      customerName: r.customer_name ? r.customer_name.toUpperCase() : 'RIYAS WS 1',
                      customerPhone: r.customer_phone || '94760152545',
                      items: (invData?.items || []).map((it) => ({
                        name: it.product_name,
                        variant: it.variant_name,
                        qty: it.quantity,
                        price: it.unit_price,
                        discount: it.discount_amount,
                        total: it.line_total,
                      })),
                      subtotal: r.subtotal ?? 0,
                      discount: (r.item_discount_total ?? 0) + (r.bill_discount_amount ?? 0),
                      grandTotal: r.grand_total ?? 0,
                      itemsQty: (invData?.items || []).reduce((s, it) => s + (it.quantity || 1), 0),
                      paymentMethodName: (r.balance_amount ?? 0) > 0 && (r.paid_amount ?? 0) === 0 ? 'CREDIT' : (r.invoice_type || 'CASH').toUpperCase(),
                      paid: r.paid_amount ?? 0,
                      change: r.change_amount || 0,
                      balance: r.balance_amount || 0,
                      previousDue: 0,
                      outstandingDue: r.balance_amount || 0,
                      footerNote: 'Thank you. Please Visit Again.',
                      softwareAttribution: 'Software By  AJ POS',
                    }}
                  />
                </div>
              </div>

              <div className="p-4 border-t border-[#164e48] bg-[#0c2e2a] flex justify-end gap-2.5 no-print">
                <button
                  type="button"
                  className="px-3.5 py-1.5 text-xs text-[#a0c4c0] hover:text-white rounded-lg bg-[#082321] border border-[#164e48] cursor-pointer"
                  onClick={() => setThermalModal(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
                  onClick={() => window.print()}
                >
                  <Printer size={14} /> Send to Thermal Printer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: A4 Tax Invoice Voucher Preview ───────────────────────── */}
        {a4Modal && r && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-3xl w-full overflow-hidden text-white flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#164e48] bg-[#0c2e2a] no-print">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-[#38d4c5]" />
                  <h3 className="text-sm font-bold text-white">Commercial Tax Invoice (A4 Standard)</h3>
                </div>
                <button
                  type="button"
                  className="text-[#7aa5a0] hover:text-white p-1 rounded-lg cursor-pointer"
                  onClick={() => setA4Modal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 bg-slate-900/60 overflow-y-auto flex justify-center max-h-[75vh]">
                <div
                  id="a4-tax-invoice-printable"
                  className="w-full bg-white text-black p-8 font-sans text-xs leading-relaxed shadow-2xl border border-gray-300 rounded-xl"
                >
                  {/* Header */}
                  <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-4">
                    <div>
                      <h1 className="text-2xl font-black uppercase tracking-wider text-black">BABY BLOOM (PVT) LTD</h1>
                      <p className="text-xs text-gray-700 font-semibold mt-0.5">Premium Baby & Mother Care Essentials</p>
                      <p className="text-[11px] text-gray-600 mt-1">
                        {r.branch_name || 'Main Flagship Store'} • No. 124 Galle Road, Colombo 03, Sri Lanka
                      </p>
                      <p className="text-[11px] text-gray-600">
                        Tel: +94 11 234 5678 / +94 77 123 4567 • Email: sales@babybloom.lk
                      </p>
                      <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                        VAT Reg No: 104589234-7000 • SVAT: SVAT-009182
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-3 py-1 bg-black text-white text-xs font-black uppercase tracking-widest rounded">
                        COMMERCIAL TAX INVOICE
                      </span>
                      <div className="mt-2 text-xs">
                        <span className="text-gray-600">Invoice No: </span>
                        <strong className="font-mono text-sm text-black">{r.invoice_number}</strong>
                      </div>
                      <div className="text-xs">
                        <span className="text-gray-600">Invoice Date: </span>
                        <strong>{new Date(r.invoice_date).toLocaleDateString('en-LK', { timeZone: 'Asia/Colombo' })}</strong>
                      </div>
                      <div className="text-xs">
                        <span className="text-gray-600">Payment Due: </span>
                        <strong>{new Date(r.due_date).toLocaleDateString('en-LK', { timeZone: 'Asia/Colombo' })}</strong>
                      </div>
                      <div className="text-xs">
                        <span className="text-gray-600">Status: </span>
                        <strong className="uppercase">{r.status} / {r.payment_status}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Customer Bill To & Transaction Info */}
                  <div className="grid grid-cols-2 gap-6 p-3 bg-gray-50 border border-gray-200 rounded-lg mb-4 text-xs">
                    <div>
                      <span className="text-gray-500 font-bold uppercase text-[10px] tracking-wider block mb-1">CUSTOMER (BILL TO)</span>
                      <div className="font-bold text-sm text-black">{r.customer_name || 'Walk-in Customer'}</div>
                      <div className="text-gray-700 mt-0.5">Phone: {r.customer_phone || 'N/A'}</div>
                      <div className="text-gray-700 font-mono text-[11px]">Code: {r.customer_code || 'CUST-WALK'}</div>
                      <div className="text-gray-700">Type: {r.customer_type ? r.customer_type.toUpperCase() : 'RETAIL'}</div>
                    </div>
                    <div>
                      <span className="text-gray-500 font-bold uppercase text-[10px] tracking-wider block mb-1">BILLING & DISPATCH INFO</span>
                      <div className="text-gray-700"><span className="text-gray-500">Issued Branch: </span><strong>{r.branch_name || 'Main Flagship Store'}</strong></div>
                      <div className="text-gray-700"><span className="text-gray-500">Warehouse / Rack: </span><strong>{r.warehouse_name || 'Main Warehouse'} / {r.location_name || 'Floor'}</strong></div>
                      <div className="text-gray-700"><span className="text-gray-500">Cashier: </span><strong>{r.created_user || 'Admin'}</strong></div>
                      <div className="text-gray-700"><span className="text-gray-500">Payment Mode: </span><strong>{(r.invoice_type || 'CASH').toUpperCase()}</strong></div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="mb-4">
                    <table className="w-full text-left text-xs border border-gray-300">
                      <thead className="bg-gray-100 text-gray-800 font-bold border-b border-gray-300">
                        <tr>
                          <th className="p-2 border-r border-gray-300 w-8 text-center">#</th>
                          <th className="p-2 border-r border-gray-300">Item Description</th>
                          <th className="p-2 border-r border-gray-300 text-center w-24">SKU / Code</th>
                          <th className="p-2 border-r border-gray-300 text-right w-16">Qty</th>
                          <th className="p-2 border-r border-gray-300 text-right w-24">Unit Rate</th>
                          <th className="p-2 border-r border-gray-300 text-right w-20">Discount</th>
                          <th className="p-2 text-right w-28">Total (Rs.)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(invData?.items || []).map((it, idx) => (
                          <tr key={it.id || idx}>
                            <td className="p-2 border-r border-gray-200 text-center font-mono">{idx + 1}</td>
                            <td className="p-2 border-r border-gray-200">
                              <div className="font-semibold">{it.product_name}</div>
                              {it.variant_name && <div className="text-[10px] text-gray-600">Option: {it.variant_name}</div>}
                            </td>
                            <td className="p-2 border-r border-gray-200 text-center font-mono text-[10px]">{it.sku || it.product_code || '-'}</td>
                            <td className="p-2 border-r border-gray-200 text-right font-bold">{it.quantity}</td>
                            <td className="p-2 border-r border-gray-200 text-right font-mono">{formatCurrency(it.unit_price)}</td>
                            <td className="p-2 border-r border-gray-200 text-right font-mono">{it.discount_amount ? formatCurrency(it.discount_amount) : '-'}</td>
                            <td className="p-2 text-right font-mono font-bold">{formatCurrency(it.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Summary & Bank Remittance */}
                  <div className="grid grid-cols-2 gap-6 items-start pt-2 border-t border-gray-300">
                    <div>
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded text-xs space-y-1">
                        <div className="font-bold uppercase text-[10px] text-gray-600 mb-1">REMITTANCE & PAYMENT TERMS</div>
                        <div>Commercial Bank of Ceylon • Branch: Colombo Foreign Branch</div>
                        <div>Account Name: <strong>Baby Bloom (Pvt) Ltd</strong></div>
                        <div>Account Number: <strong>1000 4892 1083</strong></div>
                        <div className="text-[10px] text-gray-500 mt-2">
                          Payment is due within 14 days of invoice date for approved credit accounts.
                          All returned cheques will incur a handling fee of Rs. 1,000.
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="space-y-1.5 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Gross Subtotal:</span>
                          <strong>{formatCurrency(r.subtotal)}</strong>
                        </div>
                        <div className="flex justify-between text-gray-700">
                          <span className="text-gray-600">Total Discounts:</span>
                          <strong>-{formatCurrency((r.item_discount_total ?? 0) + (r.bill_discount_amount ?? 0))}</strong>
                        </div>
                        <div className="flex justify-between text-gray-700">
                          <span className="text-gray-600">Tax Total (VAT):</span>
                          <strong>{formatCurrency(r.tax_total)}</strong>
                        </div>
                        <div className="border-t-2 border-black pt-2 flex justify-between font-black text-sm">
                          <span>GRAND TOTAL:</span>
                          <span>{formatCurrency(r.grand_total)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-800 font-bold">
                          <span>Paid Amount:</span>
                          <span>{formatCurrency(r.paid_amount)}</span>
                        </div>
                        {r.change_amount > 0 && (
                          <div className="flex justify-between text-gray-700">
                            <span>Change Given:</span>
                            <span>{formatCurrency(r.change_amount)}</span>
                          </div>
                        )}
                        <div className="border-t border-dashed border-gray-400 pt-1 flex justify-between font-bold text-sm">
                          <span className={r.balance_amount > 0 ? 'text-rose-700' : 'text-gray-800'}>Balance Due:</span>
                          <span className={r.balance_amount > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                            {formatCurrency(r.balance_amount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Signatures */}
                  <div className="grid grid-cols-2 gap-12 pt-8 mt-6 border-t border-gray-300 text-center text-xs">
                    <div>
                      <div className="border-b border-black w-48 mx-auto mb-1.5" />
                      <span className="font-semibold">Received in Good Condition (Customer)</span>
                    </div>
                    <div>
                      <div className="border-b border-black w-48 mx-auto mb-1.5" />
                      <span className="font-semibold">Authorized Signatory & Stamp</span>
                    </div>
                  </div>

                  <div className="text-center text-[10px] text-gray-400 mt-6 pt-3 border-t border-gray-200">
                    This is a computer-generated tax invoice issued by Baby Bloom ERP • Sri Lanka
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-[#164e48] bg-[#0c2e2a] flex justify-end gap-2.5 no-print">
                <button
                  type="button"
                  className="px-3.5 py-1.5 text-xs text-[#a0c4c0] hover:text-white rounded-lg bg-[#082321] border border-[#164e48] cursor-pointer"
                  onClick={() => setA4Modal(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
                  onClick={() => window.print()}
                >
                  <Printer size={14} /> Print A4 Tax Invoice
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REGISTER LIST VIEW (/sales/invoices)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div
      className="min-h-screen text-[#e2f1ef] p-6 space-y-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 transition-all duration-300 ${
            toast.isError
              ? 'bg-[#1e0a0f] border-[#5e1624] text-[#f43f5e]'
              : 'bg-[#062320] border-[#164e48] text-[#38d4c5]'
          }`}
        >
          {toast.isError ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#164e48] pb-6 no-print">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <ReceiptText className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Sales Invoices & Billing Register
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Revenue & Invoicing
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Audit posted customer invoices, track collections, verify credit settlements, and print sales vouchers
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#0c2e2a] hover:bg-[#12423c] hover:text-white transition-colors cursor-pointer"
            disabled={list.isRefetching}
            onClick={() => list.refetch()}
          >
            <RefreshCw size={15} className={list.isRefetching ? 'animate-spin text-[#38d4c5]' : ''} />
            Refresh
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#0c2e2a] hover:bg-[#12423c] hover:text-white transition-colors cursor-pointer"
            onClick={handleExportCsv}
            title="Export billing register to CSV file"
          >
            <Download size={15} />
            Export CSV
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#164e48] rounded-xl text-sm font-semibold text-[#38d4c5] bg-[#0c2e2a] hover:bg-[#12423c] transition-colors cursor-pointer"
            onClick={() => setRegisterPrintModal(true)}
            title="Print billing audit register summary"
          >
            <Printer size={15} />
            Print Register Summary
          </button>

          <Link
            to="/sales/orders"
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] hover:text-white rounded-xl text-sm font-medium transition-colors"
          >
            Customer Orders
          </Link>

          <Link
            to="/sales/pos"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-lg shadow-[#059669]/20 transition-all active:scale-[0.98]"
          >
            <Plus size={16} />
            POS Terminal / New Invoice
          </Link>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        {/* Card 1: Total Invoices */}
        <div className="p-5 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#7aa5a0]">Total Invoices</span>
            <span className="p-1.5 bg-[#103e39] rounded-lg text-[#38d4c5]">
              <ReceiptText className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{totalCount}</div>
          <div className="mt-1 text-xs text-[#527d78]">Filtered billing transactions</div>
        </div>

        {/* Card 2: Gross Sales */}
        <div className="p-5 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#38d4c5]">Gross Sales (Rs.)</span>
            <span className="p-1.5 bg-[#0a2f2b] rounded-lg text-[#38d4c5]">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            Rs. {grossSales.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-xs text-[#7aa5a0]">Total invoice values</div>
        </div>

        {/* Card 3: Collected Revenue */}
        <div className="p-5 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#34d399]">Collected Paid</span>
            <span className="p-1.5 bg-[#0d3327] rounded-lg text-[#34d399]">
              <Coins className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#34d399]">
            Rs. {paidSales.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-xs text-[#7aa5a0]">Cash, POS, Cheque & Transfers</div>
        </div>

        {/* Card 4: Outstanding Receivables */}
        <div className="p-5 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-lg backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#f87171]">Receivables Due</span>
            <span className="p-1.5 bg-[#290d13] rounded-lg text-[#f87171]">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#f87171]">
            Rs. {balanceOutstanding.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
          </div>
          <div className="mt-1 text-xs text-[#7aa5a0]">Uncollected credit balances</div>
        </div>
      </div>

      {/* Status Tab Navigation */}
      <div className="flex border-b border-[#164e48] overflow-x-auto gap-2 pb-1 no-print">
        {[
          { id: '', label: 'All Invoices' },
          { id: 'posted', label: 'Posted' },
          { id: 'draft', label: 'Draft' },
          { id: 'held', label: 'Held (POS)' },
          { id: 'cancelled', label: 'Cancelled' },
          { id: 'reversed', label: 'Reversed' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
              status === tab.id
                ? 'bg-[#0e3b37] text-[#38d4c5] border-t-2 border-x-2 border-[#164e48] border-b-transparent shadow-sm'
                : 'text-[#7aa5a0] hover:text-white hover:bg-[#0c2e2a]'
            }`}
            onClick={() => {
              setStatus(tab.id)
              setPage(1)
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-[#061e1c]/80 p-4 rounded-2xl border border-[#164e48] shadow-md flex flex-col md:flex-row gap-3 items-center justify-between backdrop-blur-sm no-print">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#527d78]" size={16} />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white placeholder-[#527d78] focus:outline-none focus:border-[#38d4c5]"
            placeholder="Search invoice #, customer..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2.5 w-full md:w-auto items-center">
          <div className="flex items-center gap-1.5 text-xs text-[#7aa5a0]">
            <Filter size={14} /> Filter:
          </div>

          <select
            className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
            value={payStatus}
            onChange={(e) => {
              setPayStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Payments</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </select>

          <select
            className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Branches</option>
            {branchOptions.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>

          <select
            className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
            value={customer}
            onChange={(e) => {
              setCustomer(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Customers</option>
            {customerOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            className="px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Types</option>
            <option value="cash">Cash Sale</option>
            <option value="credit">Credit Sale</option>
            <option value="mixed">Mixed</option>
          </select>

          <input
            type="date"
            className="px-2.5 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(1)
            }}
          />
          <span className="text-[#527d78] text-xs">to</span>
          <input
            type="date"
            className="px-2.5 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(1)
            }}
          />

          {(search || status || payStatus || branch || customer || kind || from || to) && (
            <button
              type="button"
              className="text-xs text-[#f87171] hover:text-white px-2 py-1 underline cursor-pointer"
              onClick={() => {
                setSearch('')
                setStatus('')
                setPayStatus('')
                setBranch('')
                setCustomer('')
                setKind('')
                setFrom('')
                setTo('')
                setPage(1)
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#061e1c]/80 rounded-2xl border border-[#164e48] shadow-2xl overflow-hidden backdrop-blur-md no-print">
        {list.isLoading ? (
          <div className="p-16 text-center text-sm text-[#7aa5a0] flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-7 h-7 text-[#38d4c5] animate-spin" />
            <span>Loading sales invoices and ledger settlements...</span>
          </div>
        ) : rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#092925] border-b border-[#164e48] text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Invoice #</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5">Customer</th>
                  <th className="px-5 py-3.5">Branch / Type</th>
                  <th className="px-5 py-3.5 text-right">Grand Total</th>
                  <th className="px-5 py-3.5 text-right">Paid / Balance</th>
                  <th className="px-5 py-3.5 text-center">Payment</th>
                  <th className="px-5 py-3.5 text-center">Document</th>
                  <th className="px-5 py-3.5">Cashier</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#113e3a]/60">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-[#0c312d]/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/sales/invoices/${row.id}`}
                        className="font-bold text-[#38d4c5] hover:text-white hover:underline flex items-center gap-1.5"
                      >
                        {row.invoice_number}
                      </Link>
                    </td>

                    <td className="px-5 py-3.5 text-xs text-[#a0c4c0] whitespace-nowrap">
                      <div>{new Date(row.invoice_date).toLocaleDateString()}</div>
                      <div className="text-[11px] text-[#527d78]">
                        Due: {new Date(row.due_date).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white">{row.customer_name || 'Walk-in Customer'}</div>
                      <div className="text-xs text-[#7aa5a0] font-mono mt-0.5">
                        {row.customer_phone || row.customer_code || ''}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-xs">
                      <div className="text-white font-medium">{row.branch_name || 'Main Branch'}</div>
                      <span className="inline-block mt-0.5 uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#0e3b37] text-[#38d4c5]">
                        {row.invoice_type}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-right font-bold text-white whitespace-nowrap">
                      {formatCurrency(row.grand_total)}
                    </td>

                    <td className="px-5 py-3.5 text-right text-xs whitespace-nowrap">
                      <div className="text-[#34d399] font-medium">
                        Paid: {formatCurrency(row.paid_amount)}
                      </div>
                      <div className={row.balance_amount > 0 ? 'text-[#f87171] font-semibold' : 'text-[#7aa5a0]'}>
                        Bal: {formatCurrency(row.balance_amount)}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      {renderPaymentBadge(row.payment_status)}
                    </td>

                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      {renderDocBadge(row.status)}
                    </td>

                    <td className="px-5 py-3.5 text-xs text-[#a0c4c0]">
                      {row.created_user || 'Admin'}
                    </td>

                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {/* View Details */}
                        <Link
                          to={`/sales/invoices/${row.id}`}
                          className="p-1.5 text-[#7aa5a0] hover:text-white hover:bg-[#12423c] rounded-lg transition-colors border border-transparent hover:border-[#164e48]"
                          title="View Invoice Details & Receipts"
                        >
                          <Eye size={15} />
                        </Link>

                        {/* Quick Thermal Slip */}
                        <button
                          type="button"
                          className="p-1.5 text-[#38d4c5] hover:text-white hover:bg-[#12423c] rounded-lg transition-colors border border-transparent hover:border-[#164e48] cursor-pointer"
                          title="Quick 80mm Thermal Slip"
                          onClick={() => setQuickPrintInvoice({ id: row.id, format: 'thermal' })}
                        >
                          <Printer size={15} />
                        </button>

                        {/* Quick A4 Tax Invoice */}
                        <button
                          type="button"
                          className="p-1.5 text-[#34d399] hover:text-white hover:bg-[#12423c] rounded-lg transition-colors border border-transparent hover:border-[#164e48] cursor-pointer"
                          title="Quick A4 Tax Invoice Voucher"
                          onClick={() => setQuickPrintInvoice({ id: row.id, format: 'a4' })}
                        >
                          <FileText size={15} />
                        </button>

                        {/* Reverse Invoice (Posted only) */}
                        {row.status === 'posted' && can(permissions.salesReverse) && (
                          <button
                            type="button"
                            className="p-1.5 text-[#f87171] hover:text-white hover:bg-[#3b1119] rounded-lg transition-colors border border-transparent hover:border-[#5e1624] cursor-pointer"
                            title="Reverse Invoice"
                            onClick={() => handleOpenAction('reverse', row)}
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}

                        {/* Cancel Invoice (Draft only) */}
                        {row.status === 'draft' && can(permissions.salesCancel) && (
                          <button
                            type="button"
                            className="p-1.5 text-[#f87171] hover:text-white hover:bg-[#3b1119] rounded-lg transition-colors border border-transparent hover:border-[#5e1624] cursor-pointer"
                            title="Cancel Draft Invoice"
                            onClick={() => handleOpenAction('cancel', row)}
                          >
                            <XCircle size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-16 text-center">
            <ReceiptText size={44} className="mx-auto text-[#38d4c5] mb-3 opacity-60" />
            <h3 className="text-base font-semibold text-white">No sales invoices found</h3>
            <p className="text-sm text-[#7aa5a0] mt-1 max-w-sm mx-auto">
              No billing records matched your search parameters. Create an invoice from the POS terminal.
            </p>
            <div className="mt-5">
              <Link
                to="/sales/pos"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-semibold shadow-md transition-all"
              >
                <Plus size={16} />
                Open POS Terminal
              </Link>
            </div>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="px-5 py-3.5 bg-[#031413] border-t border-[#164e48] flex items-center justify-between text-xs text-[#7aa5a0]">
          <div>
            Showing {rows.length} of {totalCount} records (Page {page})
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="p-1.5 rounded-lg border border-[#164e48] bg-[#0c2e2a] hover:bg-[#12423c] text-white disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-semibold text-white px-2">Page {page}</span>
            <button
              type="button"
              className="p-1.5 rounded-lg border border-[#164e48] bg-[#0c2e2a] hover:bg-[#12423c] text-white disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              disabled={rows.length < pageSize}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL: Invoice Action (Cancel / Reverse) ─────────────────────────── */}
      {actionModal.open && actionModal.row && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-md w-full overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#164e48] bg-[#0c2e2a]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#290d13] border border-[#dc2626]/40 rounded-xl text-[#f87171]">
                  {actionModal.type === 'reverse' ? <RotateCcw size={20} /> : <XCircle size={20} />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white capitalize">
                    {actionModal.type} Invoice #{actionModal.row.invoice_number}
                  </h3>
                  <p className="text-xs text-[#7aa5a0]">
                    Customer: {actionModal.row.customer_name} • Total: {formatCurrency(actionModal.row.grand_total)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="text-[#7aa5a0] hover:text-white p-1.5 rounded-lg hover:bg-[#12423c] cursor-pointer"
                onClick={() => setActionModal({ open: false, type: 'reverse', row: null, reason: '' })}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">
                  Reason for {actionModal.type === 'reverse' ? 'Reversal' : 'Cancellation'}
                </label>
                <textarea
                  className="w-full px-3.5 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white focus:outline-none focus:border-[#f87171]"
                  rows={3}
                  placeholder={`Specify why this invoice is being ${actionModal.type}d...`}
                  value={actionModal.reason}
                  onChange={(e) => setActionModal((m) => ({ ...m, reason: e.target.value }))}
                />
              </div>

              <div className="p-3 bg-[#290d13] rounded-xl text-xs text-[#fca5a5] border border-[#dc2626]/40">
                Warning: {actionModal.type === 'reverse' ? 'Reversing this invoice adjusts inventory balances and posts reversal entries to the general ledger.' : 'Cancelling this draft permanently invalidates the billing record.'} This operation is logged to the security audit trail.
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#164e48] bg-[#0c2e2a]">
              <button
                type="button"
                className="px-4 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#082321] hover:bg-[#12423c] hover:text-white cursor-pointer"
                onClick={() => setActionModal({ open: false, type: 'reverse', row: null, reason: '' })}
              >
                Go Back
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-gradient-to-r from-[#e11d48] to-[#be123c] hover:from-[#be123c] hover:to-[#9f1239] text-white rounded-xl text-sm font-semibold shadow-lg shadow-[#e11d48]/20 transition-all disabled:opacity-50 cursor-pointer"
                disabled={actionMutation.isPending || !actionModal.reason.trim()}
                onClick={handleConfirmAction}
              >
                {actionMutation.isPending ? 'Processing...' : `Confirm ${actionModal.type}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Quick Print (Thermal or A4 from Table Row) ───────────────── */}
      {quickPrintInvoice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-2xl w-full overflow-hidden text-white flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#164e48] bg-[#0c2e2a] no-print">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-[#38d4c5]" />
                <h3 className="text-sm font-bold text-white">
                  {quickPrintInvoice.format === 'thermal' ? '80mm Thermal Receipt' : 'Commercial Tax Invoice (A4)'}
                </h3>
              </div>
              <button
                type="button"
                className="text-[#7aa5a0] hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setQuickPrintInvoice(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 bg-slate-900/60 overflow-y-auto flex justify-center max-h-[75vh]">
              {quickInvoiceDetail.isLoading ? (
                <div className="p-12 text-center text-sm text-[#7aa5a0]">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#38d4c5] mb-2" />
                  Loading invoice voucher...
                </div>
              ) : activePrintInvoice?.header ? (
                quickPrintInvoice.format === 'thermal' ? (
                  <div className="shadow-2xl rounded border border-gray-400 bg-white">
                    <ThermalReceiptDocket
                      receipt={{
                        number: activePrintInvoice.header.invoice_number,
                        date: activePrintInvoice.header.invoice_date,
                        cashier: activePrintInvoice.header.created_user || 'POS',
                        storeName: activePrintInvoice.header.branch_name ? activePrintInvoice.header.branch_name.toUpperCase() : 'CHICKEN KING',
                        addressLine1: 'No: 15, Station Road,',
                        addressLine2: 'Gelioya.',
                        phoneLine: '0775040808 | 0755552222',
                        customerName: activePrintInvoice.header.customer_name ? activePrintInvoice.header.customer_name.toUpperCase() : 'RIYAS WS 1',
                        customerPhone: activePrintInvoice.header.customer_phone || '94760152545',
                        items: (activePrintInvoice.items || []).map((it) => ({
                          name: it.product_name,
                          variant: it.variant_name,
                          qty: it.quantity,
                          price: it.unit_price,
                          discount: it.discount_amount,
                          total: it.line_total,
                        })),
                        subtotal: activePrintInvoice.header.subtotal ?? 0,
                        discount: (activePrintInvoice.header.item_discount_total ?? 0) + (activePrintInvoice.header.bill_discount_amount ?? 0),
                        grandTotal: activePrintInvoice.header.grand_total ?? 0,
                        itemsQty: (activePrintInvoice.items || []).reduce((s, it) => s + (it.quantity || 1), 0),
                        paymentMethodName: (activePrintInvoice.header.balance_amount ?? 0) > 0 && (activePrintInvoice.header.paid_amount ?? 0) === 0 ? 'CREDIT' : (activePrintInvoice.header.invoice_type || 'CASH').toUpperCase(),
                        paid: activePrintInvoice.header.paid_amount ?? 0,
                        change: activePrintInvoice.header.change_amount || 0,
                        balance: activePrintInvoice.header.balance_amount || 0,
                        previousDue: 0,
                        outstandingDue: activePrintInvoice.header.balance_amount || 0,
                        footerNote: 'Thank you. Please Visit Again.',
                        softwareAttribution: 'Software By  AJ POS',
                      }}
                    />
                  </div>
                ) : (
                  <div
                    id="a4-tax-invoice-printable"
                    className="w-full bg-white text-black p-8 font-sans text-xs leading-relaxed shadow-2xl border border-gray-300 rounded-xl"
                  >
                    <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-4">
                      <div>
                        <h1 className="text-xl font-black uppercase tracking-wider text-black">BABY BLOOM (PVT) LTD</h1>
                        <p className="text-xs text-gray-700 font-semibold mt-0.5">Premium Baby & Mother Care Essentials</p>
                        <p className="text-[11px] text-gray-600 mt-1">
                          {activePrintInvoice.header.branch_name || 'Main Flagship Store'} • No. 124 Galle Road, Colombo 03, Sri Lanka
                        </p>
                        <p className="text-[11px] text-gray-600">
                          Tel: +94 11 234 5678 / +94 77 123 4567 • Email: sales@babybloom.lk
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-3 py-1 bg-black text-white text-xs font-black uppercase tracking-widest rounded">
                          COMMERCIAL TAX INVOICE
                        </span>
                        <div className="mt-2 text-xs">
                          <span className="text-gray-600">Invoice No: </span>
                          <strong className="font-mono text-sm text-black">{activePrintInvoice.header.invoice_number}</strong>
                        </div>
                        <div className="text-xs">
                          <span className="text-gray-600">Date: </span>
                          <strong>{new Date(activePrintInvoice.header.invoice_date).toLocaleDateString()}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-gray-50 border border-gray-200 rounded mb-4 text-xs grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-gray-500 font-bold block mb-1">CUSTOMER:</span>
                        <div className="font-bold text-sm">{activePrintInvoice.header.customer_name || 'Walk-in Customer'}</div>
                        <div className="text-gray-600">Phone: {activePrintInvoice.header.customer_phone || 'N/A'}</div>
                      </div>
                      <div>
                        <span className="text-gray-500 font-bold block mb-1">TRANSACTION:</span>
                        <div>Branch: <strong>{activePrintInvoice.header.branch_name || 'Main Branch'}</strong></div>
                        <div>Payment: <strong>{(activePrintInvoice.header.invoice_type || 'CASH').toUpperCase()}</strong></div>
                      </div>
                    </div>

                    <table className="w-full text-left text-xs border border-gray-300 mb-4">
                      <thead className="bg-gray-100 font-bold border-b border-gray-300">
                        <tr>
                          <th className="p-2 border-r border-gray-300">#</th>
                          <th className="p-2 border-r border-gray-300">Description</th>
                          <th className="p-2 border-r border-gray-300 text-right">Qty</th>
                          <th className="p-2 border-r border-gray-300 text-right">Unit Rate</th>
                          <th className="p-2 text-right">Total (Rs.)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(activePrintInvoice.items || []).map((it, idx) => (
                          <tr key={it.id || idx}>
                            <td className="p-2 border-r border-gray-200 text-center font-mono">{idx + 1}</td>
                            <td className="p-2 border-r border-gray-200 font-semibold">{it.product_name}</td>
                            <td className="p-2 border-r border-gray-200 text-right font-bold">{it.quantity}</td>
                            <td className="p-2 border-r border-gray-200 text-right font-mono">{formatCurrency(it.unit_price)}</td>
                            <td className="p-2 text-right font-mono font-bold">{formatCurrency(it.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="flex justify-end">
                      <div className="w-64 space-y-1 font-mono text-xs">
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <strong>{formatCurrency(activePrintInvoice.header.subtotal)}</strong>
                        </div>
                        <div className="flex justify-between font-bold text-sm border-t border-black pt-1">
                          <span>Grand Total:</span>
                          <strong>{formatCurrency(activePrintInvoice.header.grand_total)}</strong>
                        </div>
                        <div className="flex justify-between text-emerald-800">
                          <span>Paid:</span>
                          <strong>{formatCurrency(activePrintInvoice.header.paid_amount)}</strong>
                        </div>
                        <div className="flex justify-between font-bold border-t border-dashed border-gray-400 pt-1">
                          <span>Balance:</span>
                          <strong>{formatCurrency(activePrintInvoice.header.balance_amount)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="p-8 text-center text-sm text-[#f87171]">Invoice data could not be retrieved.</div>
              )}
            </div>

            <div className="p-4 border-t border-[#164e48] bg-[#0c2e2a] flex justify-end gap-2.5 no-print">
              <button
                type="button"
                className="px-3.5 py-1.5 text-xs text-[#a0c4c0] hover:text-white rounded-lg bg-[#082321] border border-[#164e48] cursor-pointer"
                onClick={() => setQuickPrintInvoice(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
                onClick={() => window.print()}
              >
                <Printer size={14} /> Print Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Billing Register Summary Report (Audit Print) ─────────────── */}
      {registerPrintModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-4xl w-full overflow-hidden text-white flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#164e48] bg-[#0c2e2a] no-print">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-[#38d4c5]" />
                <h3 className="text-sm font-bold text-white">Sales Billing Register Audit Report Preview</h3>
              </div>
              <button
                type="button"
                className="text-[#7aa5a0] hover:text-white p-1 rounded-lg cursor-pointer"
                onClick={() => setRegisterPrintModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 bg-slate-900/60 overflow-y-auto flex justify-center max-h-[75vh]">
              <div
                id="billing-register-summary-printable"
                className="w-full bg-white text-black p-8 font-sans text-xs leading-relaxed shadow-2xl border border-gray-300 rounded-xl"
              >
                {/* Header */}
                <div className="text-center pb-4 border-b-2 border-black mb-4">
                  <h1 className="text-2xl font-black uppercase tracking-wider text-black">BABY BLOOM (PVT) LTD</h1>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-gray-700 mt-0.5">
                    Sales Invoices & Billing Register Audit Summary
                  </h2>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Generated: {new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' })} • Colombo Flagship Store
                  </p>
                </div>

                {/* Audit KPIs */}
                <div className="grid grid-cols-4 gap-3 bg-gray-50 border border-gray-300 p-3 rounded mb-4 text-center">
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">TOTAL INVOICES</span>
                    <strong className="text-base text-black font-mono">{rows.length}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">GROSS BILLING</span>
                    <strong className="text-base text-black font-mono">{formatCurrency(grossSales)}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">COLLECTED / PAID</span>
                    <strong className="text-base text-emerald-800 font-mono">{formatCurrency(paidSales)}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 font-bold block text-[10px]">RECEIVABLES DUE</span>
                    <strong className="text-base text-rose-800 font-mono">{formatCurrency(balanceOutstanding)}</strong>
                  </div>
                </div>

                {/* Register Table */}
                <table className="w-full text-left text-[11px] border border-gray-300 mb-6">
                  <thead className="bg-gray-100 font-bold border-b border-gray-300">
                    <tr>
                      <th className="p-1.5 border-r border-gray-300">#</th>
                      <th className="p-1.5 border-r border-gray-300">Invoice No</th>
                      <th className="p-1.5 border-r border-gray-300">Date</th>
                      <th className="p-1.5 border-r border-gray-300">Customer</th>
                      <th className="p-1.5 border-r border-gray-300">Branch</th>
                      <th className="p-1.5 border-r border-gray-300 text-center">Type</th>
                      <th className="p-1.5 border-r border-gray-300 text-right">Grand Total</th>
                      <th className="p-1.5 border-r border-gray-300 text-right">Paid</th>
                      <th className="p-1.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {rows.map((r, idx) => (
                      <tr key={r.id || idx}>
                        <td className="p-1.5 border-r border-gray-200 text-center font-mono">{idx + 1}</td>
                        <td className="p-1.5 border-r border-gray-200 font-mono font-bold">{r.invoice_number}</td>
                        <td className="p-1.5 border-r border-gray-200">{new Date(r.invoice_date).toLocaleDateString()}</td>
                        <td className="p-1.5 border-r border-gray-200 font-medium">{r.customer_name || 'Walk-in'}</td>
                        <td className="p-1.5 border-r border-gray-200">{r.branch_name || 'Main Branch'}</td>
                        <td className="p-1.5 border-r border-gray-200 text-center uppercase text-[10px]">{r.invoice_type}</td>
                        <td className="p-1.5 border-r border-gray-200 text-right font-mono font-bold">{formatCurrency(r.grand_total)}</td>
                        <td className="p-1.5 border-r border-gray-200 text-right font-mono text-emerald-800">{formatCurrency(r.paid_amount)}</td>
                        <td className="p-1.5 text-right font-mono font-bold">{formatCurrency(r.balance_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-12 pt-8 mt-6 border-t border-gray-300 text-center text-xs">
                  <div>
                    <div className="border-b border-black w-48 mx-auto mb-1.5" />
                    <span className="font-semibold">Prepared by (Accounts / Billing Officer)</span>
                  </div>
                  <div>
                    <div className="border-b border-black w-48 mx-auto mb-1.5" />
                    <span className="font-semibold">Reviewed & Verified (Internal Auditor)</span>
                  </div>
                </div>

                <div className="text-center text-[10px] text-gray-400 mt-6 pt-3 border-t border-gray-200">
                  Baby Bloom Billing Register Audit Report • Colombo, Sri Lanka
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#164e48] bg-[#0c2e2a] flex justify-end gap-2.5 no-print">
              <button
                type="button"
                className="px-3.5 py-1.5 text-xs text-[#a0c4c0] hover:text-white rounded-lg bg-[#082321] border border-[#164e48] cursor-pointer"
                onClick={() => setRegisterPrintModal(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
                onClick={() => window.print()}
              >
                <Printer size={14} /> Print Audit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
