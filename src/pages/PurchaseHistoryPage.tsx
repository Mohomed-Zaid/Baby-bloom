import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Printer,
  RotateCcw,
  Send,
  ShieldCheck,
  Eye,
  Plus,
  Search,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  Warehouse,
  Package,
  Receipt,
  CreditCard,
  ExternalLink,
  TrendingUp,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/common/DataTable'
import { PageHeader } from '../components/common/PageHeader'
import { StatusBadge } from '../components/common/StatusBadge'
import { permissions } from '../config/permissions'
import { formatBusinessDate } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import { getPurchase, listPurchases, purchaseAction } from '../services/purchasing'
import { listLookup } from '../services/masterData'
import { useAuthStore } from '../stores/authStore'
import type { PurchaseRow, PurchaseItemRow, PurchasePayment } from '../types/purchasing'

const cash = (n: number | null | undefined) =>
  n === null || n === undefined
    ? 'Restricted'
    : `Rs. ${Number(n).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function PurchaseHistoryPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const allowed = useAuthStore((s) => s.user?.permissions) ?? []

  // Filters & State
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [vendor, setVendor] = useState('')
  const [branch, setBranch] = useState('')
  const [kind, setKind] = useState('')
  const [payment, setPayment] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'posted' | 'pending' | 'unpaid'>('all')
  const [notice, setNotice] = useState('')
  const [quickViewPurchase, setQuickViewPurchase] = useState<PurchaseRow | null>(null)

  const hasView = allowed.includes(permissions.purchasesView)
  const vendors = useQuery({
    queryKey: ['lookup', 'vendors'],
    queryFn: () => listLookup('vendors', 'name'),
    enabled: hasView,
  })
  const branches = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
    enabled: hasView,
  })

  // Synchronize Tab filter with query params
  const effectiveStatus = useMemo(() => {
    if (status) return status
    if (activeTab === 'posted') return 'posted'
    return ''
  }, [status, activeTab])

  const effectivePayment = useMemo(() => {
    if (payment) return payment
    if (activeTab === 'unpaid') return 'unpaid'
    return ''
  }, [payment, activeTab])

  const list = useQuery({
    queryKey: ['purchases', page, search, effectiveStatus, vendor, branch, kind, effectivePayment, from, to, activeTab],
    queryFn: () =>
      listPurchases({
        page,
        search,
        status: effectiveStatus,
        vendorId: vendor,
        branchId: branch,
        purchaseType: kind,
        paymentStatus: effectivePayment,
        dateFrom: from,
        dateTo: to,
      }),
    enabled: hasView,
  })

  // Full detail query when viewing specific purchase by URL ID
  const detail = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => getPurchase(id!),
    enabled: !!id && hasView,
  })

  // Quick view drawer query when clicking preview
  const drawerDetail = useQuery({
    queryKey: ['purchase', quickViewPurchase?.id],
    queryFn: () => getPurchase(quickViewPurchase!.id),
    enabled: !!quickViewPurchase && hasView,
  })

  const action = useMutation({
    mutationFn: ({
      name,
      row,
    }: {
      name: 'submit' | 'approve' | 'post' | 'cancel' | 'reverse'
      row: PurchaseRow
    }) => {
      const reason = ['cancel', 'reverse'].includes(name) ? window.prompt(`${name} reason`) ?? '' : ''
      if (['cancel', 'reverse'].includes(name) && !reason) throw new Error('A reason is required.')
      return purchaseAction(name, row.id, reason)
    },
    onSuccess: async (r) => {
      setNotice(`Document ${r.document_number} status updated to: ${r.status.toUpperCase()}`)
      await qc.invalidateQueries({ queryKey: ['purchases'] })
      await qc.invalidateQueries({ queryKey: ['purchase'] })
      await qc.invalidateQueries({ queryKey: ['current-stock'] })
      // Auto-clear notice after 5 seconds
      setTimeout(() => setNotice(''), 5000)
    },
    onError: (e) => setNotice(getErrorMessage(e)),
  })

  const can = (key: string) => allowed.includes(key)

  // Compute KPI totals from available data
  const kpis = useMemo(() => {
    const rows = list.data?.rows ?? []
    const totalValuation = rows.reduce((acc, r) => acc + (r.grand_total || 0), 0)
    const totalBalance = rows.reduce((acc, r) => acc + (r.balance_amount || 0), 0)
    const postedCount = rows.filter((r) => r.status === 'posted').length
    const pendingCount = rows.filter((r) => ['draft', 'submitted', 'approved'].includes(r.status)).length

    return {
      totalValuation,
      totalBalance,
      postedCount,
      pendingCount,
      totalRecords: list.data?.count ?? rows.length,
    }
  }, [list.data])

  const resetFilters = () => {
    setSearch('')
    setStatus('')
    setVendor('')
    setBranch('')
    setKind('')
    setPayment('')
    setFrom('')
    setTo('')
    setActiveTab('all')
    setPage(1)
  }

  const isFilterActive = !!(search || status || vendor || branch || kind || payment || from || to || activeTab !== 'all')

  const controls = (r: PurchaseRow) => (
    <div className="flex items-center gap-1 justify-end">
      <button
        type="button"
        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
        title="Quick View Details"
        onClick={() => setQuickViewPurchase(r)}
      >
        <Eye size={15} />
      </button>

      {r.status === 'draft' && can(permissions.purchasesSubmit) && (
        <button
          type="button"
          className="p-1.5 rounded-md hover:bg-amber-100 text-amber-700 transition-colors"
          title="Submit for Approval"
          onClick={() => action.mutate({ name: 'submit', row: r })}
        >
          <Send size={15} />
        </button>
      )}

      {r.status === 'submitted' && can(permissions.purchasesApprove) && (
        <button
          type="button"
          className="p-1.5 rounded-md hover:bg-blue-100 text-blue-700 transition-colors"
          title="Approve Purchase"
          onClick={() => action.mutate({ name: 'approve', row: r })}
        >
          <ShieldCheck size={15} />
        </button>
      )}

      {r.status === 'approved' && can(permissions.purchasesPost) && (
        <button
          type="button"
          className="px-2 py-1 text-xs font-semibold rounded bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-sm"
          title="Post Goods Receipt to Stock"
          onClick={() => action.mutate({ name: 'post', row: r })}
        >
          Post Stock
        </button>
      )}

      {r.status === 'posted' && (
        <Link
          to={`/purchases/${r.id}`}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
          title="Print Goods Received Note"
        >
          <Printer size={15} />
        </Link>
      )}

      {r.status === 'draft' && can(permissions.purchasesCancel) && (
        <button
          type="button"
          className="p-1.5 rounded-md hover:bg-rose-100 text-rose-600 transition-colors"
          title="Cancel Purchase"
          onClick={() => action.mutate({ name: 'cancel', row: r })}
        >
          <X size={15} />
        </button>
      )}

      {r.status === 'posted' && can(permissions.purchasesReverse) && (
        <button
          type="button"
          className="p-1.5 rounded-md hover:bg-rose-100 text-rose-700 transition-colors"
          title="Reverse Stock Posting"
          onClick={() => action.mutate({ name: 'reverse', row: r })}
        >
          <RotateCcw size={15} />
        </button>
      )}
    </div>
  )

  const columns: DataTableColumn<PurchaseRow>[] = [
    {
      key: 'no',
      header: 'Purchase Order / Invoice',
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <Link
              to={`/purchases/${r.id}`}
              className="font-semibold text-emerald-800 hover:text-emerald-950 hover:underline flex items-center gap-1"
            >
              {r.purchase_number}
              <ExternalLink size={12} className="opacity-60" />
            </Link>
            {r.purchase_type && (
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {r.purchase_type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Receipt size={11} className="text-slate-400" />
            <span>Supplier Inv: <strong className="text-slate-700">{r.vendor_invoice_number || 'N/A'}</strong></span>
          </div>
          {r.internal_reference && (
            <span className="text-[10px] text-slate-400">Ref: {r.internal_reference}</span>
          )}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date & Due',
      render: (r) => (
        <div className="flex flex-col text-xs">
          <span className="font-medium text-slate-800 flex items-center gap-1">
            <Calendar size={12} className="text-slate-400" />
            {formatBusinessDate(r.purchase_date)}
          </span>
          <span className="text-[11px] text-slate-500">
            Due: {r.due_date ? formatBusinessDate(r.due_date) : 'Immediate'}
          </span>
        </div>
      ),
    },
    {
      key: 'vendor',
      header: 'Supplier & Code',
      render: (r) => (
        <div className="flex flex-col text-xs">
          <strong className="text-slate-900 font-semibold">{r.vendor_name || 'Standard Vendor'}</strong>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-[10px] text-slate-600 font-mono">
              {r.vendor_code || 'VEND'}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'branch',
      header: 'Destination',
      render: (r) => (
        <div className="flex flex-col text-xs">
          <span className="text-slate-800 font-medium flex items-center gap-1">
            <Warehouse size={12} className="text-slate-400" />
            {r.branch_name || 'Main Branch'}
          </span>
          <span className="text-[11px] text-slate-500">{r.warehouse_name || 'Main Warehouse'}</span>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total Value',
      align: 'right',
      render: (r) => <strong className="font-semibold text-slate-900">{cash(r.grand_total)}</strong>,
    },
    {
      key: 'balance',
      header: 'Balance Due',
      align: 'right',
      render: (r) => {
        const bal = r.balance_amount ?? 0
        return (
          <div className="flex flex-col items-end text-xs">
            <span className={bal > 0 ? 'font-bold text-rose-600' : 'text-emerald-700 font-medium'}>
              {cash(bal)}
            </span>
            <span className="text-[10px] text-slate-400">Paid: {cash(r.paid_amount ?? 0)}</span>
          </div>
        )
      },
    },
    {
      key: 'payment',
      header: 'Payment',
      render: (r) => <StatusBadge status={r.payment_status} />,
    },
    {
      key: 'status',
      header: 'Stock Status',
      render: (r) => {
        if (r.status === 'posted') {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 size={12} className="text-emerald-600" />
              Live in Stock
            </span>
          )
        }
        if (r.status === 'approved') {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <ShieldCheck size={12} className="text-blue-600" />
              Approved
            </span>
          )
        }
        if (r.status === 'submitted') {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <Clock size={12} className="text-amber-600" />
              Submitted
            </span>
          )
        }
        return <StatusBadge status={r.status} />
      },
    },
    {
      key: 'user',
      header: 'Created By',
      render: (r) => <span className="text-xs text-slate-600">{r.created_user || 'Admin'}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: controls,
    },
  ]

  // ==========================================
  // DETAIL VIEW (When an ID is in the route URL)
  // ==========================================
  if (id) {
    const data = detail.data
    if (detail.isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-16 text-slate-500">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">Loading Goods Received Note & purchase document...</p>
        </div>
      )
    }

    if (!data) {
      return (
        <div className="page-stack">
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
            {getErrorMessage(detail.error)}
          </div>
          <Link to="/purchases" className="button secondary">
            <ArrowLeft size={15} /> Back to Purchase History
          </Link>
        </div>
      )
    }

    const r = data.header

    return (
      <div className="page-stack print-document">
        <PageHeader
          title={r.purchase_number}
          description={`${r.vendor_name} • Invoice: ${r.vendor_invoice_number || 'N/A'} • ${formatBusinessDate(r.purchase_date)}`}
          breadcrumbs={[{ label: 'Purchases', path: '/purchases' }, { label: r.purchase_number }]}
          actions={
            <div className="flex items-center gap-2">
              <Link className="button secondary no-print" to="/purchases">
                <ArrowLeft size={15} /> Back
              </Link>
              {can(permissions.purchasesPrint) && (
                <button
                  type="button"
                  className="button secondary no-print flex items-center gap-1.5"
                  onClick={() => window.print()}
                >
                  <Printer size={15} /> Print GRN
                </button>
              )}

              {/* 1-Click Fast Stock Inward Receiving Actions */}
              {r.status === 'draft' && (
                <button
                  type="button"
                  className="button primary no-print flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  onClick={async () => {
                    try {
                      await action.mutateAsync({ name: 'submit', row: r })
                      await action.mutateAsync({ name: 'approve', row: r })
                      await action.mutateAsync({ name: 'post', row: r })
                    } catch {}
                  }}
                >
                  <ShieldCheck size={16} />
                  Receive & Post Stock
                </button>
              )}

              {r.status === 'submitted' && (
                <button
                  type="button"
                  className="button primary no-print flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  onClick={async () => {
                    try {
                      await action.mutateAsync({ name: 'approve', row: r })
                      await action.mutateAsync({ name: 'post', row: r })
                    } catch {}
                  }}
                >
                  <ShieldCheck size={16} />
                  Approve & Post to Stock
                </button>
              )}

              {r.status === 'approved' && (
                <button
                  type="button"
                  className="button primary no-print flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  onClick={() => action.mutate({ name: 'post', row: r })}
                >
                  <CheckCircle2 size={16} />
                  Post to Live Stock
                </button>
              )}

              {r.status === 'posted' && (
                <span className="no-print font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-700" />
                  Live in Store Inventory
                </span>
              )}
            </div>
          }
        />

        {notice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg flex items-center justify-between">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Goods Received Note & Invoice Layout */}
        <section className="content-panel document-sheet p-6 space-y-6">
          {/* Header Badge Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <div>
              <span className="text-slate-500 block">Supplier Invoice</span>
              <strong className="text-slate-900 font-semibold">{r.vendor_invoice_number || '-'}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Workflow Status</span>
              <StatusBadge status={r.status} />
            </div>
            <div>
              <span className="text-slate-500 block">Payment Status</span>
              <StatusBadge status={r.payment_status} />
            </div>
            <div>
              <span className="text-slate-500 block">Credit Due Date</span>
              <strong className="text-slate-900 font-semibold">{formatBusinessDate(r.due_date)}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Branch & Location</span>
              <strong className="text-slate-900 font-semibold">{r.warehouse_name || r.branch_name}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Purchased By</span>
              <strong className="text-slate-900 font-semibold">{r.created_user || 'Admin Staff'}</strong>
            </div>
          </div>

          {/* Line Items Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <Package size={16} className="text-emerald-700" />
                Inward Line Items & Batches ({data.items.length})
              </h3>
              <span className="text-xs text-slate-500">Curated Goods Received Note</span>
            </div>

            <DataTable
              rows={data.items}
              rowKey={(x) => x.id}
              columns={[
                {
                  key: 'item',
                  header: 'Product / Variant Description',
                  render: (x: PurchaseItemRow) => (
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900 text-xs">
                        {x.product_code} - {x.product_name}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {x.variant_name || 'Standard'} • SKU: {x.sku || '-'} {x.barcode ? `• Barcode: ${x.barcode}` : ''}
                      </span>
                      {x.batch_reference && (
                        <span className="text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded w-fit mt-0.5 border border-emerald-200 font-mono">
                          Batch: {x.batch_reference} {x.expiry_date ? `(Exp: ${x.expiry_date})` : ''}
                        </span>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'qty',
                  header: 'Received Qty',
                  align: 'right',
                  render: (x: PurchaseItemRow) => (
                    <span className="font-medium text-slate-800 text-xs">
                      {x.quantity} {x.free_quantity > 0 && <span className="text-emerald-600">+{x.free_quantity} Free</span>}
                    </span>
                  ),
                },
                {
                  key: 'cost',
                  header: 'Unit Cost',
                  align: 'right',
                  render: (x: PurchaseItemRow) => <span className="text-xs">{cash(x.unit_cost)}</span>,
                },
                {
                  key: 'discount',
                  header: 'Discount',
                  align: 'right',
                  render: (x: PurchaseItemRow) => <span className="text-xs text-slate-600">{cash(x.discount_amount)}</span>,
                },
                {
                  key: 'landed',
                  header: 'Final Landed Cost',
                  align: 'right',
                  render: (x: PurchaseItemRow) => (
                    <span className="font-semibold text-slate-900 text-xs">{cash(x.final_unit_cost)}</span>
                  ),
                },
                {
                  key: 'total',
                  header: 'Line Total',
                  align: 'right',
                  render: (x: PurchaseItemRow) => (
                    <strong className="font-semibold text-emerald-950 text-xs">{cash(x.line_total)}</strong>
                  ),
                },
              ]}
            />
          </div>

          {/* Bottom Financials & Ledger */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
            {/* Payments Ledger */}
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <CreditCard size={16} className="text-emerald-700" />
                Payments Recorded ({data.payments.length})
              </h3>
              {data.payments.length > 0 ? (
                <div className="space-y-2">
                  {data.payments.map((pm: PurchasePayment) => (
                    <div
                      key={pm.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div>
                        <strong className="text-slate-900 block font-semibold">{pm.payment_method.toUpperCase()}</strong>
                        <span className="text-slate-500">
                          {formatBusinessDate(pm.payment_date)} • Status: {pm.status} ({pm.clearing_status})
                        </span>
                        {(pm.notes || pm.reference_number) && <p className="text-[11px] text-slate-600 mt-0.5">{pm.notes || pm.reference_number}</p>}
                      </div>
                      <span className="font-bold text-slate-900 text-sm">{cash(pm.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 text-center">
                  No payment ledger recorded. Standard credit terms apply.
                </div>
              )}

              {r.notes && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                  <strong>Notes:</strong> {r.notes}
                </div>
              )}
            </div>

            {/* Financial Summary */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between py-1 text-slate-600 border-b border-slate-200">
                <span>Gross Subtotal</span>
                <strong>{cash(r.subtotal)}</strong>
              </div>
              <div className="flex justify-between py-1 text-slate-600 border-b border-slate-200">
                <span>Bill & Item Discount</span>
                <span className="text-rose-600 font-medium">
                  -{cash((r.item_discount_total ?? 0) + (r.bill_discount_amount ?? 0))}
                </span>
              </div>
              <div className="flex justify-between py-1 text-slate-600 border-b border-slate-200">
                <span>VAT / Tax Total</span>
                <span>{cash(r.tax_total)}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-600 border-b border-slate-200">
                <span>Freight & Handling</span>
                <span>{cash((r.shipping_cost ?? 0) + (r.other_cost ?? 0))}</span>
              </div>
              <div className="flex justify-between py-2 text-base font-bold text-emerald-950 border-b-2 border-slate-300">
                <span>Grand Total</span>
                <span>{cash(r.grand_total)}</span>
              </div>
              <div className="flex justify-between py-1 text-emerald-800 font-semibold">
                <span>Paid Amount</span>
                <span>{cash(r.paid_amount)}</span>
              </div>
              <div className="flex justify-between py-1 text-sm font-bold text-rose-600">
                <span>Outstanding Balance</span>
                <span>{cash(r.balance_amount)}</span>
              </div>
            </div>
          </div>

          {/* Printable Signatures Strip */}
          <div className="hidden print:grid grid-cols-3 gap-6 pt-12 text-center text-xs text-slate-700">
            <div className="border-t border-slate-400 pt-2">
              <p className="font-semibold">Prepared By</p>
              <p className="text-[10px] text-slate-500">Purchasing Department</p>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <p className="font-semibold">Received & Inspected By</p>
              <p className="text-[10px] text-slate-500">Warehouse Storekeeper</p>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <p className="font-semibold">Authorized By</p>
              <p className="text-[10px] text-slate-500">Manager / Finance</p>
            </div>
          </div>
        </section>
      </div>
    )
  }

  // ==========================================
  // LIST VIEW (Main Purchase History Page)
  // ==========================================
  return (
    <div className="page-stack">
      <PageHeader
        title="Purchase History & Inward Bills"
        description="Search supplier bills, review goods received notes (GRN), and verify warehouse stock postings."
        breadcrumbs={[{ label: 'Purchases' }]}
        actions={
          <div className="flex items-center gap-2">
            <Link className="button primary flex items-center gap-1.5" to="/purchases/new">
              <Plus size={16} /> New Purchase Order
            </Link>
          </div>
        }
      />

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-teal-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Purchases Value</span>
            <div className="p-2 rounded-xl bg-teal-950/80 border border-teal-500/30 text-teal-400">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-white tracking-tight">
            {cash(kpis.totalValuation)}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            <span className="text-emerald-400 font-medium">{kpis.totalRecords} total orders recorded</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Stock Live in Stores</span>
            <div className="p-2 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-300 tracking-tight">
            {kpis.postedCount} Orders
          </div>
          <div className="mt-1 text-xs text-emerald-400/90 font-medium">
            Active in store inventory
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-rose-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Outstanding Payables</span>
            <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-500/30 text-rose-400">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-rose-400 tracking-tight">
            {cash(kpis.totalBalance)}
          </div>
          <div className="mt-1 text-xs text-rose-400/80 font-medium">
            Unpaid supplier credit
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-2xl p-5 shadow-lg backdrop-blur-md relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Pending Inward</span>
            <div className="p-2 rounded-xl bg-amber-950/80 border border-amber-500/30 text-amber-400">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-amber-300 tracking-tight">
            {kpis.pendingCount} Orders
          </div>
          <div className="mt-1 text-xs text-amber-400/80 font-medium">
            Awaiting stock receipt
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <section className="content-panel space-y-4 p-5">
        {/* Quick Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#164e48] pb-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                activeTab === 'all'
                  ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-lg shadow-emerald-950/50 border border-teal-500/40'
                  : 'bg-[#061e1c] text-slate-400 border border-[#164e48] hover:bg-[#0c312e] hover:text-teal-200'
              }`}
              onClick={() => {
                setActiveTab('all')
                setStatus('')
                setPayment('')
                setPage(1)
              }}
            >
              All Purchases ({kpis.totalRecords})
            </button>
            <button
              type="button"
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                activeTab === 'posted'
                  ? 'bg-gradient-to-r from-[#10b981] to-[#059669] text-white shadow-lg shadow-emerald-950/50 border border-teal-500/40'
                  : 'bg-[#061e1c] text-slate-400 border border-[#164e48] hover:bg-[#0c312e] hover:text-teal-200'
              }`}
              onClick={() => {
                setActiveTab('posted')
                setStatus('posted')
                setPayment('')
                setPage(1)
              }}
            >
              Live & Received ({kpis.postedCount})
            </button>
            <button
              type="button"
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                activeTab === 'pending'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-lg border border-amber-500/40'
                  : 'bg-[#061e1c] text-slate-400 border border-[#164e48] hover:bg-[#0c312e] hover:text-amber-200'
              }`}
              onClick={() => {
                setActiveTab('pending')
                setStatus('')
                setPayment('')
                setPage(1)
              }}
            >
              Pending Inward ({kpis.pendingCount})
            </button>
            <button
              type="button"
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                activeTab === 'unpaid'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-lg border border-rose-500/40'
                  : 'bg-[#061e1c] text-slate-400 border border-[#164e48] hover:bg-[#0c312e] hover:text-rose-200'
              }`}
              onClick={() => {
                setActiveTab('unpaid')
                setStatus('')
                setPayment('unpaid')
                setPage(1)
              }}
            >
              Unpaid Credit
            </button>
          </div>

          {isFilterActive && (
            <button
              type="button"
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 cursor-pointer"
              onClick={resetFilters}
            >
              <X size={13} /> Reset Filters
            </button>
          )}
        </div>

        {/* Detailed Search & Filter Toolbar */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Search Box */}
          <div className="md:col-span-2 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="text-input pl-9 pr-8 w-full text-xs"
              placeholder="Search PO #, Invoice #, or Supplier..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
            {search && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setSearch('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Supplier Select */}
          <select
            className="compact-select text-xs"
            value={vendor}
            onChange={(e) => {
              setVendor(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Suppliers</option>
            {vendors.data?.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>

          {/* Branch Select */}
          <select
            className="compact-select text-xs"
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Branches</option>
            {branches.data?.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>

          {/* Status Select */}
          <select
            className="compact-select text-xs"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Statuses</option>
            {['draft', 'submitted', 'approved', 'posted', 'cancelled', 'reversed'].map((x) => (
              <option key={x} value={x}>
                {x.toUpperCase()}
              </option>
            ))}
          </select>

          {/* Payment Status */}
          <select
            className="compact-select text-xs"
            value={payment}
            onChange={(e) => {
              setPayment(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All Payments</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        {/* Date Filter Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-1">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-medium text-slate-600">
              <Calendar size={13} className="text-slate-400" /> Date Range:
            </span>
            <input
              type="date"
              className="text-input text-xs py-1 px-2"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                setPage(1)
              }}
            />
            <span>to</span>
            <input
              type="date"
              className="text-input text-xs py-1 px-2"
              value={to}
              onChange={(e) => {
                setTo(e.target.value)
                setPage(1)
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">
              Showing {list.data?.rows?.length ?? 0} of {list.data?.count ?? 0} orders
            </span>
          </div>
        </div>

        {/* Data Table */}
        {list.isLoading ? (
          <div className="flex flex-col items-center justify-center p-16 text-slate-400">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">Fetching purchase orders and invoices...</p>
          </div>
        ) : list.error ? (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm">
            {getErrorMessage(list.error)}
          </div>
        ) : (
          <DataTable
            rows={list.data?.rows ?? []}
            columns={columns}
            rowKey={(r) => r.id}
            emptyTitle="No Purchase Records Found"
            emptyDescription="No purchase invoices matched the specified filters. Try clearing filters or create a new purchase order."
          />
        )}

        {/* Pagination Bar */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <button
            type="button"
            className="button secondary text-xs"
            disabled={page === 1}
            onClick={() => setPage((x) => x - 1)}
          >
            Previous
          </button>
          <span className="text-xs text-slate-600 font-medium">Page {page}</span>
          <button
            type="button"
            className="button secondary text-xs"
            disabled={(list.data?.rows.length ?? 0) < 20}
            onClick={() => setPage((x) => x + 1)}
          >
            Next
          </button>
        </div>
      </section>

      {/* QUICK VIEW DRAWER MODAL */}
      {quickViewPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Receipt size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    {quickViewPurchase.purchase_number}
                    <StatusBadge status={quickViewPurchase.status} />
                  </h3>
                  <p className="text-xs text-slate-500">
                    {quickViewPurchase.vendor_name} • Invoice: {quickViewPurchase.vendor_invoice_number || 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/purchases/${quickViewPurchase.id}`}
                  className="button secondary text-xs flex items-center gap-1"
                >
                  <ExternalLink size={13} /> Full GRN Page
                </Link>
                <button
                  type="button"
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  onClick={() => setQuickViewPurchase(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Info Badges Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Purchase Date</span>
                  <strong className="text-slate-800">{formatBusinessDate(quickViewPurchase.purchase_date)}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Credit Due</span>
                  <strong className="text-slate-800">{formatBusinessDate(quickViewPurchase.due_date)}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Destination</span>
                  <strong className="text-slate-800">{quickViewPurchase.branch_name || 'Main Branch'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Warehouse Location</span>
                  <strong className="text-slate-800">{quickViewPurchase.warehouse_name || 'Main Warehouse'}</strong>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <h4 className="font-semibold text-slate-900 text-xs mb-2 flex items-center gap-1.5">
                  <Package size={14} className="text-emerald-700" />
                  Purchased Items ({drawerDetail.data?.items.length ?? 0})
                </h4>

                {drawerDetail.isLoading ? (
                  <div className="p-8 text-center text-xs text-slate-400">Loading order items...</div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Item & Variant</th>
                          <th className="p-2.5 text-right">Qty</th>
                          <th className="p-2.5 text-right">Unit Cost</th>
                          <th className="p-2.5 text-right">Landed Cost</th>
                          <th className="p-2.5 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {drawerDetail.data?.items.map((it) => (
                          <tr key={it.id} className="hover:bg-slate-50/50">
                            <td className="p-2.5">
                              <p className="font-semibold text-slate-900">
                                {it.product_code} - {it.product_name}
                              </p>
                              <span className="text-[11px] text-slate-500">
                                {it.variant_name} {it.batch_reference ? `• Batch: ${it.batch_reference}` : ''}
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-medium text-slate-800">
                              {it.quantity} {it.free_quantity > 0 && <span className="text-emerald-600">+{it.free_quantity} Free</span>}
                            </td>
                            <td className="p-2.5 text-right text-slate-600">{cash(it.unit_cost)}</td>
                            <td className="p-2.5 text-right font-medium text-slate-800">{cash(it.final_unit_cost)}</td>
                            <td className="p-2.5 text-right font-bold text-slate-900">{cash(it.line_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Financial Summary */}
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <div>
                  <span className="text-slate-500 block">Payment Status:</span>
                  <div className="mt-1">
                    <StatusBadge status={quickViewPurchase.payment_status} />
                  </div>
                  {quickViewPurchase.notes && (
                    <p className="mt-2 text-slate-600 italic max-w-sm">"{quickViewPurchase.notes}"</p>
                  )}
                </div>

                <div className="w-full sm:w-64 space-y-1.5 text-right">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span>{cash(quickViewPurchase.subtotal)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 text-sm border-t border-slate-200 pt-1">
                    <span>Grand Total:</span>
                    <span>{cash(quickViewPurchase.grand_total)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Paid:</span>
                    <span>{cash(quickViewPurchase.paid_amount)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>Balance Due:</span>
                    <span>{cash(quickViewPurchase.balance_amount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer with Actions */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Created By: {quickViewPurchase.created_user || 'Admin'}
              </span>

              <div className="flex items-center gap-2">
                {quickViewPurchase.status === 'draft' && (
                  <button
                    type="button"
                    className="button primary text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={async () => {
                      try {
                        await action.mutateAsync({ name: 'submit', row: quickViewPurchase })
                        await action.mutateAsync({ name: 'approve', row: quickViewPurchase })
                        await action.mutateAsync({ name: 'post', row: quickViewPurchase })
                        setQuickViewPurchase(null)
                      } catch {}
                    }}
                  >
                    <ShieldCheck size={14} /> Receive Stock Now
                  </button>
                )}

                {quickViewPurchase.status === 'approved' && (
                  <button
                    type="button"
                    className="button primary text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={async () => {
                      try {
                        await action.mutateAsync({ name: 'post', row: quickViewPurchase })
                        setQuickViewPurchase(null)
                      } catch {}
                    }}
                  >
                    <CheckCircle2 size={14} /> Post to Live Stock
                  </button>
                )}

                <button
                  type="button"
                  className="button secondary text-xs"
                  onClick={() => setQuickViewPurchase(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
