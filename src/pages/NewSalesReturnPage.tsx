import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Search,
  Trash2,
  CheckCircle2,
  Printer,
  RotateCcw,
  AlertCircle,
  ShoppingBag,
  CreditCard,
  Banknote,
  Package,
  Sparkles,
  Plus,
  Minus,
  RefreshCw,
  Coins,
  FileText,
  TrendingDown,
} from 'lucide-react'
import { listLookup } from '../services/masterData'
import {
  listInvoices,
  returnEligibility,
  createSalesReturnDraft,
  salesReturnAction,
  listPosProducts,
} from '../services/sales'
import {
  MOCK_BRANCHES,
  MOCK_WAREHOUSES,
  MOCK_LOCATIONS,
  MOCK_CUSTOMERS,
  MOCK_BANK_ACCOUNTS,
  MOCK_PRODUCTS,
} from '../services/mockData'
import { useBranchStore } from '../stores/branchStore'
import { colomboNow } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import { ThermalReceiptDocket, type ThermalReceiptData } from '../components/common/ThermalReceiptDocket'
import type { SalesInvoiceRow, PosProduct } from '../types/sales'

interface ReturnLineItem {
  key: string
  original_invoice_item_id: string | null
  product_variant_id: string
  product_name: string
  variant_name?: string
  sku: string
  barcode?: string | null
  sold_quantity: number
  returned_quantity: number
  eligible_quantity: number
  return_quantity: number
  unit_price: number
  cost_price: number
  restock_condition: 'good' | 'damaged' | 'write_off'
  remarks: string
}

interface CompletedReturnInfo {
  id: string
  document_number: string
  posted: boolean
  settlement_type: string
  customer_name: string
  customer_code?: string
  customer_phone?: string
  invoice_number?: string
  branch_name?: string
  warehouse_name?: string
  location_name?: string
  total_amount: number
  date: string
  reason: string
  notes?: string
  items: Array<{
    name: string
    variant?: string
    sku?: string
    quantity: number
    unit_price: number
    condition: 'good' | 'damaged' | 'write_off'
    remarks?: string
  }>
}

const formatCurrency = (val: number | null | undefined) => {
  if (val === null || val === undefined) return 'Rs. 0.00'
  return `Rs. ${Number(val).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const QUICK_REASONS = [
  'Defective / Damaged',
  'Wrong Item / Size',
  'Customer Changed Mind',
  'Expired / Near Expiry',
  'Pricing / Billing Error',
]

export const NewSalesReturnPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentBranchId = useBranchStore((s) => s.branchId)

  // Mode: Linked Invoice vs Standalone Return
  const [isLinked, setIsLinked] = useState(true)

  // Header State
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoiceRow | null>(null)
  const [customerId, setCustomerId] = useState('')
  const [branchId, setBranchId] = useState(currentBranchId || 'branch-colombo')
  const [warehouseId, setWarehouseId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [returnDate, setReturnDate] = useState(colomboNow().format('YYYY-MM-DD'))
  const [settlementType, setSettlementType] = useState<'cash_refund' | 'bank_refund' | 'customer_credit'>('customer_credit')
  const [bankAccountId, setBankAccountId] = useState('')
  const [reason, setReason] = useState('Customer Return')
  const [notes, setNotes] = useState('')

  // Lines State
  const [lines, setLines] = useState<ReturnLineItem[]>([])
  const [productSearch, setProductSearch] = useState('')

  // Toasts & Post-completion modal
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const [completedReturn, setCompletedReturn] = useState<CompletedReturnInfo | null>(null)
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4'>('thermal')

  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // Lookups with fallbacks
  const { data: dbBranches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches', 'name'),
  })
  const branches = dbBranches.length > 0
    ? dbBranches
    : MOCK_BRANCHES.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))

  const { data: dbWarehouses = [] } = useQuery({
    queryKey: ['lookup', 'warehouses', branchId],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: branchId, is_active: true }),
    enabled: !!branchId,
  })
  const filteredMockWarehouses = MOCK_WAREHOUSES.filter((w) => !branchId || w.branch_id === branchId)
  const warehouses = dbWarehouses.length > 0
    ? dbWarehouses
    : filteredMockWarehouses.length > 0
    ? filteredMockWarehouses.map((w) => ({ value: w.id, label: w.name }))
    : [{ value: 'wh-main', label: 'Main Store Warehouse' }]

  const effectiveWarehouseId = warehouseId || warehouses[0]?.value || ''

  const { data: dbLocations = [] } = useQuery({
    queryKey: ['lookup', 'locations', effectiveWarehouseId],
    queryFn: () => listLookup('stock_locations', 'name', { warehouse_id: effectiveWarehouseId, is_active: true }),
    enabled: !!effectiveWarehouseId,
  })
  const filteredMockLocations = MOCK_LOCATIONS.filter((l) => !effectiveWarehouseId || l.warehouse_id === effectiveWarehouseId)
  const locations = dbLocations.length > 0
    ? dbLocations
    : filteredMockLocations.length > 0
    ? filteredMockLocations.map((l) => ({ value: l.id, label: l.name }))
    : [{ value: 'loc-floor', label: 'Retail Floor Shelf' }]

  const effectiveLocationId = locationId || locations[0]?.value || ''

  const { data: dbCustomers = [] } = useQuery({
    queryKey: ['lookup', 'customers'],
    queryFn: () => listLookup('customers', 'name', { is_active: true }),
  })
  const customers = dbCustomers.length > 0
    ? dbCustomers
    : MOCK_CUSTOMERS.map((c) => ({ value: c.id, label: `${c.name} (${c.customer_code})` }))

  const { data: dbBankAccounts = [] } = useQuery({
    queryKey: ['lookup', 'bank_accounts'],
    queryFn: () => listLookup('bank_accounts', 'account_name', { is_active: true }),
  })
  const bankAccounts = dbBankAccounts.length > 0
    ? dbBankAccounts
    : MOCK_BANK_ACCOUNTS.map((b) => ({ value: b.id, label: `${b.bank_name} - ${b.account_name} (${b.account_number})` }))

  // Invoices lookup query
  const { data: invoiceResults, isLoading: searchingInvoices } = useQuery({
    queryKey: ['sales-invoices-lookup', invoiceSearch, branchId],
    queryFn: () =>
      listInvoices({
        status: 'posted',
        search: invoiceSearch,
        branchId: branchId || undefined,
        pageSize: 10,
      }),
    enabled: isLinked && invoiceSearch.trim().length >= 2,
  })

  // Product search for standalone return with offline fallback
  const { data: foundProducts = [] } = useQuery({
    queryKey: ['pos-product-search-return', productSearch, effectiveLocationId],
    queryFn: async () => {
      try {
        const res = await listPosProducts(productSearch, effectiveLocationId || undefined)
        if (res && res.length > 0) return res.slice(0, 10)
      } catch {}

      // Fallback search in MOCK_PRODUCTS
      const term = productSearch.toLowerCase().trim()
      const mockMatches = MOCK_PRODUCTS.filter(
        (p) =>
          p.product_name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.barcode && p.barcode.toLowerCase().includes(term))
      )
      return mockMatches.slice(0, 10).map((m) => ({
        product_variant_id: m.id,
        product_id: m.product_id,
        product_code: m.sku,
        product_name: m.product_name,
        variant_name: m.variant_name,
        sku: m.sku,
        barcode: m.barcode,
        base_unit_id: 'unit-pcs',
        unit_name: 'PCS',
        retail_price: m.retail_price,
        wholesale_price: m.retail_price * 0.9,
        special_price: m.retail_price,
        last_cost: m.cost_price,
        available_quantity: m.available_quantity,
        track_stock: true,
        allow_negative_stock: false,
        tax_rate: 0,
      })) as PosProduct[]
    },
    enabled: !isLinked && productSearch.trim().length >= 2,
  })

  // Select an invoice to populate lines
  const handleSelectInvoice = async (inv: SalesInvoiceRow) => {
    setSelectedInvoice(inv)
    setCustomerId(inv.customer_id)
    if (inv.branch_id) setBranchId(inv.branch_id)
    if (inv.warehouse_id) setWarehouseId(inv.warehouse_id)
    if (inv.stock_location_id) setLocationId(inv.stock_location_id)
    setInvoiceSearch('')

    try {
      const eligible = await returnEligibility(inv.id)
      const mapped: ReturnLineItem[] = eligible.map((e) => ({
        key: e.original_invoice_item_id,
        original_invoice_item_id: e.original_invoice_item_id,
        product_variant_id: e.product_variant_id,
        product_name: e.product_name,
        variant_name: e.variant_name || '',
        sku: e.sku || e.product_code,
        barcode: e.barcode,
        sold_quantity: Number(e.sold_quantity),
        returned_quantity: Number(e.returned_quantity),
        eligible_quantity: Number(e.eligible_quantity),
        return_quantity: Number(e.eligible_quantity) > 0 ? 1 : 0,
        unit_price: Number(e.historical_unit_price),
        cost_price: Number(e.historical_cost_price ?? 0),
        restock_condition: 'good',
        remarks: '',
      }))
      const validLines = mapped.filter((m) => m.eligible_quantity > 0)
      setLines(validLines)
      if (validLines.length === 0) {
        notify(`Invoice #${inv.invoice_number} has no remaining eligible return items.`, true)
      } else {
        notify(`Loaded ${validLines.length} eligible return items from Invoice #${inv.invoice_number}`)
      }
    } catch (err) {
      notify(getErrorMessage(err), true)
    }
  }

  const addStandaloneProduct = (p: PosProduct) => {
    if (lines.some((l) => l.product_variant_id === p.product_variant_id)) {
      notify('This item is already added to the return items list.', true)
      return
    }
    const newLine: ReturnLineItem = {
      key: crypto.randomUUID(),
      original_invoice_item_id: null,
      product_variant_id: p.product_variant_id,
      product_name: p.product_name,
      variant_name: p.variant_name || '',
      sku: p.sku || p.product_code,
      barcode: p.barcode,
      sold_quantity: 0,
      returned_quantity: 0,
      eligible_quantity: 9999,
      return_quantity: 1,
      unit_price: p.retail_price,
      cost_price: p.last_cost ?? 0,
      restock_condition: 'good',
      remarks: '',
    }
    setLines([...lines, newLine])
    setProductSearch('')
    notify(`Added ${p.product_name}`)
  }

  // Batch line quantity adjusters
  const handleSetAllMax = () => {
    setLines(lines.map((l) => ({ ...l, return_quantity: l.eligible_quantity })))
  }

  const handleResetAllZero = () => {
    setLines(lines.map((l) => ({ ...l, return_quantity: 0 })))
  }

  const updateLineQty = (key: string, delta: number) => {
    setLines(
      lines.map((l) => {
        if (l.key !== key) return l
        const max = isLinked ? l.eligible_quantity : 9999
        const next = Math.max(0, Math.min(max, l.return_quantity + delta))
        return { ...l, return_quantity: next }
      })
    )
  }

  // Totals calculations
  const activeLines = lines.filter((l) => l.return_quantity > 0)
  const totalUnits = activeLines.reduce((acc, l) => acc + l.return_quantity, 0)
  const grandTotal = activeLines.reduce((acc, l) => acc + l.return_quantity * l.unit_price, 0)

  // Save Return Mutation
  const saveMutation = useMutation({
    mutationFn: async (shouldPost: boolean) => {
      const activeCust = customerId || (selectedInvoice?.customer_id ?? 'cust-walkin')
      const activeBranch = branchId || 'branch-colombo'
      const activeWarehouse = effectiveWarehouseId || 'wh-main'
      const activeLocation = effectiveLocationId || 'loc-floor'

      if (!reason.trim()) throw new Error('Return reason is required.')

      if (activeLines.length === 0) {
        throw new Error('Please enter a return quantity greater than 0 for at least one item.')
      }

      for (const line of activeLines) {
        if (line.return_quantity <= 0) {
          throw new Error(`Quantity for ${line.product_name} must be greater than 0.`)
        }
        if (isLinked && line.return_quantity > line.eligible_quantity) {
          throw new Error(`Return quantity for ${line.product_name} exceeds eligible amount (${line.eligible_quantity}).`)
        }
      }

      const header = {
        branch_id: activeBranch,
        warehouse_id: activeWarehouse,
        stock_location_id: activeLocation,
        sales_invoice_id: isLinked ? selectedInvoice?.id : null,
        invoice_id: isLinked ? selectedInvoice?.id : null,
        customer_id: activeCust,
        return_date: returnDate,
        settlement_type: settlementType,
        bank_account_id: settlementType === 'bank_refund' ? bankAccountId : null,
        reason: reason.trim(),
        notes: notes.trim() || null,
      }

      const items = activeLines.map((l) => ({
        original_invoice_item_id: l.original_invoice_item_id,
        product_variant_id: l.product_variant_id,
        quantity: l.return_quantity,
        unit_price: l.unit_price,
        cost_price: l.cost_price,
        restock_condition: l.restock_condition,
        reason: reason.trim(),
        remarks: l.remarks.trim() || null,
        product_name: l.product_name,
        variant_name: l.variant_name,
        sku: l.sku,
      }))

      // 1. Create draft return
      const draftRes = await createSalesReturnDraft(header, items)

      // 2. If shouldPost, post atomically
      const customerMatch = customers.find((c) => c.value === activeCust)
      const customerObj = MOCK_CUSTOMERS.find((c) => c.id === activeCust)
      const branchMatch = branches.find((b) => b.value === activeBranch)
      const warehouseMatch = warehouses.find((w) => w.value === activeWarehouse)
      const locationMatch = locations.find((l) => l.value === activeLocation)

      if (shouldPost) {
        const postRes = await salesReturnAction('post', draftRes.id)
        return {
          id: postRes.id,
          document_number: postRes.document_number,
          posted: true,
          settlement_type: settlementType,
          customer_name: customerMatch?.label || selectedInvoice?.customer_name || 'Walk-in Cash Customer',
          customer_code: customerObj?.customer_code || 'CUST-001',
          customer_phone: customerObj?.phone || '+94 77 000 0000',
          invoice_number: selectedInvoice?.invoice_number,
          branch_name: branchMatch?.label || 'Main Flagship Store',
          warehouse_name: warehouseMatch?.label || 'Colombo Central Warehouse',
          location_name: locationMatch?.label || 'Ground Floor Racks',
          total_amount: grandTotal,
          date: returnDate,
          reason: reason.trim(),
          notes: notes.trim(),
          items: activeLines.map((l) => ({
            name: l.product_name,
            variant: l.variant_name,
            sku: l.sku,
            quantity: l.return_quantity,
            unit_price: l.unit_price,
            condition: l.restock_condition,
            remarks: l.remarks,
          })),
        }
      }

      return {
        id: draftRes.id,
        document_number: draftRes.document_number,
        posted: false,
        settlement_type: settlementType,
        customer_name: customerMatch?.label || selectedInvoice?.customer_name || 'Walk-in Cash Customer',
        customer_code: customerObj?.customer_code || 'CUST-001',
        customer_phone: customerObj?.phone || '+94 77 000 0000',
        invoice_number: selectedInvoice?.invoice_number,
        branch_name: branchMatch?.label || 'Main Flagship Store',
        warehouse_name: warehouseMatch?.label || 'Colombo Central Warehouse',
        location_name: locationMatch?.label || 'Ground Floor Racks',
        total_amount: grandTotal,
        date: returnDate,
        reason: reason.trim(),
        notes: notes.trim(),
        items: activeLines.map((l) => ({
          name: l.product_name,
          variant: l.variant_name,
          sku: l.sku,
          quantity: l.return_quantity,
          unit_price: l.unit_price,
          condition: l.restock_condition,
          remarks: l.remarks,
        })),
      }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] })
      queryClient.invalidateQueries({ queryKey: ['current-stock'] })
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
      setCompletedReturn(res)
      notify(
        res.posted
          ? `Sales Return #${res.document_number} posted! Stock restocked and ${settlementType.replace(/_/g, ' ')} created.`
          : `Sales Return #${res.document_number} saved as draft.`
      )
    },
    onError: (err) => {
      notify(getErrorMessage(err), true)
    },
  })

  const settlementLabel = (t: string) => {
    switch (t) {
      case 'cash_refund':
        return 'Cash Refund (Disbursed from Register)'
      case 'bank_refund':
        return 'Bank / Card Reversal'
      case 'customer_credit':
      default:
        return 'Customer Credit Note'
    }
  }

  // Construct thermal receipt data
  const thermalData: ThermalReceiptData | null = completedReturn
    ? {
        number: completedReturn.document_number,
        date: completedReturn.date,
        cashier: 'POS Cashier / Admin',
        storeName: 'BABY BLOOM RETAIL',
        addressLine1: 'No 45, Galle Road, Colombo 03',
        addressLine2: `Branch: ${completedReturn.branch_name || 'Colombo Store'}`,
        phoneLine: '011-2345678 | 077-1234567',
        customerName: completedReturn.customer_name,
        customerPhone: completedReturn.customer_phone || '',
        items: completedReturn.items.map((it) => ({
          name: `${it.name}${it.variant ? ` (${it.variant})` : ''} [${it.condition.toUpperCase()}]`,
          qty: it.quantity,
          price: it.unit_price,
          total: it.quantity * it.unit_price,
        })),
        subtotal: completedReturn.total_amount,
        grandTotal: completedReturn.total_amount,
        itemsQty: completedReturn.items.reduce((s, it) => s + it.quantity, 0),
        paymentMethodName:
          completedReturn.settlement_type === 'cash_refund'
            ? 'CASH REFUND'
            : completedReturn.settlement_type === 'bank_refund'
            ? 'BANK REVERSAL'
            : 'CREDIT NOTE',
        paid: completedReturn.total_amount,
        footerNote: '*** SALES RETURN / CREDIT MEMO ***\nStock restocked into inventory.\nPlease retain this voucher for ledger adjustment.',
        softwareAttribution: 'Baby Bloom ERP POS',
      }
    : null

  return (
    <div
      className="min-h-screen text-[#e2f1ef] p-6 space-y-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* Toast Notification */}
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#164e48] pb-6">
        <div className="flex items-center gap-3">
          <Link
            to="/sales/returns"
            className="p-2.5 bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] rounded-xl text-[#a0c4c0] hover:text-white transition-colors"
            title="Back to Sales Returns Register"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <RotateCcw className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Process Sales Return
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Restocking & Settlements
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Verify customer invoice items or process direct standalone returns with automated restock and settlement ledger allocation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#164e48] rounded-xl text-sm font-medium text-[#a0c4c0] bg-[#0c2e2a] hover:bg-[#12423c] hover:text-white transition-colors"
            onClick={() => navigate('/sales/returns')}
          >
            <ArrowLeft size={16} /> Returns History
          </button>
        </div>
      </div>

      {/* Mode Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#061e1c]/80 p-3 rounded-2xl border border-[#164e48]">
        <div className="inline-flex rounded-xl p-1 bg-[#031413] border border-[#164e48]">
          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              isLinked
                ? 'bg-[#103e39] text-[#38d4c5] shadow-sm'
                : 'text-[#7aa5a0] hover:text-white'
            }`}
            onClick={() => {
              setIsLinked(true)
              setSelectedInvoice(null)
              setLines([])
            }}
          >
            <ShoppingBag size={14} />
            <span>Invoice-Linked Return</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#061e1c] text-[#34d399] border border-[#164e48]">
              Audit Verified
            </span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              !isLinked
                ? 'bg-[#103e39] text-[#38d4c5] shadow-sm'
                : 'text-[#7aa5a0] hover:text-white'
            }`}
            onClick={() => {
              setIsLinked(false)
              setSelectedInvoice(null)
              setLines([])
            }}
          >
            <Package size={14} />
            <span>Standalone Direct Return</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#061e1c] text-[#facc15] border border-[#164e48]">
              Manual Add
            </span>
          </button>
        </div>

        <div className="text-xs text-[#7aa5a0] flex items-center gap-1.5 px-2">
          <Sparkles size={14} className="text-[#38d4c5]" />
          <span>
            {isLinked
              ? 'Items are validated against original invoice price, quantity sold, and prior returns.'
              : 'Direct return restores inventory to stock and generates a credit note or refund.'}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-[#7aa5a0]">
            <span>Active Return Lines</span>
            <Package size={15} className="text-[#38d4c5]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-white">{activeLines.length}</div>
          <div className="text-xs text-[#527d78] mt-0.5">Item variants selected</div>
        </div>

        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-[#7aa5a0]">
            <span>Total Return Units</span>
            <RotateCcw size={15} className="text-[#facc15]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#facc15]">{totalUnits} PCS</div>
          <div className="text-xs text-[#527d78] mt-0.5">Restocking into inventory</div>
        </div>

        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-[#7aa5a0]">
            <span>Net Refund Total</span>
            <TrendingDown size={15} className="text-[#f87171]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#f87171]">{formatCurrency(grandTotal)}</div>
          <div className="text-xs text-[#527d78] mt-0.5">Disbursement or credit</div>
        </div>

        <div className="p-4 rounded-2xl bg-[#061e1c]/80 border border-[#164e48] shadow-md backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-[#7aa5a0]">
            <span>Settlement Mode</span>
            <Coins size={15} className="text-[#34d399]" />
          </div>
          <div className="mt-1.5 text-sm font-bold text-[#34d399] capitalize truncate">
            {settlementType.replace(/_/g, ' ')}
          </div>
          <div className="text-xs text-[#527d78] mt-0.5">Ledger posting channel</div>
        </div>
      </div>

      {/* Main 2-Column Responsive Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Invoice Lookup & Return Lines Table (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Header Card: Invoice Search or Standalone Parameters */}
          {isLinked ? (
            <div className="bg-[#061e1c]/80 p-5 rounded-2xl border border-[#164e48] shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Search size={16} className="text-[#38d4c5]" />
                  <span>Select Original Sales Invoice</span>
                </h3>
                {selectedInvoice && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium text-[#38d4c5] bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48]"
                    onClick={() => {
                      setSelectedInvoice(null)
                      setLines([])
                    }}
                  >
                    <RefreshCw size={12} /> Change Invoice
                  </button>
                )}
              </div>

              {!selectedInvoice ? (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#527d78]" size={16} />
                    <input
                      type="text"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#031413] border border-[#164e48] rounded-xl text-sm text-white placeholder-[#527d78] focus:outline-none focus:border-[#38d4c5]"
                      placeholder="Type invoice # (e.g. INV-2026), customer name, or phone..."
                      value={invoiceSearch}
                      onChange={(e) => setInvoiceSearch(e.target.value)}
                    />
                    {searchingInvoices && (
                      <RefreshCw className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#38d4c5] animate-spin" size={16} />
                    )}
                  </div>

                  {invoiceSearch.trim().length >= 2 && invoiceResults?.rows && (
                    <div className="absolute left-0 right-0 mt-2 bg-[#082321] border border-[#164e48] rounded-xl shadow-2xl max-h-60 overflow-y-auto z-40 divide-y divide-[#113e3a]">
                      {invoiceResults.rows.length === 0 ? (
                        <div className="p-4 text-center text-xs text-[#7aa5a0]">
                          No posted sales invoices found matching "{invoiceSearch}".
                        </div>
                      ) : (
                        invoiceResults.rows.map((inv) => (
                          <div
                            key={inv.id}
                            className="p-3.5 hover:bg-[#0c312d] cursor-pointer transition-colors flex items-center justify-between"
                            onClick={() => handleSelectInvoice(inv)}
                          >
                            <div>
                              <div className="font-bold text-white text-sm flex items-center gap-2">
                                <span>{inv.invoice_number}</span>
                                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#092920] text-[#34d399] border border-[#059669]/30">
                                  {inv.status}
                                </span>
                              </div>
                              <div className="text-xs text-[#7aa5a0] mt-0.5">
                                Customer: <span className="text-white font-medium">{inv.customer_name}</span> • Date: {new Date(inv.invoice_date).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-[#38d4c5]">{formatCurrency(inv.grand_total)}</div>
                              <div className="text-[10px] text-[#527d78]">{inv.branch_name || 'Main Branch'}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#031413] border border-[#164e48] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[#7aa5a0]">Invoice Number:</span>
                    <div className="font-bold text-white text-sm mt-0.5">{selectedInvoice.invoice_number}</div>
                  </div>
                  <div>
                    <span className="text-[#7aa5a0]">Customer:</span>
                    <div className="font-semibold text-white mt-0.5">{selectedInvoice.customer_name}</div>
                  </div>
                  <div>
                    <span className="text-[#7aa5a0]">Invoice Date:</span>
                    <div className="text-white mt-0.5">{new Date(selectedInvoice.invoice_date).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <span className="text-[#7aa5a0]">Total Billed:</span>
                    <div className="font-bold text-[#38d4c5] mt-0.5">{formatCurrency(selectedInvoice.grand_total)}</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#061e1c]/80 p-5 rounded-2xl border border-[#164e48] shadow-xl backdrop-blur-md space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Package size={16} className="text-[#38d4c5]" />
                <span>Search & Add Products for Direct Restock</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">Customer</label>
                  <select
                    className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">Select Customer...</option>
                    {customers.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">Product Search</label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-[#527d78] focus:outline-none focus:border-[#38d4c5]"
                      placeholder="Type product name, SKU, or barcode..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {productSearch.trim().length >= 2 && foundProducts.length > 0 && (
                <div className="bg-[#082321] border border-[#164e48] rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-[#113e3a]">
                  {foundProducts.map((p) => (
                    <div
                      key={p.product_variant_id}
                      className="p-3 hover:bg-[#0c312d] cursor-pointer transition-colors flex items-center justify-between text-xs"
                      onClick={() => addStandaloneProduct(p)}
                    >
                      <div>
                        <div className="font-semibold text-white">
                          {p.product_name} {p.variant_name ? `(${p.variant_name})` : ''}
                        </div>
                        <div className="text-[11px] text-[#527d78] font-mono">{p.sku}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[#38d4c5]">{formatCurrency(p.retail_price)}</div>
                        <div className="text-[10px] text-[#34d399]">Click to add</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Return Line Items Card */}
          <div className="bg-[#061e1c]/80 rounded-2xl border border-[#164e48] shadow-2xl overflow-hidden backdrop-blur-md">
            <div className="p-4 border-b border-[#164e48] bg-[#092925] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-[#38d4c5]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Return Items & Restock Allocation
                </h3>
              </div>

              {lines.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-lg bg-[#0e3b37] hover:bg-[#12423c] text-[#38d4c5] border border-[#164e48] transition-colors"
                    onClick={handleSetAllMax}
                  >
                    Set All Max
                  </button>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded-lg bg-[#0e3b37] hover:bg-[#12423c] text-[#a0c4c0] border border-[#164e48] transition-colors"
                    onClick={handleResetAllZero}
                  >
                    Reset to 0
                  </button>
                </div>
              )}
            </div>

            {lines.length === 0 ? (
              <div className="p-16 text-center text-[#7aa5a0]">
                <RotateCcw size={40} className="mx-auto mb-2 text-[#38d4c5] opacity-50" />
                <div className="font-semibold text-white">No return items added</div>
                <p className="text-xs mt-1">
                  {isLinked
                    ? 'Search and select an invoice above to view eligible items.'
                    : 'Search and add product variants above.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#092925]/60 text-xs font-semibold text-[#7aa5a0] uppercase border-b border-[#164e48]">
                    <tr>
                      <th className="px-4 py-3">Product / Variant</th>
                      {isLinked && <th className="px-4 py-3 text-center">Sold / Eligible</th>}
                      <th className="px-4 py-3 text-center">Return Qty</th>
                      <th className="px-4 py-3 text-right">Unit Rate</th>
                      <th className="px-4 py-3">Restock Condition</th>
                      <th className="px-4 py-3 text-right">Line Refund</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#113e3a]/60">
                    {lines.map((l) => (
                      <tr
                        key={l.key}
                        className={`transition-colors ${
                          l.return_quantity > 0 ? 'bg-[#0a2f2b]/40' : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-white text-xs">
                            {l.product_name} {l.variant_name ? `(${l.variant_name})` : ''}
                          </div>
                          <div className="text-[11px] text-[#527d78] font-mono">{l.sku}</div>
                        </td>

                        {isLinked && (
                          <td className="px-4 py-3.5 text-center text-xs whitespace-nowrap">
                            <span className="text-white font-medium">{l.sold_quantity} sold</span>
                            <span className="text-[#38d4c5] block text-[11px]">
                              {l.eligible_quantity} eligible
                            </span>
                          </td>
                        )}

                        <td className="px-4 py-3.5 text-center">
                          <div className="inline-flex items-center gap-1.5 bg-[#031413] border border-[#164e48] rounded-xl p-1">
                            <button
                              type="button"
                              className="p-1 rounded-lg text-[#a0c4c0] hover:text-white hover:bg-[#12423c] disabled:opacity-30"
                              disabled={l.return_quantity <= 0}
                              onClick={() => updateLineQty(l.key, -1)}
                            >
                              <Minus size={13} />
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={isLinked ? l.eligible_quantity : 9999}
                              className="w-12 bg-transparent text-center font-bold text-sm text-white focus:outline-none"
                              value={l.return_quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0
                                const max = isLinked ? l.eligible_quantity : 9999
                                const next = Math.max(0, Math.min(max, val))
                                setLines(lines.map((line) => (line.key === l.key ? { ...line, return_quantity: next } : line)))
                              }}
                            />
                            <button
                              type="button"
                              className="p-1 rounded-lg text-[#a0c4c0] hover:text-white hover:bg-[#12423c] disabled:opacity-30"
                              disabled={isLinked && l.return_quantity >= l.eligible_quantity}
                              onClick={() => updateLineQty(l.key, 1)}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-right text-xs text-[#a0c4c0] whitespace-nowrap">
                          {formatCurrency(l.unit_price)}
                        </td>

                        <td className="px-4 py-3.5">
                          <select
                            className="px-2.5 py-1.5 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
                            value={l.restock_condition}
                            onChange={(e) =>
                              setLines(
                                lines.map((line) =>
                                  line.key === l.key
                                    ? { ...line, restock_condition: e.target.value as any }
                                    : line
                                )
                              )
                            }
                          >
                            <option value="good">Good (Restock Shelf)</option>
                            <option value="damaged">Damaged (Quarantine)</option>
                            <option value="write_off">Write-Off (Scrap)</option>
                          </select>
                        </td>

                        <td className="px-4 py-3.5 text-right font-bold text-white text-xs whitespace-nowrap">
                          {formatCurrency(l.return_quantity * l.unit_price)}
                        </td>

                        <td className="px-4 py-3.5 text-center">
                          <button
                            type="button"
                            className="p-1.5 text-[#f87171] hover:text-white hover:bg-[#3b1119] rounded-lg transition-colors"
                            title="Remove Line"
                            onClick={() => setLines(lines.filter((line) => line.key !== l.key))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Return Parameters & Settlement Panel (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#061e1c]/80 p-5 rounded-2xl border border-[#164e48] shadow-2xl backdrop-blur-md space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-[#164e48] pb-3">
              <Coins size={16} className="text-[#38d4c5]" /> Settlement & Logistics
            </h3>

            {/* Warehouse & Location */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">
                  Destination Branch
                </label>
                <select
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">Warehouse</label>
                  <select
                    className="w-full px-2.5 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
                    value={effectiveWarehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                  >
                    {warehouses.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">Stock Location</label>
                  <select
                    className="w-full px-2.5 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
                    value={effectiveLocationId}
                    onChange={(e) => setLocationId(e.target.value)}
                  >
                    {locations.map((loc) => (
                      <option key={loc.value} value={loc.value}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">Return Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </div>
            </div>

            {/* Settlement Method Selector */}
            <div className="border-t border-[#164e48] pt-3 space-y-2">
              <label className="block text-xs font-semibold text-[#a0c4c0]">Settlement Method</label>

              <div className="grid grid-cols-1 gap-2">
                {[
                  {
                    id: 'customer_credit',
                    label: 'Customer Credit Note',
                    sub: 'Credit posted to receivables balance',
                    icon: CreditCard,
                  },
                  {
                    id: 'cash_refund',
                    label: 'Cash Refund',
                    sub: 'Cash disbursed from current register',
                    icon: Banknote,
                  },
                  {
                    id: 'bank_refund',
                    label: 'Bank / Card Reversal',
                    sub: 'Transferred via bank merchant account',
                    icon: Coins,
                  },
                ].map((s) => {
                  const Icon = s.icon
                  const active = settlementType === s.id
                  return (
                    <div
                      key={s.id}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        active
                          ? 'bg-[#0e3b37] border-[#38d4c5] shadow-md'
                          : 'bg-[#031413] border-[#164e48] hover:border-[#1e615a]'
                      }`}
                      onClick={() => setSettlementType(s.id as any)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`p-1.5 rounded-lg ${active ? 'bg-[#103e39] text-[#38d4c5]' : 'text-[#7aa5a0]'}`}>
                          <Icon size={16} />
                        </span>
                        <div>
                          <div className="text-xs font-bold text-white">{s.label}</div>
                          <div className="text-[11px] text-[#527d78]">{s.sub}</div>
                        </div>
                      </div>
                      <input
                        type="radio"
                        checked={active}
                        onChange={() => setSettlementType(s.id as any)}
                        className="text-[#38d4c5] focus:ring-[#38d4c5]"
                      />
                    </div>
                  )
                })}
              </div>

              {settlementType === 'bank_refund' && (
                <div className="pt-2">
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">
                    Debit Bank Account
                  </label>
                  <select
                    className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white focus:outline-none focus:border-[#38d4c5]"
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                  >
                    <option value="">Select Bank Account...</option>
                    {bankAccounts.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Quick Reason Chips & Reason input */}
            <div className="border-t border-[#164e48] pt-3 space-y-2">
              <label className="block text-xs font-semibold text-[#a0c4c0]">Return Reason</label>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REASONS.map((qr) => (
                  <button
                    key={qr}
                    type="button"
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      reason === qr
                        ? 'bg-[#103e39] text-[#38d4c5] border border-[#38d4c5]'
                        : 'bg-[#031413] text-[#7aa5a0] border border-[#164e48] hover:text-white'
                    }`}
                    onClick={() => setReason(qr)}
                  >
                    {qr}
                  </button>
                ))}
              </div>
              <input
                type="text"
                className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-[#527d78] focus:outline-none focus:border-[#38d4c5]"
                placeholder="Specific return reason or defect note..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">Internal Notes</label>
              <textarea
                rows={2}
                className="w-full px-3 py-2 bg-[#031413] border border-[#164e48] rounded-xl text-xs text-white placeholder-[#527d78] focus:outline-none focus:border-[#38d4c5]"
                placeholder="Optional audit trail note..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Financial Summary Box */}
            <div className="p-4 rounded-xl bg-[#031413] border border-[#164e48] space-y-2 text-xs">
              <div className="flex justify-between text-[#a0c4c0]">
                <span>Items Selected:</span>
                <span className="text-white font-semibold">{activeLines.length}</span>
              </div>
              <div className="flex justify-between text-[#a0c4c0]">
                <span>Total Units:</span>
                <span className="text-white font-semibold">{totalUnits} PCS</span>
              </div>
              <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-[#164e48]">
                <span>Total Refund:</span>
                <span className="text-[#f87171]">{formatCurrency(grandTotal)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                className="w-full py-3 bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white rounded-xl text-sm font-bold shadow-lg shadow-[#059669]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                disabled={saveMutation.isPending || activeLines.length === 0}
                onClick={() => saveMutation.mutate(true)}
              >
                {saveMutation.isPending ? (
                  <>
                    <RefreshCw className="animate-spin" size={16} /> Processing Return...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Post Return & Restock Now
                  </>
                )}
              </button>

              <button
                type="button"
                className="w-full py-2.5 bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] hover:text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                disabled={saveMutation.isPending || activeLines.length === 0}
                onClick={() => saveMutation.mutate(false)}
              >
                Save as Draft Return
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL: Completed Return Confirmation & Dual Print Voucher ────────── */}
      {completedReturn && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#082321] rounded-2xl shadow-2xl border border-[#164e48] max-w-2xl w-full max-h-[92vh] overflow-hidden text-white flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#164e48] bg-[#0c2e2a] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#092920] border border-[#059669] text-[#34d399] flex items-center justify-center">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Sales Return #{completedReturn.document_number}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#092920] text-[#34d399] border border-[#059669]/40">
                      {completedReturn.posted ? 'Posted & Restocked' : 'Draft Saved'}
                    </span>
                  </h3>
                  <p className="text-xs text-[#7aa5a0]">
                    Customer: {completedReturn.customer_name} • Refund: {formatCurrency(completedReturn.total_amount)}
                  </p>
                </div>
              </div>

              {/* Format Toggle */}
              <div className="inline-flex rounded-xl p-1 bg-[#031413] border border-[#164e48]">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    printFormat === 'thermal'
                      ? 'bg-[#103e39] text-[#38d4c5] shadow-sm'
                      : 'text-[#7aa5a0] hover:text-white'
                  }`}
                  onClick={() => setPrintFormat('thermal')}
                >
                  80mm Thermal
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    printFormat === 'a4'
                      ? 'bg-[#103e39] text-[#38d4c5] shadow-sm'
                      : 'text-[#7aa5a0] hover:text-white'
                  }`}
                  onClick={() => setPrintFormat('a4')}
                >
                  A4 Credit Note
                </button>
              </div>
            </div>

            {/* Preview Body */}
            <div className="p-6 overflow-y-auto max-h-[62vh] space-y-4 bg-[#031413]">
              {printFormat === 'thermal' && thermalData ? (
                <div className="flex justify-center bg-[#061e1c] p-4 rounded-xl border border-[#164e48]">
                  <ThermalReceiptDocket receipt={thermalData} />
                </div>
              ) : (
                /* ── A4 Commercial Credit Note Voucher ── */
                <div
                  id="sales-return-voucher-printable"
                  className="bg-white text-black p-8 rounded-xl shadow-lg border border-gray-300 font-sans text-xs"
                >
                  {/* Letterhead */}
                  <div className="flex justify-between items-start border-b-2 border-emerald-800 pb-4 mb-4">
                    <div>
                      <div className="text-xl font-black tracking-wider text-emerald-900 uppercase">
                        BABY BLOOM PVT LTD
                      </div>
                      <div className="text-[11px] text-gray-600 mt-0.5">
                        Premier Baby & Maternity Retail Specialists
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        No. 124, Galle Road, Colombo 03, Sri Lanka | Tel: +94 11 234 5678
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        VAT/TIN: 104829104-7000 | Co. Reg: PV-98421
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-900 font-bold text-xs uppercase tracking-widest rounded border border-emerald-300">
                        CREDIT NOTE / RETURN
                      </div>
                      <div className="text-sm font-black text-gray-900 mt-1.5 font-mono">
                        #{completedReturn.document_number}
                      </div>
                      <div className="text-[11px] text-gray-500">
                        Date: {new Date(completedReturn.date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 text-[11px]">
                    <div>
                      <div className="text-gray-500 uppercase text-[9px] font-bold">Customer Information</div>
                      <div className="font-bold text-gray-900 text-xs mt-0.5">{completedReturn.customer_name}</div>
                      <div className="text-gray-600 font-mono text-[10px]">
                        Code: {completedReturn.customer_code || 'CUST'} | Phone: {completedReturn.customer_phone || 'N/A'}
                      </div>
                      {completedReturn.invoice_number && (
                        <div className="text-emerald-700 font-bold mt-1 text-[10px]">
                          Original Invoice Ref: #{completedReturn.invoice_number}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500 uppercase text-[9px] font-bold">Logistics & Restock Hub</div>
                      <div className="font-semibold text-gray-800 text-[11px] mt-0.5">
                        {completedReturn.branch_name || 'Colombo Store'}
                      </div>
                      <div className="text-gray-600 text-[10px]">
                        {completedReturn.warehouse_name || 'Warehouse'} • {completedReturn.location_name || 'Floor'}
                      </div>
                      <div className="text-gray-700 font-medium text-[10px] mt-1">
                        Settlement: <span className="font-bold text-emerald-800">{settlementLabel(completedReturn.settlement_type)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-[10px] border-b border-gray-200">
                        <tr>
                          <th className="p-2 w-8 text-center">#</th>
                          <th className="p-2">Description</th>
                          <th className="p-2 text-center">Condition</th>
                          <th className="p-2 text-right">Unit Rate</th>
                          <th className="p-2 text-center">Qty Returned</th>
                          <th className="p-2 text-right">Refund Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {completedReturn.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="p-2 text-center font-mono text-gray-400">{idx + 1}</td>
                            <td className="p-2">
                              <div className="font-bold text-gray-900">{it.name}</div>
                              {it.variant && <div className="text-[10px] text-gray-500">{it.variant}</div>}
                              {it.sku && <div className="text-[9px] font-mono text-gray-400">{it.sku}</div>}
                            </td>
                            <td className="p-2 text-center">
                              <span className="capitalize px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-800 border border-gray-200">
                                {it.condition}
                              </span>
                            </td>
                            <td className="p-2 text-right font-mono text-gray-700">
                              {formatCurrency(it.unit_price)}
                            </td>
                            <td className="p-2 text-center font-bold text-gray-900">
                              {it.quantity} PCS
                            </td>
                            <td className="p-2 text-right font-bold text-gray-900 font-mono">
                              {formatCurrency(it.quantity * it.unit_price)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Box & Reason */}
                  <div className="grid grid-cols-2 gap-4 items-start mb-6">
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-[10px] space-y-1">
                      <div className="font-bold text-gray-700 uppercase text-[9px]">Return Authorization Note</div>
                      <div className="text-gray-800">
                        <span className="font-semibold">Reason:</span> {completedReturn.reason}
                      </div>
                      {completedReturn.notes && (
                        <div className="text-gray-600">
                          <span className="font-semibold">Notes:</span> {completedReturn.notes}
                        </div>
                      )}
                      <div className="text-gray-500 pt-1 text-[9px]">
                        Returned items verified and re-entered into inventory stock register.
                      </div>
                    </div>

                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-right space-y-1.5">
                      <div className="flex justify-between text-gray-600 text-[11px]">
                        <span>Total Items Returned:</span>
                        <span className="font-bold text-gray-900">{completedReturn.items.length} lines</span>
                      </div>
                      <div className="flex justify-between text-gray-600 text-[11px]">
                        <span>Total Units Restocked:</span>
                        <span className="font-bold text-gray-900">
                          {completedReturn.items.reduce((s, it) => s + it.quantity, 0)} PCS
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-emerald-950 pt-2 border-t border-emerald-200">
                        <span>Total Credit / Refund:</span>
                        <span className="font-mono">{formatCurrency(completedReturn.total_amount)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Signatures */}
                  <div className="grid grid-cols-2 gap-12 pt-6 border-t border-gray-200 text-[10px] text-gray-600">
                    <div>
                      <div className="h-10 border-b border-gray-300 border-dashed"></div>
                      <div className="mt-1 font-semibold text-gray-800">Customer Signature / Acknowledgment</div>
                      <div className="text-[9px] text-gray-400">Received refund / credit memo voucher</div>
                    </div>
                    <div className="text-right">
                      <div className="h-10 border-b border-gray-300 border-dashed"></div>
                      <div className="mt-1 font-semibold text-gray-800">Authorized Officer / Branch Manager</div>
                      <div className="text-[9px] text-gray-400">Baby Bloom (Pvt) Ltd Restock Control</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-[#164e48] bg-[#0c2e2a] flex items-center justify-between gap-3">
              <button
                type="button"
                className="px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white flex items-center gap-2 shadow-md shadow-[#059669]/20 transition-all active:scale-[0.98]"
                onClick={() => window.print()}
              >
                <Printer size={15} /> Print {printFormat === 'thermal' ? 'Thermal Receipt' : 'A4 Voucher'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#0e3b37] hover:bg-[#12423c] text-[#38d4c5] border border-[#164e48] transition-colors"
                  onClick={() => {
                    setCompletedReturn(null)
                    setSelectedInvoice(null)
                    setLines([])
                  }}
                >
                  Process Another Return
                </button>

                <button
                  type="button"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#082321] hover:bg-[#12423c] border border-[#164e48] text-white transition-colors"
                  onClick={() => navigate('/sales/returns')}
                >
                  View Returns Register
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
