import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  RotateCcw,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  Send,
  ShieldCheck,
  CheckCircle2,
  Printer,
  FileText,
  X,
  ShoppingBag,
  ArrowRight,
  BookOpen,
  Layers,
  Minus,
} from 'lucide-react'
import { permissions } from '../config/permissions'
import { colomboNow, formatBusinessDate } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import { listLookup } from '../services/masterData'
import {
  createReturnDraft,
  createAndPostPurchaseReturn,
  listPurchaseProducts,
  listPurchases,
  listReturns,
  returnAction,
  returnEligibility,
  fetchPurchaseReturnDetails,
} from '../services/purchasing'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import type { PurchaseReturnRow } from '../types/purchasing'

interface ReturnLine {
  key: string
  original_purchase_item_id: string
  product_variant_id: string
  product_code: string
  product_name: string
  variant_name?: string
  sku?: string
  quantity: number
  max_quantity?: number
  unit_cost: number
  batch_reference: string
  reason: string
  condition: string
}

const money = (n: number | null | undefined) =>
  `Rs. ${Number(n ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const QUICK_REASONS = [
  'Defective / Damaged Goods',
  'Quality / Specification Reject',
  'Short Delivery / Wrong Item',
  'Expired / Near Expiry',
  'Excess Stock Return',
  'Supplier Price Discrepancy',
]

const CONDITIONS = [
  { value: 'good', label: 'Good (Resellable Stock)' },
  { value: 'damaged', label: 'Damaged (Vendor Scrap)' },
  { value: 'expired', label: 'Expired (Bio / Disposal)' },
  { value: 'other', label: 'Other' },
]

export function PurchaseReturnsPage() {
  const queryClient = useQueryClient()
  const allowed = useAuthStore((s) => s.user?.permissions) ?? []
  const userBranchId = useBranchStore((s) => s.branchId) ?? ''

  // Permissions
  const canCreate = allowed.includes(permissions.purchaseReturnsCreate)
  const canSubmit = allowed.includes(permissions.purchaseReturnsSubmit)
  const canApprove = allowed.includes(permissions.purchaseReturnsApprove)
  const canPost = allowed.includes(permissions.purchaseReturnsPost)
  const canReverse = allowed.includes(permissions.purchaseReturnsReverse)
  const canUnlinked = allowed.includes(permissions.purchaseReturnsUnlinked)

  // Active Main Tab
  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'eligible'>('create')

  // Notification Toast
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4500)
  }

  // ── Form State: Linked vs Unlinked ──────────────────────────────────────────
  const [isLinked, setIsLinked] = useState<boolean>(true)
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>('')
  const [vendorId, setVendorId] = useState<string>('')
  const [branchId, setBranchId] = useState<string>(userBranchId || '')
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [stockLocationId, setStockLocationId] = useState<string>('')
  const [returnDate, setReturnDate] = useState<string>(colomboNow().format('YYYY-MM-DD'))
  const [settlementType, setSettlementType] = useState<'reduce_payable' | 'supplier_credit' | 'supplier_refund'>('reduce_payable')
  const [returnReason, setReturnReason] = useState<string>('Defective / Damaged Goods')
  const [notes, setNotes] = useState<string>('')

  // Item lines state
  const [lines, setLines] = useState<ReturnLine[]>([])

  // Item Picker State (For Adding a line)
  const [selectedEligibleItemId, setSelectedEligibleItemId] = useState<string>('')
  const [selectedUnlinkedVariantId, setSelectedUnlinkedVariantId] = useState<string>('')
  const [unlinkedSearch, setUnlinkedSearch] = useState<string>('')
  const [itemQty, setItemQty] = useState<number>(1)
  const [itemCost, setItemCost] = useState<number>(0)
  const [itemCondition, setItemCondition] = useState<string>('good')
  const [itemRemarks, setItemRemarks] = useState<string>('')

  // ── History Tab Filters ─────────────────────────────────────────────────────
  const [historySearch, setHistorySearch] = useState<string>('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all')
  const [historyBranchFilter, setHistoryBranchFilter] = useState<string>('')
  const [historyPage, setHistoryPage] = useState<number>(1)
  const historyPageSize = 15

  // ── Details / Voucher Modal ─────────────────────────────────────────────────
  const [viewingReturnId, setViewingReturnId] = useState<string | null>(null)

  // ── Lookups ─────────────────────────────────────────────────────────────────
  const { data: branches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
  })

  const effectiveBranchId = branchId || branches[0]?.value || ''

  const { data: warehouses = [] } = useQuery({
    queryKey: ['lookup', 'warehouses', effectiveBranchId],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: effectiveBranchId, is_active: true }),
    enabled: !!effectiveBranchId,
  })

  const effectiveWarehouseId = warehouseId || warehouses[0]?.value || ''

  const { data: locations = [] } = useQuery({
    queryKey: ['lookup', 'locations', effectiveWarehouseId],
    queryFn: () => listLookup('stock_locations', 'name', { warehouse_id: effectiveWarehouseId, is_active: true }),
    enabled: !!effectiveWarehouseId,
  })

  const effectiveStockLocationId = stockLocationId || locations[0]?.value || ''

  const { data: vendors = [] } = useQuery({
    queryKey: ['lookup', 'vendors'],
    queryFn: () => listLookup('vendors', 'name', { status: 'active' }),
  })

  // Posted Purchases for Linked Return
  const { data: postedPurchasesData, isLoading: loadingPurchases, refetch: refetchPurchases } = useQuery({
    queryKey: ['purchases-posted-return'],
    queryFn: () => listPurchases({ status: 'posted', pageSize: 100 }),
    enabled: canCreate,
  })

  const postedPurchases = postedPurchasesData?.rows ?? []

  // Eligible lines for selected purchase
  const { data: eligibleItems = [], isLoading: loadingEligibility } = useQuery({
    queryKey: ['return-eligibility', selectedPurchaseId],
    queryFn: () => returnEligibility(selectedPurchaseId),
    enabled: isLinked && !!selectedPurchaseId && canCreate,
  })

  // Product variants for unlinked return
  const { data: unlinkedProducts = [] } = useQuery({
    queryKey: ['purchase-products', unlinkedSearch, effectiveStockLocationId],
    queryFn: () => listPurchaseProducts(unlinkedSearch, effectiveStockLocationId || undefined),
    enabled: !isLinked && canUnlinked && canCreate,
  })

  // Returns History List
  const { data: returnsData, isLoading: loadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['purchase-returns-list', historySearch, historyStatusFilter, historyBranchFilter, historyPage],
    queryFn: () =>
      listReturns({
        search: historySearch || undefined,
        status: historyStatusFilter,
        branchId: historyBranchFilter || undefined,
        page: historyPage,
        pageSize: historyPageSize,
      }),
  })

  const returnRows = returnsData?.rows ?? []
  const totalReturnsCount = returnsData?.count ?? 0
  const totalHistoryPages = Math.max(1, Math.ceil(totalReturnsCount / historyPageSize))

  // Detailed Return for Voucher Modal
  const { data: viewingReturnDetails, isLoading: loadingReturnDetails } = useQuery({
    queryKey: ['purchase-return-details', viewingReturnId],
    queryFn: () => (viewingReturnId ? fetchPurchaseReturnDetails(viewingReturnId) : null),
    enabled: !!viewingReturnId,
  })

  // Handle choosing a linked purchase
  const handleSelectPurchase = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId)
    setLines([])
    setSelectedEligibleItemId('')

    const p = postedPurchases.find((x) => x.id === purchaseId)
    if (p) {
      setVendorId(p.vendor_id)
      setBranchId(p.branch_id)
      setWarehouseId(p.warehouse_id)
      setStockLocationId(p.stock_location_id)
    }
  }

  // Add Item Line to Return Cart
  const handleAddLine = () => {
    if (itemQty <= 0) {
      notify('Please enter a valid quantity greater than 0.', true)
      return
    }

    if (isLinked) {
      const eligible = eligibleItems.find((x) => x.original_purchase_item_id === selectedEligibleItemId)
      if (!eligible) {
        notify('Please select an eligible purchase item to return.', true)
        return
      }
      if (itemQty > eligible.eligible_quantity) {
        notify(`Quantity cannot exceed eligible balance (${eligible.eligible_quantity}).`, true)
        return
      }
      if (lines.some((l) => l.original_purchase_item_id === eligible.original_purchase_item_id)) {
        notify('This purchase item is already added to the return list.', true)
        return
      }

      setLines((prev) => [
        ...prev,
        {
          key: crypto.randomUUID(),
          original_purchase_item_id: eligible.original_purchase_item_id,
          product_variant_id: eligible.product_variant_id,
          product_code: eligible.product_code,
          product_name: eligible.product_name,
          variant_name: eligible.variant_name,
          sku: eligible.sku,
          quantity: itemQty,
          max_quantity: eligible.eligible_quantity,
          unit_cost: Number(eligible.historical_unit_cost ?? 0),
          batch_reference: eligible.batch_reference ?? '',
          reason: itemRemarks.trim() || returnReason,
          condition: itemCondition,
        },
      ])
      setSelectedEligibleItemId('')
      setItemQty(1)
      setItemRemarks('')
    } else {
      const prod = unlinkedProducts.find((p) => p.product_variant_id === selectedUnlinkedVariantId)
      if (!prod) {
        notify('Please select a product variant to return.', true)
        return
      }
      if (itemCost <= 0) {
        notify('Please enter an authorized historical landed unit cost.', true)
        return
      }
      if (lines.some((l) => l.product_variant_id === prod.product_variant_id)) {
        notify('This product variant is already in the return list.', true)
        return
      }

      setLines((prev) => [
        ...prev,
        {
          key: crypto.randomUUID(),
          original_purchase_item_id: '',
          product_variant_id: prod.product_variant_id,
          product_code: prod.product_code,
          product_name: prod.product_name,
          variant_name: prod.variant_name,
          sku: prod.sku,
          quantity: itemQty,
          unit_cost: itemCost,
          batch_reference: '',
          reason: itemRemarks.trim() || returnReason,
          condition: itemCondition,
        },
      ])
      setSelectedUnlinkedVariantId('')
      setItemQty(1)
      setItemCost(0)
      setItemRemarks('')
    }
  }

  // Remove Line from Cart
  const handleRemoveLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  // Update Line Quantity
  const handleUpdateQty = (key: string, newQty: number) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        const clamped = Math.max(1, l.max_quantity ? Math.min(l.max_quantity, newQty) : newQty)
        return { ...l, quantity: clamped }
      })
    )
  }

  // Totals
  const totalReturnUnits = useMemo(() => lines.reduce((acc, l) => acc + l.quantity, 0), [lines])
  const totalReturnValue = useMemo(
    () => lines.reduce((acc, l) => acc + l.quantity * l.unit_cost, 0),
    [lines]
  )

  // ── Mutations ───────────────────────────────────────────────────────────────
  // Save as Draft
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const finalBranchId = effectiveBranchId
      const finalWarehouseId = effectiveWarehouseId
      const finalStockLocationId = effectiveStockLocationId

      if (!vendorId) throw new Error('Please select a supplier / vendor.')
      if (!finalBranchId) throw new Error('Please select an outlet branch.')
      if (!finalWarehouseId) throw new Error('Please select a warehouse.')
      if (!finalStockLocationId) throw new Error('Please select a stock location.')
      if (!returnReason.trim()) throw new Error('Please provide a reason for the return.')
      if (!lines.length) throw new Error('Please add at least one item to the return.')

      const header = {
        branch_id: finalBranchId,
        warehouse_id: finalWarehouseId,
        stock_location_id: finalStockLocationId,
        purchase_id: isLinked ? selectedPurchaseId : null,
        vendor_id: vendorId,
        return_date: returnDate,
        settlement_type: settlementType,
        reason: returnReason.trim(),
        notes: notes.trim() || null,
      }

      const items = lines.map((l) => ({
        original_purchase_item_id: l.original_purchase_item_id || null,
        product_variant_id: l.product_variant_id,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
        discount_amount: 0,
        tax_amount: 0,
        batch_reference: l.batch_reference || null,
        reason: l.reason,
        condition: l.condition,
      }))

      return createReturnDraft(header, items)
    },
    onSuccess: (res) => {
      notify(`Return document ${res.document_number} saved as DRAFT successfully!`)
      setLines([])
      setNotes('')
      queryClient.invalidateQueries({ queryKey: ['purchase-returns-list'] })
      queryClient.invalidateQueries({ queryKey: ['return-eligibility'] })
      setActiveTab('history')
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  // Approve & Post Immediately
  const postReturnMutation = useMutation({
    mutationFn: async () => {
      const finalBranchId = effectiveBranchId
      const finalWarehouseId = effectiveWarehouseId
      const finalStockLocationId = effectiveStockLocationId

      if (!vendorId) throw new Error('Please select a supplier / vendor.')
      if (!finalBranchId) throw new Error('Please select an outlet branch.')
      if (!finalWarehouseId) throw new Error('Please select a warehouse.')
      if (!finalStockLocationId) throw new Error('Please select a stock location.')
      if (!returnReason.trim()) throw new Error('Please provide a reason for the return.')
      if (!lines.length) throw new Error('Please add at least one item to the return.')

      const header = {
        branch_id: finalBranchId,
        warehouse_id: finalWarehouseId,
        stock_location_id: finalStockLocationId,
        purchase_id: isLinked ? selectedPurchaseId : null,
        vendor_id: vendorId,
        return_date: returnDate,
        settlement_type: settlementType,
        reason: returnReason.trim(),
        notes: notes.trim() || null,
      }

      const items = lines.map((l) => ({
        original_purchase_item_id: l.original_purchase_item_id || null,
        product_variant_id: l.product_variant_id,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
        discount_amount: 0,
        tax_amount: 0,
        batch_reference: l.batch_reference || null,
        reason: l.reason,
        condition: l.condition,
      }))

      return createAndPostPurchaseReturn(header, items)
    },
    onSuccess: (res) => {
      notify(
        `Purchase Return ${res.document_number} POSTED! Inventory deducted and supplier ledger updated.`
      )
      setLines([])
      setNotes('')
      queryClient.invalidateQueries({ queryKey: ['purchase-returns-list'] })
      queryClient.invalidateQueries({ queryKey: ['return-eligibility'] })
      queryClient.invalidateQueries({ queryKey: ['purchases-posted-return'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-balance'] })
      queryClient.invalidateQueries({ queryKey: ['current-stock'] })
      setViewingReturnId(res.id)
      setActiveTab('history')
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  // Workflow Actions from History (Submit, Approve, Post, Reverse)
  const workflowMutation = useMutation({
    mutationFn: async ({
      action,
      row,
    }: {
      action: 'submit' | 'approve' | 'post' | 'reverse'
      row: PurchaseReturnRow
    }) => {
      let why = ''
      if (action === 'reverse') {
        const input = window.prompt(
          `Provide reason for reversing Purchase Return ${row.return_number}:`
        )
        if (!input || !input.trim()) throw new Error('A reversal audit reason is required.')
        why = input.trim()
      }
      return returnAction(action, row.id, why)
    },
    onSuccess: (res) => {
      notify(`Return ${res.document_number} status updated to: ${res.status.toUpperCase()}`)
      queryClient.invalidateQueries({ queryKey: ['purchase-returns-list'] })
      queryClient.invalidateQueries({ queryKey: ['return-eligibility'] })
      queryClient.invalidateQueries({ queryKey: ['current-stock'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-balance'] })
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  // Quick initiate from Tab 3 (Eligible Purchases)
  const handleInitiateReturnForPurchase = (p: typeof postedPurchases[0]) => {
    setIsLinked(true)
    handleSelectPurchase(p.id)
    setActiveTab('create')
    notify(`Loaded purchase ${p.purchase_number}. Add returnable items below.`)
  }

  // KPI Calculations
  const totalValueSum = useMemo(
    () => returnRows.reduce((sum, r) => sum + Number(r.grand_total || 0), 0),
    [returnRows]
  )
  const postedCount = useMemo(
    () => returnRows.filter((r) => r.status === 'posted').length,
    [returnRows]
  )
  const draftSubmittedCount = useMemo(
    () => returnRows.filter((r) => r.status === 'draft' || r.status === 'submitted').length,
    [returnRows]
  )

  return (
    <div
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
        minHeight: 'calc(100vh - 80px)',
        color: '#e2e8f0',
        padding: '20px 24px',
        borderRadius: '8px',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 800,
              letterSpacing: '-0.01em',
              color: '#ffffff',
            }}
          >
            Purchase Returns & Supplier Credits
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Atomic landed-cost inventory reversals, debit note generation, and supplier ledger reconciliation.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => {
              refetchHistory()
              refetchPurchases()
            }}
            title="Refresh returns"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              color: '#94a3b8',
              borderRadius: '4px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <RefreshCw
              size={15}
              className={loadingHistory || loadingPurchases ? 'animate-spin' : ''}
              color="#38d4c5"
            />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('create')}
            style={{
              backgroundColor: '#00b4d8',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 22px',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
          >
            + NEW RETURN
          </button>
        </div>
      </div>

      {/* ── Navigation Tabs ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid #144743',
          paddingBottom: '12px',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeTab === 'create' ? '1px solid #38d4c5' : '1px solid transparent',
            backgroundColor: activeTab === 'create' ? '#0b3531' : '#041c19',
            color: activeTab === 'create' ? '#38d4c5' : '#94a3b8',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <RotateCcw size={16} />
          <span>New Return Entry</span>
          {lines.length > 0 && (
            <span
              style={{
                backgroundColor: '#00b4d8',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 800,
              }}
            >
              {lines.length} {lines.length === 1 ? 'line' : 'lines'}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeTab === 'history' ? '1px solid #38d4c5' : '1px solid transparent',
            backgroundColor: activeTab === 'history' ? '#0b3531' : '#041c19',
            color: activeTab === 'history' ? '#38d4c5' : '#94a3b8',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <FileText size={16} />
          <span>Return History & Audit</span>
          <span
            style={{
              backgroundColor: '#144743',
              color: '#ffffff',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '11px',
            }}
          >
            {totalReturnsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('eligible')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeTab === 'eligible' ? '1px solid #38d4c5' : '1px solid transparent',
            backgroundColor: activeTab === 'eligible' ? '#0b3531' : '#041c19',
            color: activeTab === 'eligible' ? '#38d4c5' : '#94a3b8',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <ShoppingBag size={16} />
          <span>Eligible Posted Purchases</span>
          <span
            style={{
              backgroundColor: '#144743',
              color: '#ffffff',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '11px',
            }}
          >
            {postedPurchases.length}
          </span>
        </button>
      </div>

      {/* ── KPI Metric Cards ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '6px',
            padding: '14px 18px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>
            TOTAL RETURN DOCUMENTS
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
            {totalReturnsCount}
          </div>
          <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
            {postedCount} Posted to stock & AP
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '6px',
            padding: '14px 18px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>
            TOTAL RETURNED VALUE
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#38d4c5', marginTop: '4px' }}>
            {money(totalValueSum)}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Cumulative vendor credit value
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '6px',
            padding: '14px 18px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.05em' }}>
            PENDING REVIEW / DRAFTS
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
            {draftSubmittedCount}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Awaiting supervisor approval
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#041c19',
            border: '1px solid #144743',
            borderRadius: '6px',
            padding: '14px 18px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#00d2ff', letterSpacing: '0.05em' }}>
            ELIGIBLE PURCHASES
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#00d2ff', marginTop: '4px' }}>
            {postedPurchases.length}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Available for verified return
          </div>
        </div>
      </div>

      {/* ── Toast Banner ────────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            backgroundColor: toast.isError ? '#7f1d1d' : '#064e3b',
            border: `1px solid ${toast.isError ? '#ef4444' : '#10b981'}`,
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: NEW RETURN ENTRY WORKSPACE                                       */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'create' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Mode Switcher */}
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '6px',
              padding: '12px 18px',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>RETURN MODE:</span>
              <button
                type="button"
                onClick={() => {
                  setIsLinked(true)
                  setLines([])
                }}
                style={{
                  backgroundColor: isLinked ? '#00b4d8' : '#0c2e2a',
                  color: isLinked ? '#ffffff' : '#94a3b8',
                  border: isLinked ? 'none' : '1px solid #164e48',
                  borderRadius: '4px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Linked to Posted Purchase
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!canUnlinked) {
                    notify('You do not have permission for unlinked purchase returns.', true)
                    return
                  }
                  setIsLinked(false)
                  setSelectedPurchaseId('')
                  setLines([])
                }}
                style={{
                  backgroundColor: !isLinked ? '#00b4d8' : '#0c2e2a',
                  color: !isLinked ? '#ffffff' : '#94a3b8',
                  border: !isLinked ? 'none' : '1px solid #164e48',
                  borderRadius: '4px',
                  padding: '7px 16px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  opacity: canUnlinked ? 1 : 0.5,
                }}
                title={canUnlinked ? '' : 'Requires purchase_returns.unlinked permission'}
              >
                Direct / Standalone Return
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#38d4c5', fontWeight: 600 }}>
              {isLinked
                ? 'Original landed costs and eligible quantities strictly locked against purchase records.'
                : 'Direct return authorizes custom variant return with inventory ledger adjustment.'}
            </div>
          </div>

          {/* Form Header Box */}
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '6px',
              padding: '20px',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '14px',
                fontWeight: 800,
                color: '#38d4c5',
                letterSpacing: '0.05em',
              }}
            >
              HEADER & DESTINATION SPECIFICATIONS
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px',
              }}
            >
              {/* Linked Purchase Selector */}
              {isLinked && (
                <div style={{ gridColumn: 'span 2' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#94a3b8',
                      marginBottom: '6px',
                    }}
                  >
                    SELECT POSTED PURCHASE DOCUMENT *
                  </label>
                  <select
                    value={selectedPurchaseId}
                    onChange={(e) => handleSelectPurchase(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    }}
                  >
                    <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                      -- Select Posted Purchase Document ({postedPurchases.length} available) --
                    </option>
                    {postedPurchases.map((p) => (
                      <option
                        key={p.id}
                        value={p.id}
                        style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                      >
                        {p.purchase_number} | {p.vendor_name} | {money(p.grand_total)} | Date:{' '}
                        {formatBusinessDate(p.purchase_date)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Supplier Dropdown (Auto-filled if linked, selectable if unlinked) */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#94a3b8',
                    marginBottom: '6px',
                  }}
                >
                  SUPPLIER / VENDOR *
                </label>
                <select
                  disabled={isLinked}
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    cursor: isLinked ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    opacity: isLinked ? 0.75 : 1,
                  }}
                >
                  <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                    -- Select Supplier --
                  </option>
                  {vendors.map((v) => (
                    <option
                      key={v.value}
                      value={v.value}
                      style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                    >
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Outlet Branch */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#94a3b8',
                    marginBottom: '6px',
                  }}
                >
                  STORE OUTLET BRANCH *
                </label>
                <select
                  disabled={isLinked}
                  value={effectiveBranchId}
                  onChange={(e) => {
                    setBranchId(e.target.value)
                    setWarehouseId('')
                    setStockLocationId('')
                  }}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    cursor: isLinked ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    opacity: isLinked ? 0.75 : 1,
                  }}
                >
                  {branches.map((b) => (
                    <option
                      key={b.value}
                      value={b.value}
                      style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                    >
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Warehouse */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#94a3b8',
                    marginBottom: '6px',
                  }}
                >
                  WAREHOUSE *
                </label>
                <select
                  disabled={isLinked}
                  value={effectiveWarehouseId}
                  onChange={(e) => {
                    setWarehouseId(e.target.value)
                    setStockLocationId('')
                  }}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    cursor: isLinked ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    opacity: isLinked ? 0.75 : 1,
                  }}
                >
                  {warehouses.map((w) => (
                    <option
                      key={w.value}
                      value={w.value}
                      style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                    >
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Stock Location */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#94a3b8',
                    marginBottom: '6px',
                  }}
                >
                  SOURCE STOCK LOCATION *
                </label>
                <select
                  disabled={isLinked}
                  value={effectiveStockLocationId}
                  onChange={(e) => setStockLocationId(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    cursor: isLinked ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    opacity: isLinked ? 0.75 : 1,
                  }}
                >
                  {locations.map((l) => (
                    <option
                      key={l.value}
                      value={l.value}
                      style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                    >
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Return Date */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#94a3b8',
                    marginBottom: '6px',
                  }}
                >
                  RETURN DATE *
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '8px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Settlement Type */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#94a3b8',
                    marginBottom: '6px',
                  }}
                >
                  SETTLEMENT DESTINATION *
                </label>
                <select
                  value={settlementType}
                  onChange={(e) => setSettlementType(e.target.value as any)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                  }}
                >
                  <option
                    value="reduce_payable"
                    style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                  >
                    Reduce Vendor Balance / AP
                  </option>
                  <option
                    value="supplier_credit"
                    style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                  >
                    Issue Supplier Credit Note
                  </option>
                  <option
                    value="supplier_refund"
                    style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                  >
                    Direct Supplier Cash/Bank Refund
                  </option>
                </select>
              </div>

              {/* Primary Return Reason */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#94a3b8',
                    marginBottom: '6px',
                  }}
                >
                  RETURN REASON *
                </label>
                <input
                  type="text"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="e.g. Defective items upon inspection"
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '8px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Quick Reason Chips */}
              <div style={{ gridColumn: 'span 2' }}>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#64748b',
                    letterSpacing: '0.05em',
                  }}
                >
                  QUICK REASONS:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {QUICK_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReturnReason(r)}
                      style={{
                        backgroundColor: returnReason === r ? '#00b4d8' : '#031413',
                        color: returnReason === r ? '#ffffff' : '#94a3b8',
                        border: '1px solid #144743',
                        borderRadius: '12px',
                        padding: '3px 10px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Item Selection Panel */}
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '6px',
              padding: '20px',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '14px',
                fontWeight: 800,
                color: '#38d4c5',
                letterSpacing: '0.05em',
              }}
            >
              ADD MERCHANDISE ITEMS TO RETURN
            </h3>

            {isLinked ? (
              /* Linked: Pick from eligible original items */
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px',
                  alignItems: 'flex-end',
                }}
              >
                <div style={{ gridColumn: 'span 2' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#94a3b8',
                      marginBottom: '6px',
                    }}
                  >
                    ELIGIBLE PURCHASED ITEM LINE *
                  </label>
                  <select
                    value={selectedEligibleItemId}
                    onChange={(e) => {
                      setSelectedEligibleItemId(e.target.value)
                      const item = eligibleItems.find(
                        (x) => x.original_purchase_item_id === e.target.value
                      )
                      if (item) setItemCost(Number(item.historical_unit_cost ?? 0))
                    }}
                    style={{
                      width: '100%',
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    }}
                  >
                    <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                      {!selectedPurchaseId
                        ? '-- Please select a purchase document first above --'
                        : loadingEligibility
                        ? 'Loading returnable items...'
                        : eligibleItems.length === 0
                        ? 'No returnable items remain on this purchase'
                        : `-- Select Purchased Item (${eligibleItems.length} lines available) --`}
                    </option>
                    {eligibleItems.map((item) => (
                      <option
                        key={item.original_purchase_item_id}
                        value={item.original_purchase_item_id}
                        style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                      >
                        [{item.product_code}] {item.product_name} | Eligible:{' '}
                        {item.eligible_quantity} | Landed Cost: {money(item.historical_unit_cost)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#94a3b8',
                      marginBottom: '6px',
                    }}
                  >
                    RETURN QUANTITY
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={itemQty}
                    onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{
                      width: '100%',
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#94a3b8',
                      marginBottom: '6px',
                    }}
                  >
                    STOCK CONDITION
                  </label>
                  <select
                    value={itemCondition}
                    onChange={(e) => setItemCondition(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    }}
                  >
                    {CONDITIONS.map((c) => (
                      <option
                        key={c.value}
                        value={c.value}
                        style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                      >
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    disabled={!selectedEligibleItemId}
                    style={{
                      width: '100%',
                      backgroundColor: '#00b4d8',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '10px 16px',
                      fontSize: '12px',
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                      cursor: !selectedEligibleItemId ? 'not-allowed' : 'pointer',
                      boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                      opacity: !selectedEligibleItemId ? 0.5 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    + ADD LINE
                  </button>
                </div>
              </div>
            ) : (
              /* Unlinked: Search variant & enter authorized cost */
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px',
                  alignItems: 'flex-end',
                }}
              >
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#94a3b8',
                      }}
                    >
                      SEARCH & SELECT PRODUCT VARIANT *
                    </label>
                    <input
                      type="text"
                      placeholder="Filter product by code, name, barcode..."
                      value={unlinkedSearch}
                      onChange={(e) => setUnlinkedSearch(e.target.value)}
                      style={{
                        backgroundColor: '#0c2e2a',
                        border: '1px solid #164e48',
                        color: '#ffffff',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        outline: 'none',
                        width: '240px',
                      }}
                    />
                  </div>
                  <select
                    value={selectedUnlinkedVariantId}
                    onChange={(e) => {
                      setSelectedUnlinkedVariantId(e.target.value)
                      const prod = unlinkedProducts.find(
                        (p) => p.product_variant_id === e.target.value
                      )
                      if (prod) setItemCost(Number(prod.last_purchase_cost || prod.retail_price || 0))
                    }}
                    style={{
                      width: '100%',
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                    }}
                  >
                    <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                      -- Select product variant ({unlinkedProducts.length} loaded) --
                    </option>
                    {unlinkedProducts.map((p) => (
                      <option
                        key={p.product_variant_id}
                        value={p.product_variant_id}
                        style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                      >
                        [{p.product_code}] {p.product_name} {p.variant_name ? `(${p.variant_name})` : ''}{' '}
                        | Last Cost: {money(p.last_purchase_cost)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#94a3b8',
                      marginBottom: '6px',
                    }}
                  >
                    RETURN QUANTITY
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={itemQty}
                    onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{
                      width: '100%',
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#94a3b8',
                      marginBottom: '6px',
                    }}
                  >
                    HISTORICAL UNIT COST (RS.) *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={itemCost}
                    onChange={(e) => setItemCost(Math.max(0, parseFloat(e.target.value) || 0))}
                    style={{
                      width: '100%',
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    disabled={!selectedUnlinkedVariantId || itemCost <= 0}
                    style={{
                      width: '100%',
                      backgroundColor: '#00b4d8',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '10px 16px',
                      fontSize: '12px',
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                      cursor: !selectedUnlinkedVariantId || itemCost <= 0 ? 'not-allowed' : 'pointer',
                      boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                      opacity: !selectedUnlinkedVariantId || itemCost <= 0 ? 0.5 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    + ADD LINE
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Return Cart Table */}
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '6px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #144743',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#031413',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} color="#38d4c5" />
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff' }}>
                  RETURN MERCHANDISE MANIFEST ({lines.length} {lines.length === 1 ? 'item' : 'items'})
                </span>
              </div>
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLines([])}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Clear All Lines
                </button>
              )}
            </div>

            <table
              style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: '#031413',
                    borderBottom: '1px solid #144743',
                    color: '#38d4c5',
                    fontWeight: 800,
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                  }}
                >
                  <th style={{ padding: '12px 14px', width: '130px' }}>CODE</th>
                  <th style={{ padding: '12px 14px' }}>PRODUCT & SPECIFICATION</th>
                  <th style={{ padding: '12px 14px', width: '120px' }}>CONDITION</th>
                  <th style={{ padding: '12px 14px', width: '150px', textAlign: 'center' }}>
                    RETURN QTY
                  </th>
                  <th style={{ padding: '12px 14px', width: '130px', textAlign: 'right' }}>
                    LANDED COST
                  </th>
                  <th style={{ padding: '12px 14px', width: '140px', textAlign: 'right' }}>
                    SUBTOTAL
                  </th>
                  <th style={{ padding: '12px 14px', width: '70px', textAlign: 'center' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: '40px',
                        textAlign: 'center',
                        color: '#94a3b8',
                        fontSize: '13px',
                      }}
                    >
                      No items added to return yet. Select items from the panel above.
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr
                      key={line.key}
                      style={{ borderBottom: '1px solid #0d3834' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#072723')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            color: '#38d4c5',
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                          }}
                        >
                          {line.product_code}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#ffffff' }}>{line.product_name}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                          {line.variant_name ? `Variant: ${line.variant_name} ` : ''}
                          {line.batch_reference ? `| Batch: ${line.batch_reference} ` : ''}
                          {line.reason ? `| ${line.reason}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: line.condition === 'good' ? '#064e3b' : '#7f1d1d',
                            color: line.condition === 'good' ? '#34d399' : '#fca5a5',
                          }}
                        >
                          {CONDITIONS.find((c) => c.value === line.condition)?.label || line.condition}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            borderRadius: '4px',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(line.key, line.quantity - 1)}
                            style={{
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              padding: '4px 8px',
                              cursor: 'pointer',
                            }}
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={line.max_quantity}
                            value={line.quantity}
                            onChange={(e) =>
                              handleUpdateQty(line.key, parseInt(e.target.value, 10) || 1)
                            }
                            style={{
                              width: '45px',
                              textAlign: 'center',
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#ffffff',
                              fontWeight: 800,
                              fontSize: '12px',
                              outline: 'none',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(line.key, line.quantity + 1)}
                            style={{
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              padding: '4px 8px',
                              cursor: 'pointer',
                            }}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>
                        {money(line.unit_cost)}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          textAlign: 'right',
                          fontWeight: 800,
                          color: '#38d4c5',
                        }}
                      >
                        {money(line.quantity * line.unit_cost)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.key)}
                          title="Remove Line"
                          style={{
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            color: '#ef4444',
                            padding: '5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Bottom Actions Bar */}
            <div
              style={{
                padding: '16px 20px',
                borderTop: '1px solid #144743',
                backgroundColor: '#031413',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>TOTAL UNITS:</span>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                    {totalReturnUnits} items
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>SETTLEMENT:</span>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#38d4c5' }}>
                    {settlementType === 'reduce_payable'
                      ? 'Reduce AP Payable'
                      : settlementType === 'supplier_credit'
                      ? 'Supplier Credit Note'
                      : 'Cash/Bank Refund'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>GRAND TOTAL VALUE:</span>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#38d4c5' }}>
                    {money(totalReturnValue)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  disabled={saveDraftMutation.isPending || !lines.length}
                  onClick={() => saveDraftMutation.mutate()}
                  style={{
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    color: '#e2e8f0',
                    borderRadius: '4px',
                    padding: '9px 18px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: !lines.length ? 'not-allowed' : 'pointer',
                    opacity: !lines.length ? 0.5 : 1,
                  }}
                >
                  {saveDraftMutation.isPending ? 'SAVING DRAFT...' : 'SAVE DRAFT'}
                </button>

                <button
                  type="button"
                  disabled={postReturnMutation.isPending || !lines.length || !canPost}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Are you sure you want to approve and POST this Purchase Return for ${money(
                          totalReturnValue
                        )}? This will atomically deduct stock and adjust the vendor account.`
                      )
                    ) {
                      postReturnMutation.mutate()
                    }
                  }}
                  style={{
                    backgroundColor: '#00b4d8',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '9px 24px',
                    fontSize: '12px',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    cursor: !lines.length || !canPost ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                    opacity: !lines.length || !canPost ? 0.5 : 1,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
                >
                  {postReturnMutation.isPending
                    ? 'POSTING RETURN...'
                    : 'APPROVE & POST TO STOCK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: RETURN HISTORY & AUDIT                                            */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Toolbar: Search & Filters */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              padding: '12px 16px',
              borderRadius: '6px',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
              {/* Search Box */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#0c2e2a',
                  border: '1px solid #164e48',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                }}
              >
                <input
                  type="text"
                  placeholder="Search return #, purchase #, vendor..."
                  value={historySearch}
                  onChange={(e) => {
                    setHistorySearch(e.target.value)
                    setHistoryPage(1)
                  }}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    padding: '8px 14px',
                    fontSize: '13px',
                    width: '260px',
                    outline: 'none',
                  }}
                />
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#13443e',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Search size={15} />
                </div>
              </div>

              {/* Status Filter */}
              <select
                value={historyStatusFilter}
                onChange={(e) => {
                  setHistoryStatusFilter(e.target.value)
                  setHistoryPage(1)
                }}
                style={{
                  backgroundColor: '#0c2e2a',
                  color: '#ffffff',
                  border: '1px solid #164e48',
                  borderRadius: '4px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                }}
              >
                <option value="all" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                  All Statuses
                </option>
                <option value="draft" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                  Draft
                </option>
                <option value="submitted" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                  Submitted
                </option>
                <option value="approved" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                  Approved
                </option>
                <option value="posted" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                  Posted
                </option>
                <option value="reversed" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                  Reversed
                </option>
              </select>

              {/* Branch Filter */}
              <select
                value={historyBranchFilter}
                onChange={(e) => {
                  setHistoryBranchFilter(e.target.value)
                  setHistoryPage(1)
                }}
                style={{
                  backgroundColor: '#0c2e2a',
                  color: '#ffffff',
                  border: '1px solid #164e48',
                  borderRadius: '4px',
                  padding: '8px 14px',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                }}
              >
                <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                  All Outlets
                </option>
                {branches.map((b) => (
                  <option
                    key={b.value}
                    value={b.value}
                    style={{ backgroundColor: '#041c19', color: '#ffffff' }}
                  >
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              Showing {returnRows.length} of {totalReturnsCount} returns
            </div>
          </div>

          {/* Table */}
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '4px',
              overflowX: 'auto',
            }}
          >
            <table
              style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: '#031413',
                    borderBottom: '1px solid #144743',
                    color: '#38d4c5',
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                  }}
                >
                  <th style={{ padding: '12px 14px', width: '150px' }}>RETURN #</th>
                  <th style={{ padding: '12px 14px', width: '150px' }}>ORIGINAL PURCHASE</th>
                  <th style={{ padding: '12px 14px', width: '100px' }}>DATE</th>
                  <th style={{ padding: '12px 14px' }}>SUPPLIER / VENDOR</th>
                  <th style={{ padding: '12px 14px', width: '140px' }}>STORE OUTLET</th>
                  <th style={{ padding: '12px 14px', width: '140px' }}>SETTLEMENT</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', width: '100px' }}>STATUS</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right', width: '130px' }}>
                    GRAND TOTAL
                  </th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', width: '160px' }}>
                    WORKFLOW ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  <tr>
                    <td
                      colSpan={9}
                      style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}
                    >
                      <RefreshCw
                        className="animate-spin"
                        style={{ display: 'inline-block', marginRight: '8px' }}
                        size={16}
                      />
                      Loading purchase returns...
                    </td>
                  </tr>
                ) : returnRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}
                    >
                      No purchase returns found matching current filters.
                    </td>
                  </tr>
                ) : (
                  returnRows.map((row) => (
                    <tr
                      key={row.id}
                      style={{ borderBottom: '1px solid #0d3834' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#072723')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Document # */}
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            color: '#38d4c5',
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                          }}
                        >
                          {row.return_number}
                        </span>
                      </td>

                      {/* Original Purchase */}
                      <td style={{ padding: '12px 14px' }}>
                        {row.purchase_number ? (
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              color: '#94a3b8',
                            }}
                          >
                            {row.purchase_number}
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontStyle: 'italic', fontSize: '11px' }}>
                            Standalone / Unlinked
                          </span>
                        )}
                      </td>

                      {/* Return Date */}
                      <td style={{ padding: '12px 14px', color: '#ffffff' }}>
                        {formatBusinessDate(row.return_date)}
                      </td>

                      {/* Supplier */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#ffffff' }}>{row.vendor_name}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{row.vendor_code}</div>
                      </td>

                      {/* Store Outlet */}
                      <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                        {row.branch_name}
                      </td>

                      {/* Settlement */}
                      <td style={{ padding: '12px 14px', fontSize: '11px' }}>
                        {row.settlement_type === 'reduce_payable' ? (
                          <span style={{ color: '#38d4c5' }}>Reduce Payable</span>
                        ) : row.settlement_type === 'supplier_credit' ? (
                          <span style={{ color: '#a855f7' }}>Credit Note</span>
                        ) : (
                          <span style={{ color: '#10b981' }}>Cash/Bank Refund</span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            backgroundColor:
                              row.status === 'posted'
                                ? '#064e3b'
                                : row.status === 'approved'
                                ? '#4c1d95'
                                : row.status === 'submitted'
                                ? '#0369a1'
                                : row.status === 'reversed'
                                ? '#7f1d1d'
                                : '#78350f',
                            color:
                              row.status === 'posted'
                                ? '#34d399'
                                : row.status === 'approved'
                                ? '#c084fc'
                                : row.status === 'submitted'
                                ? '#38bdf8'
                                : row.status === 'reversed'
                                ? '#fca5a5'
                                : '#fbbf24',
                          }}
                        >
                          {row.status}
                        </span>
                      </td>

                      {/* Grand Total */}
                      <td
                        style={{
                          padding: '12px 14px',
                          textAlign: 'right',
                          fontWeight: 800,
                          color: '#ffffff',
                          fontSize: '13px',
                        }}
                      >
                        {money(row.grand_total)}
                      </td>

                      {/* Workflow Actions */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px',
                          }}
                        >
                          {/* View Voucher */}
                          <button
                            type="button"
                            onClick={() => setViewingReturnId(row.id)}
                            title="View Voucher & Audit"
                            style={{
                              backgroundColor: '#031413',
                              border: '1px solid #144743',
                              color: '#38d4c5',
                              padding: '5px 7px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <BookOpen size={13} />
                          </button>

                          {/* Workflow: Submit */}
                          {row.status === 'draft' && canSubmit && (
                            <button
                              type="button"
                              onClick={() => workflowMutation.mutate({ action: 'submit', row })}
                              title="Submit for Approval"
                              style={{
                                backgroundColor: '#031413',
                                border: '1px solid #144743',
                                color: '#00b4d8',
                                padding: '5px 7px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <Send size={13} />
                            </button>
                          )}

                          {/* Workflow: Approve */}
                          {row.status === 'submitted' && canApprove && (
                            <button
                              type="button"
                              onClick={() => workflowMutation.mutate({ action: 'approve', row })}
                              title="Approve Return"
                              style={{
                                backgroundColor: '#031413',
                                border: '1px solid #144743',
                                color: '#a855f7',
                                padding: '5px 7px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <ShieldCheck size={13} />
                            </button>
                          )}

                          {/* Workflow: Post */}
                          {row.status === 'approved' && canPost && (
                            <button
                              type="button"
                              onClick={() => workflowMutation.mutate({ action: 'post', row })}
                              title="Post to Stock & Ledger"
                              style={{
                                backgroundColor: '#031413',
                                border: '1px solid #144743',
                                color: '#10b981',
                                padding: '5px 7px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <CheckCircle2 size={13} />
                            </button>
                          )}

                          {/* Workflow: Reverse */}
                          {row.status === 'posted' && canReverse && (
                            <button
                              type="button"
                              onClick={() => workflowMutation.mutate({ action: 'reverse', row })}
                              title="Reverse Posted Return"
                              style={{
                                backgroundColor: '#031413',
                                border: '1px solid #144743',
                                color: '#ef4444',
                                padding: '5px 7px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderTop: '1px solid #144743',
                backgroundColor: '#031413',
                fontSize: '12px',
                color: '#94a3b8',
              }}
            >
              <div>
                Page {historyPage} of {totalHistoryPages}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  style={{
                    backgroundColor: historyPage <= 1 ? '#0c2e2a' : '#144743',
                    color: historyPage <= 1 ? '#475569' : '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 12px',
                    cursor: historyPage <= 1 ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={historyPage >= totalHistoryPages}
                  onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                  style={{
                    backgroundColor: historyPage >= totalHistoryPages ? '#0c2e2a' : '#144743',
                    color: historyPage >= totalHistoryPages ? '#475569' : '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 12px',
                    cursor: historyPage >= totalHistoryPages ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: ELIGIBLE PURCHASES BROWSER                                       */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'eligible' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '6px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#ffffff' }}>
                Posted Supplier Purchases with Return Eligibility
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Click any purchase order below to load its original landed items directly into the return manifest.
              </p>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '4px',
              overflowX: 'auto',
            }}
          >
            <table
              style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: '#031413',
                    borderBottom: '1px solid #144743',
                    color: '#38d4c5',
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                  }}
                >
                  <th style={{ padding: '12px 14px', width: '160px' }}>PURCHASE #</th>
                  <th style={{ padding: '12px 14px', width: '110px' }}>DATE</th>
                  <th style={{ padding: '12px 14px' }}>SUPPLIER / VENDOR</th>
                  <th style={{ padding: '12px 14px', width: '160px' }}>OUTLET & WAREHOUSE</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right', width: '130px' }}>
                    GRAND TOTAL
                  </th>
                  <th style={{ padding: '12px 14px', textAlign: 'right', width: '130px' }}>
                    ALREADY RETURNED
                  </th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', width: '150px' }}>
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {postedPurchases.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}
                    >
                      No posted purchases found.
                    </td>
                  </tr>
                ) : (
                  postedPurchases.map((p) => (
                    <tr
                      key={p.id}
                      style={{ borderBottom: '1px solid #0d3834' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#072723')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            color: '#38d4c5',
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                          }}
                        >
                          {p.purchase_number}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#ffffff' }}>
                        {formatBusinessDate(p.purchase_date)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#ffffff' }}>{p.vendor_name}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.vendor_code}</div>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                        <div>{p.branch_name}</div>
                        <div style={{ fontSize: '11px' }}>{p.warehouse_name}</div>
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          textAlign: 'right',
                          fontWeight: 800,
                          color: '#ffffff',
                        }}
                      >
                        {money(p.grand_total)}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          textAlign: 'right',
                          color: Number(p.returned_amount || 0) > 0 ? '#f59e0b' : '#94a3b8',
                          fontWeight: 700,
                        }}
                      >
                        {money(p.returned_amount)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleInitiateReturnForPurchase(p)}
                          style={{
                            backgroundColor: '#00b4d8',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '6px 14px',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>RETURN ITEMS</span>
                          <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* VOUCHER & ITEM DETAILS MODAL                                             */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {viewingReturnId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '740px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #144743',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#031413',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <RotateCcw size={18} color="#38d4c5" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                  Purchase Return Voucher Details
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    color: '#38d4c5',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Printer size={14} />
                  <span>Print Voucher</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingReturnId(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            {loadingReturnDetails ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                <RefreshCw
                  className="animate-spin"
                  style={{ display: 'inline-block', marginRight: '8px' }}
                  size={16}
                />
                Loading return details...
              </div>
            ) : viewingReturnDetails ? (
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Meta details */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                    backgroundColor: '#031413',
                    border: '1px solid #144743',
                    borderRadius: '6px',
                    padding: '14px',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>RETURN NUMBER</span>
                    <div style={{ fontWeight: 800, color: '#38d4c5', fontFamily: 'monospace' }}>
                      {viewingReturnDetails.header.return_number}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>ORIGINAL PURCHASE</span>
                    <div style={{ fontWeight: 700, color: '#ffffff' }}>
                      {viewingReturnDetails.header.purchase_number || 'Standalone (Unlinked)'}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>RETURN DATE</span>
                    <div style={{ fontWeight: 700, color: '#ffffff' }}>
                      {formatBusinessDate(viewingReturnDetails.header.return_date)}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>SUPPLIER</span>
                    <div style={{ fontWeight: 700, color: '#ffffff' }}>
                      {viewingReturnDetails.header.vendor_name}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>OUTLET BRANCH</span>
                    <div style={{ fontWeight: 700, color: '#ffffff' }}>
                      {viewingReturnDetails.header.branch_name}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>STATUS</span>
                    <div style={{ fontWeight: 800, textTransform: 'uppercase', color: '#34d399' }}>
                      {viewingReturnDetails.header.status}
                    </div>
                  </div>
                </div>

                {/* Reason & Notes */}
                <div
                  style={{
                    backgroundColor: '#031413',
                    border: '1px solid #144743',
                    borderRadius: '6px',
                    padding: '12px 14px',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ fontWeight: 700, color: '#38d4c5' }}>Return Reason: </span>
                  <span style={{ color: '#ffffff' }}>{viewingReturnDetails.header.reason}</span>
                  {viewingReturnDetails.header.notes && (
                    <div style={{ marginTop: '4px', color: '#94a3b8' }}>
                      <span style={{ fontWeight: 700 }}>Notes: </span>
                      {viewingReturnDetails.header.notes}
                    </div>
                  )}
                </div>

                {/* Items Manifest */}
                <div>
                  <h4
                    style={{
                      margin: '0 0 10px 0',
                      fontSize: '12px',
                      fontWeight: 800,
                      color: '#38d4c5',
                      letterSpacing: '0.05em',
                    }}
                  >
                    ITEMIZED RETURN GOODS
                  </h4>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '12px',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          backgroundColor: '#02100f',
                          borderBottom: '1px solid #144743',
                          color: '#38d4c5',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}
                      >
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>ITEM</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>CONDITION</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>QTY</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>LANDED COST</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingReturnDetails.items.map((it) => (
                        <tr key={it.id} style={{ borderBottom: '1px solid #0d3834' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                color: '#38d4c5',
                                fontWeight: 700,
                                marginRight: '6px',
                              }}
                            >
                              [{it.product_code}]
                            </span>
                            <span style={{ color: '#ffffff', fontWeight: 600 }}>{it.product_name}</span>
                            {it.variant_name && (
                              <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                                {' '}
                                ({it.variant_name})
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '10px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                backgroundColor: it.condition === 'good' ? '#064e3b' : '#7f1d1d',
                                color: it.condition === 'good' ? '#34d399' : '#fca5a5',
                              }}
                            >
                              {it.condition}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: '10px 12px',
                              textAlign: 'center',
                              fontWeight: 800,
                              color: '#ffffff',
                            }}
                          >
                            {it.quantity}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94a3b8' }}>
                            {money(it.unit_cost)}
                          </td>
                          <td
                            style={{
                              padding: '10px 12px',
                              textAlign: 'right',
                              fontWeight: 800,
                              color: '#38d4c5',
                            }}
                          >
                            {money(it.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr
                        style={{
                          backgroundColor: '#02100f',
                          borderTop: '1px solid #144743',
                          fontWeight: 800,
                          fontSize: '13px',
                        }}
                      >
                        <td colSpan={4} style={{ padding: '12px', textAlign: 'right', color: '#ffffff' }}>
                          GRAND TOTAL VOUCHER VALUE:
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', color: '#38d4c5' }}>
                          {money(viewingReturnDetails.header.grand_total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
