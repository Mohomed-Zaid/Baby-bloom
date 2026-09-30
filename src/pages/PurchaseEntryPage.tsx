import { useState, useMemo, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Trash2, X, Save, Settings, PackageOpen, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { colomboNow } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import { listLookup } from '../services/masterData'
import { createAndPostPurchase, listPurchaseProducts, listSupplierBalances } from '../services/purchasing'
import { listCurrentStock } from '../services/inventory'
import { useBranchStore } from '../stores/branchStore'
import { useAuthStore } from '../stores/authStore'
import { permissions } from '../config/permissions'
import type { DiscountType, PurchaseProduct } from '../types/purchasing'

interface PurchaseLine {
  key: string
  product_variant_id: string
  unit_id: string
  product_code: string
  product_name: string
  variant_name?: string
  sku: string
  quantity: number
  free_quantity: number
  unit_cost: number
  selling_price: number
  mrp: number
  discount_type: DiscountType
  discount_value: number
  tax_rate: number
  batch_reference: string
  expiry_date: string
  remarks: string
  location_name: string
  line_total: number
  available_quantity?: number
}

export function PurchaseEntryPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const branch = useBranchStore(s => s.branchId) ?? ''
  const allowed = useAuthStore(s => s.user?.permissions) ?? []
  const hasCreate = allowed.includes(permissions.purchasesCreate)
  const today = colomboNow().format('YYYY-MM-DD')

  // ── Header State ───────────────────────────────────────────────────────────
  const branchId = branch
  const [warehouseId, setWarehouseId] = useState('')
  const [stockLocationId, setStockLocationId] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [vendorSearchTerm, setVendorSearchTerm] = useState('')
  const [showVendorDropdown, setShowVendorDropdown] = useState(false)
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(today)
  const dueDate = purchaseDate
  const [purchaseType, setPurchaseType] = useState<'credit' | 'cash' | 'mixed'>('credit')
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)

  // ── Entry Line State ───────────────────────────────────────────────────────
  const [entryCode, setEntryCode] = useState('')
  const [entryName, setEntryName] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<PurchaseProduct | null>(null)
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [showProductSearchModal, setShowProductSearchModal] = useState(false)
  const [productModalSearch, setProductModalSearch] = useState('')

  const [entryType, setEntryType] = useState('STANDARD')
  const [entryPrice, setEntryPrice] = useState<number>(0)
  const [entryPDis, setEntryPDis] = useState<number>(0)
  const [entryQty, setEntryQty] = useState<number>(1)
  const [entryFreeQty, setEntryFreeQty] = useState<number>(0)
  const [entryCost, setEntryCost] = useState<number>(0)
  const [entryCDis, setEntryCDis] = useState<number>(0)
  const [entryExpDate, setEntryExpDate] = useState(today.substring(0, 7))
  const [entryRemarks, setEntryRemarks] = useState('')
  const [entryMrp, setEntryMrp] = useState<number>(0)
  const [entryLocationId, setEntryLocationId] = useState('')

  // ── Cart Lines State ───────────────────────────────────────────────────────
  const [lines, setLines] = useState<PurchaseLine[]>([])

  const codeInputRef = useRef<HTMLInputElement>(null)
  const qtyInputRef = useRef<HTMLInputElement>(null)

  // ── Queries ────────────────────────────────────────────────────────────────
  const branches = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches'),
    enabled: hasCreate,
  })

  const effectiveBranchId = branchId || branches.data?.[0]?.value || ''

  const warehouses = useQuery({
    queryKey: ['lookup', 'warehouses', effectiveBranchId],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: effectiveBranchId, is_active: true }),
    enabled: hasCreate && !!effectiveBranchId,
  })

  const effectiveWarehouseId = warehouseId || warehouses.data?.[0]?.value || ''

  const locations = useQuery({
    queryKey: ['lookup', 'locations', effectiveWarehouseId],
    queryFn: () => listLookup('stock_locations', 'name', { warehouse_id: effectiveWarehouseId, is_active: true }),
    enabled: hasCreate && !!effectiveWarehouseId,
  })

  const effectiveLocationId = stockLocationId || entryLocationId || locations.data?.[0]?.value || ''

  const vendors = useQuery({
    queryKey: ['lookup', 'vendors'],
    queryFn: () => listLookup('vendors', 'name', { status: 'active' }),
    enabled: hasCreate,
  })

  const selectedVendor = useMemo(() => {
    return vendors.data?.find(v => v.value === vendorId)
  }, [vendors.data, vendorId])

  const supplierBalances = useQuery({
    queryKey: ['supplier-balances'],
    queryFn: () => listSupplierBalances(),
    enabled: hasCreate,
  })

  const selectedVendorBalance = useMemo(() => {
    if (!vendorId || !supplierBalances.data) return null
    return supplierBalances.data.find(b => b.vendor_id === vendorId)
  }, [supplierBalances.data, vendorId])

  const activeSearchTerm = productModalSearch || entryName || entryCode || ''

  const productsQuery = useQuery({
    queryKey: ['purchase-products', activeSearchTerm, effectiveLocationId],
    queryFn: () => listPurchaseProducts(activeSearchTerm, effectiveLocationId),
    enabled: hasCreate,
  })

  const currentStockQuery = useQuery({
    queryKey: ['purchase-stock', effectiveLocationId, selectedProduct?.product_variant_id],
    queryFn: () => listCurrentStock({
      page: 1,
      pageSize: 1,
      locationId: effectiveLocationId,
      variantId: selectedProduct?.product_variant_id,
    }),
    enabled: !!effectiveLocationId && !!selectedProduct?.product_variant_id,
  })

  // ── Profit % Live Calculation ──────────────────────────────────────────────
  const profitPercent = useMemo(() => {
    const cost = entryCost || (selectedProduct?.last_purchase_cost ?? 0)
    const selling = entryPrice || (selectedProduct?.retail_price ?? 0)
    if (cost <= 0 || selling <= 0) return 0
    return Math.round(((selling - cost) / cost) * 100)
  }, [entryCost, entryPrice, selectedProduct])

  // ── Line Total Live Calculation ────────────────────────────────────────────
  const calculatedLineTotal = useMemo(() => {
    const gross = (entryQty || 0) * (entryCost || 0)
    const disc = entryPDis > 0 ? (gross * (entryPDis / 100)) : (entryCDis || 0)
    return Math.max(0, gross - disc)
  }, [entryQty, entryCost, entryPDis, entryCDis])

  // ── Totals Calculation ─────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let subtotal = 0
    let discount = 0
    let totalQty = 0

    for (const l of lines) {
      const gross = l.quantity * l.unit_cost
      subtotal += gross
      const disc = l.discount_type === 'percentage'
        ? (gross * l.discount_value / 100)
        : l.discount_value
      discount += disc
      totalQty += l.quantity + (l.free_quantity || 0)
    }

    const netTotal = Math.max(0, subtotal - discount)
    return {
      subtotal,
      discount,
      totalQty,
      grandTotal: netTotal,
      itemCount: lines.length,
      discountPercent: subtotal > 0 ? ((discount / subtotal) * 100).toFixed(2) : '0.00',
    }
  }, [lines])

  // ── Auto-select first warehouse/location when loaded ────────────────────────
  useEffect(() => {
    if (warehouses.data && warehouses.data.length > 0 && !warehouseId) {
      const first = warehouses.data[0]
      if (first) setWarehouseId(first.value)
    }
  }, [warehouses.data, warehouseId])

  useEffect(() => {
    if (locations.data && locations.data.length > 0 && !stockLocationId) {
      const first = locations.data[0]
      if (first) {
        setStockLocationId(first.value)
        setEntryLocationId(first.value)
      }
    }
  }, [locations.data, stockLocationId])

  // ── Product Selection Handler ──────────────────────────────────────────────
  const handleSelectProduct = (prod: PurchaseProduct) => {
    setSelectedProduct(prod)
    setEntryCode(prod.product_code || prod.sku || '')
    setEntryName(prod.product_name || '')
    setEntryCost(Number(prod.last_purchase_cost ?? 0))
    setEntryPrice(Number(prod.retail_price ?? 0))
    setEntryMrp(Number(prod.retail_price ?? 0))
    setShowProductDropdown(false)
    setShowProductSearchModal(false)
    setTimeout(() => qtyInputRef.current?.focus(), 100)
  }

  // ── Add Item to Cart Line ──────────────────────────────────────────────────
  const handleAddLine = () => {
    if (!selectedProduct && !entryCode) {
      setNotice({ message: 'Please select a product first', type: 'error' })
      return
    }

    const prod = selectedProduct || productsQuery.data?.find(
      p => p.product_code.toLowerCase() === entryCode.toLowerCase() || p.sku.toLowerCase() === entryCode.toLowerCase()
    )

    if (!prod) {
      setNotice({ message: 'No valid product selected', type: 'error' })
      return
    }

    if (entryQty <= 0) {
      setNotice({ message: 'Quantity must be at least 1', type: 'error' })
      return
    }

    if (entryCost <= 0) {
      setNotice({ message: 'Please enter a valid Cost price (Cost must be greater than 0)', type: 'error' })
      return
    }

    const discType: DiscountType = entryPDis > 0 ? 'percentage' : entryCDis > 0 ? 'fixed' : 'none'
    const discVal = entryPDis > 0 ? entryPDis : entryCDis

    const locationLabel = locations.data?.find(l => l.value === (entryLocationId || effectiveLocationId))?.label || 'A'

    const newLine: PurchaseLine = {
      key: crypto.randomUUID(),
      product_variant_id: prod.product_variant_id,
      unit_id: prod.base_unit_id,
      product_code: prod.product_code,
      product_name: prod.product_name,
      variant_name: prod.variant_name,
      sku: prod.sku,
      quantity: entryQty,
      free_quantity: entryFreeQty,
      unit_cost: entryCost,
      selling_price: entryPrice,
      mrp: entryMrp,
      discount_type: discType,
      discount_value: discVal,
      tax_rate: 0,
      batch_reference: '',
      expiry_date: entryExpDate,
      remarks: entryRemarks,
      location_name: locationLabel,
      line_total: calculatedLineTotal,
      available_quantity: Number(prod.available_quantity ?? 0),
    }

    setLines(prev => [...prev, newLine])

    // Reset entry fields
    setEntryCode('')
    setEntryName('')
    setSelectedProduct(null)
    setEntryQty(1)
    setEntryFreeQty(0)
    setEntryCost(0)
    setEntryPrice(0)
    setEntryPDis(0)
    setEntryCDis(0)
    setEntryRemarks('')
    setEntryMrp(0)
    codeInputRef.current?.focus()
  }

  const handleRemoveLine = (key: string) => {
    setLines(prev => prev.filter(l => l.key !== key))
  }

  // ── Save Draft Mutation ────────────────────────────────────────────────────
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!vendorId) {
        throw new Error('Please select a vendor before saving.')
      }
      if (!effectiveBranchId || !effectiveWarehouseId || !effectiveLocationId) {
        throw new Error('Branch, Warehouse, and Location are required.')
      }
      if (lines.length === 0) {
        throw new Error('Please add at least one product line.')
      }

      const headerData = {
        branch_id: effectiveBranchId,
        warehouse_id: effectiveWarehouseId,
        stock_location_id: effectiveLocationId,
        vendor_id: vendorId,
        vendor_invoice_number: vendorInvoiceNumber || 'INV-' + Date.now().toString().slice(-6),
        purchase_date: purchaseDate,
        due_date: dueDate || purchaseDate,
        purchase_type: purchaseType,
        bill_discount_type: 'none',
        bill_discount_value: 0,
        shipping_cost: 0,
        other_cost: 0,
        notes: '',
        internal_reference: '',
      }

      const itemsData = lines.map(l => ({
        product_variant_id: l.product_variant_id,
        unit_id: l.unit_id,
        quantity: l.quantity,
        free_quantity: l.free_quantity,
        unit_cost: l.unit_cost,
        discount_type: l.discount_type,
        discount_value: l.discount_value,
        tax_rate: l.tax_rate,
        batch_reference: l.batch_reference,
        manufacture_date: '',
        expiry_date: l.expiry_date ? `${l.expiry_date}-01` : '',
        warranty_days: 0,
        remarks: l.remarks,
      }))

      const paymentsData: Array<Record<string, unknown>> = []
      if (purchaseType === 'cash') {
        paymentsData.push({
          payment_method: 'cash',
          amount: totals.grandTotal,
          notes: 'Purchase Cash Settlement',
        })
      }

      return createAndPostPurchase(headerData, itemsData, paymentsData)
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['current-stock'] })
      qc.invalidateQueries({ queryKey: ['purchase-stock'] })
      qc.invalidateQueries({ queryKey: ['purchase-products'] })
      qc.invalidateQueries({ queryKey: ['pos-products'] })
      qc.invalidateQueries({ queryKey: ['pos-search-modal'] })
      qc.invalidateQueries({ queryKey: ['stock-movements'] })
      navigate(`/purchases/${res.id}`)
    },
    onError: (err) => {
      setNotice({ message: getErrorMessage(err), type: 'error' })
    },
  })

  // ── Keyboard Shortcuts & Save Handler ──────────────────────────────────────
  const handleSavePurchase = () => {
    if (!vendorId) {
      setNotice({ message: 'Please select a vendor before saving.', type: 'error' })
      setShowVendorDropdown(true)
      return
    }
    if (lines.length === 0) {
      setNotice({ message: 'Please add at least one product line before saving purchase.', type: 'error' })
      codeInputRef.current?.focus()
      return
    }
    if (totals.grandTotal <= 0) {
      setNotice({ message: 'Purchase Grand Total must be greater than Rs 0.00. Please ensure items have a valid Cost price.', type: 'error' })
      return
    }
    saveDraftMutation.mutate()
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault()
        setShowProductSearchModal(true)
      } else if (e.key === 'F4') {
        e.preventDefault()
        handleSavePurchase()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lines, vendorId, saveDraftMutation])

  if (!hasCreate) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] bg-[#0c2423] text-emerald-100">
        <div className="p-8 bg-[#133534] border border-[#1b4d4b] rounded-lg text-center shadow-xl">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-400" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-sm text-emerald-300/80">You do not have permission to create purchases.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="pos-shell flex flex-col w-full text-[#e8f0ec] overflow-hidden select-none font-sans text-xs rounded-xl border border-[#144743] shadow-2xl min-h-[calc(100vh-140px)]"
      style={{
        background: 'radial-gradient(circle at 50% 25%, #0e3b37 0%, #082321 55%, #031413 100%)'
      }}
    >
      {/* ── Notice Banner ─────────────────────────────────────────────────── */}
      {notice && (
        <div className={`px-4 py-1.5 text-xs font-semibold flex items-center justify-between ${
          notice.type === 'error' ? 'bg-red-900/90 text-red-100 border-b border-red-700'
            : notice.type === 'success' ? 'bg-emerald-800/90 text-emerald-100 border-b border-emerald-600'
            : 'bg-cyan-900/90 text-cyan-100 border-b border-cyan-700'
        }`}>
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} className="text-white hover:opacity-80">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── 1. TOP HEADER & METADATA BAR (2 FLOATING CARDS) ──────────────── */}
      <div className="grid grid-cols-12 gap-2.5 p-2.5 bg-[#031514] border-b border-[#144743]">

        {/* LEFT CARD: Vendor Selector & Dates (8 Cols) */}
        <div className="col-span-8 bg-[#041a18] border border-[#1b5e58] rounded-md p-3 shadow-md flex justify-between gap-4">

          {/* Left Column: Vendor Select & Big Amber Prompt */}
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <label className="text-[11px] text-[#38d4c5] font-bold uppercase tracking-wider block mb-1">
                SELECT VENDOR
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Example : Jonh"
                  value={vendorSearchTerm || (selectedVendor ? selectedVendor.label : '')}
                  onChange={(e) => {
                    setVendorSearchTerm(e.target.value)
                    setShowVendorDropdown(true)
                  }}
                  onFocus={() => setShowVendorDropdown(true)}
                  className="w-full bg-[#082623] border border-[#1d635c] rounded px-3 h-8 text-white text-xs placeholder:text-teal-400/40 focus:outline-none focus:border-[#00d2ff] focus:ring-1 focus:ring-[#00d2ff]"
                />

                {/* Autocomplete Dropdown */}
                {showVendorDropdown && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto bg-[#071f1d] border border-[#1b5e58] rounded shadow-2xl">
                    {(vendors.data || [])
                      .filter(v => {
                        const term = vendorSearchTerm.toLowerCase()
                        return !term || v.label.toLowerCase().includes(term)
                      })
                      .map(v => (
                        <div
                          key={v.value}
                          onClick={() => {
                            setVendorId(v.value)
                            setVendorSearchTerm('')
                            setShowVendorDropdown(false)
                          }}
                          className="px-3 py-2 hover:bg-[#113a37] cursor-pointer border-b border-[#0e2c2a] flex items-center justify-between text-xs"
                        >
                          <span className="font-bold text-white">{v.label}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Big Prominent Vendor Display (Amber if unselected, Cyan if selected) */}
            <div className="my-2">
              {selectedVendor ? (
                <h2 className="text-[17px] font-black text-[#00d2ff] tracking-wide truncate">
                  {selectedVendor.label.toUpperCase()}
                </h2>
              ) : (
                <h2 className="text-[16px] font-black text-[#f59e0b] tracking-wider uppercase">
                  PLEASE SELECT VENDOR
                </h2>
              )}
            </div>
          </div>

          {/* Right Column: Due, Date, Ref No#, Warehouse, Location */}
          <div className="w-80 flex flex-col justify-between gap-1.5 pl-3 border-l border-[#144743]">
            {/* Due Row */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-teal-300 font-medium">Due</span>
              <div className="w-48 h-5 bg-[#082623] border border-[#164e48] rounded-xs px-2 flex items-center justify-start text-[11px] font-bold text-teal-200">
                {selectedVendorBalance ? Number(selectedVendorBalance.total_outstanding).toFixed(2) : ''}
              </div>
            </div>

            {/* Date Row */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-teal-300 font-medium">DATE</span>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-48 bg-[#082623] border border-[#1d635c] rounded px-2.5 text-white text-xs h-7 focus:outline-none focus:border-[#00d2ff]"
              />
            </div>

            {/* Ref No# Row */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-teal-300 font-medium whitespace-nowrap mr-2">REF NO#</span>
              <input
                type="text"
                placeholder=""
                value={vendorInvoiceNumber}
                onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                className="w-48 bg-[#082623] border border-[#1d635c] rounded px-2.5 text-white text-xs h-7 focus:outline-none focus:border-[#00d2ff]"
              />
            </div>

            {/* Target Warehouse & Location */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-teal-300 font-medium whitespace-nowrap mr-2">STORE IN</span>
              <div className="flex items-center gap-1 w-48">
                <select
                  value={effectiveWarehouseId}
                  onChange={(e) => {
                    setWarehouseId(e.target.value)
                    setStockLocationId('')
                  }}
                  className="w-1/2 bg-[#082623] border border-[#1d635c] rounded px-1.5 text-white text-[10px] h-7 focus:outline-none focus:border-[#00d2ff]"
                  title="Target Warehouse"
                >
                  {(warehouses.data || []).map(w => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>

                <select
                  value={effectiveLocationId}
                  onChange={(e) => {
                    setStockLocationId(e.target.value)
                    setEntryLocationId(e.target.value)
                  }}
                  className="w-1/2 bg-[#082623] border border-[#1d635c] rounded px-1.5 text-white text-[10px] h-7 focus:outline-none focus:border-[#00d2ff]"
                  title="Target Stock Location"
                >
                  {(locations.data || []).map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT CARD: Type, Totals, Search (4 Cols) */}
        <div className="col-span-4 bg-[#041a18] border border-[#1b5e58] rounded-md p-3 shadow-md flex flex-col justify-between">
          <div className="flex justify-end items-baseline gap-2">
            <span className="text-2xl font-bold text-teal-300">Rs</span>
            <span className="text-4xl font-black text-white tracking-tight drop-shadow-md font-mono">
              {Number(totals.grandTotal).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="w-28">
              <label className="text-[10px] text-[#38d4c5] font-bold block mb-0.5">TYPE</label>
              <select
                value={purchaseType}
                onChange={(e) => setPurchaseType(e.target.value as 'credit' | 'cash' | 'mixed')}
                className="w-full bg-[#082623] border border-[#1d635c] rounded px-2 text-white text-xs h-7 focus:outline-none focus:border-[#00d2ff]"
              >
                <option value="credit">Purchase</option>
                <option value="cash">Cash</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>

            <div className="text-right space-y-0.5 text-xs text-teal-200">
              <div className="font-bold text-emerald-400">{totals.discountPercent}%</div>
              <div>T.Items : <strong className="text-white">{totals.itemCount}</strong></div>
              <div>T.Quantity : <strong className="text-white">{totals.totalQty}</strong></div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setProductModalSearch(entryName || entryCode || '')
                setShowProductSearchModal(true)
              }}
              className="bg-[#082623] hover:bg-[#0c3632] border border-[#f59e0b] text-[#f59e0b] font-bold h-8 px-3 rounded transition flex items-center gap-1.5 text-xs tracking-wider"
            >
              <Search size={13} /> SEARCH
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={saveDraftMutation.isPending}
                onClick={handleSavePurchase}
                className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-bold h-8 px-3.5 rounded shadow transition flex items-center gap-1.5 text-xs tracking-wider uppercase whitespace-nowrap cursor-pointer"
              >
                <Save size={13} /> {saveDraftMutation.isPending ? 'SAVING...' : 'SAVE PURCHASE (F4)'}
              </button>

              <button
                type="button"
                className="bg-[#082623] hover:bg-[#0c3632] border border-[#1b5e58] text-teal-300 h-8 w-8 rounded flex items-center justify-center transition"
                title="Purchase Settings"
              >
                <Settings size={14} />
              </button>
            </div>
          </div>
        </div>

      </div>


      {/* ── 2. FAST PRODUCT ENTRY STRIP (BORDERED CARD) ───────────────────── */}
      <div className="p-2.5 bg-[#031514] border-b border-[#144743]">
        <div className="bg-[#041a18] border border-[#1b5e58] rounded-md p-3 shadow-md">
          <div className="grid grid-cols-12 gap-3">

            {/* Left Inputs (10 Cols) */}
            <div className="col-span-10 flex flex-col justify-between gap-2">

              {/* Row 1: Code, Product Name + NEW, Type, Profit% */}
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <label className="text-[11px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">CODE</label>
                  <input
                    ref={codeInputRef}
                    type="text"
                    placeholder="Example : CODE"
                    value={entryCode}
                    onChange={(e) => setEntryCode(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const code = entryCode.trim()
                        if (!code) return
                        const res = await listPurchaseProducts(code)
                        if (res.length > 0 && res[0]) {
                          handleSelectProduct(res[0])
                        } else {
                          setNotice({ message: `No product found for code "${code}"`, type: 'error' })
                        }
                      }
                    }}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-3 h-8 text-white text-xs font-mono placeholder:text-teal-400/40 focus:outline-none focus:border-[#00d2ff] focus:ring-1 focus:ring-[#00d2ff]"
                  />
                </div>

                <div className="col-span-6">
                  <label className="text-[11px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">PRODUCT NAME</label>
                  <div className="flex gap-1 items-center">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Example : PRODUCT NAME"
                        value={entryName}
                        onChange={(e) => {
                          setEntryName(e.target.value)
                          setShowProductDropdown(true)
                        }}
                        onFocus={() => setShowProductDropdown(true)}
                        className="w-full bg-[#082623] border border-[#1d635c] rounded px-3 h-8 text-white text-xs placeholder:text-teal-400/40 focus:outline-none focus:border-[#00d2ff] focus:ring-1 focus:ring-[#00d2ff]"
                      />

                      {/* Live Autocomplete Dropdown */}
                      {showProductDropdown && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto bg-[#071f1d] border border-[#1b5e58] rounded shadow-2xl">
                          {productsQuery.isLoading ? (
                            <div className="px-3 py-2 text-xs text-teal-400">Searching products...</div>
                          ) : (productsQuery.data || []).length === 0 ? (
                            <div className="px-3 py-2 text-xs text-teal-600">No matching products found</div>
                          ) : (
                            (productsQuery.data || []).map(p => (
                              <div
                                key={p.product_variant_id}
                                onClick={() => handleSelectProduct(p)}
                                className="px-2.5 py-1.5 hover:bg-[#113a37] cursor-pointer border-b border-[#0e2c2a] flex items-center justify-between text-xs"
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="font-bold text-white truncate">
                                    <span className="text-[#00d2ff] mr-1.5">{p.product_code}</span>
                                    {p.product_name}
                                  </div>
                                  {p.variant_name && <div className="text-[10px] text-teal-300">{p.variant_name}</div>}
                                </div>
                                <div className="text-right whitespace-nowrap">
                                  <div className="font-bold text-white">Cost: Rs {Number(p.last_purchase_cost ?? 0).toFixed(2)}</div>
                                  <div className="flex items-center justify-end gap-1.5 text-[10px] mt-0.5">
                                    <span className="text-teal-200">Sell: Rs {Number(p.retail_price ?? 0).toFixed(2)}</span>
                                    <span className={`px-1 py-0.2 rounded font-bold ${Number(p.available_quantity ?? 0) > 0 ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60' : 'bg-red-950/80 text-red-300 border border-red-800/60'}`}>
                                      Stock: {Number(p.available_quantity ?? 0).toFixed(0)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowProductSearchModal(true)}
                      title="New / Search Product"
                      className="bg-[#00a8e8] hover:bg-[#0094cc] text-white font-bold h-8 px-2.5 rounded text-xs transition flex items-center justify-center shrink-0"
                    >
                      NEW
                    </button>
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="text-[11px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">TYPE</label>
                  <input
                    type="text"
                    value={entryType}
                    onChange={(e) => setEntryType(e.target.value)}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-2 h-8 text-white text-xs focus:outline-none focus:border-[#00d2ff]"
                  />
                </div>

                <div className="col-span-1 text-center">
                  <label className="text-[11px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">PROFIT%</label>
                  <div className="h-8 flex items-center justify-center text-sm font-black text-white">
                    {profitPercent}%
                  </div>
                </div>
              </div>

              {/* Row 2: Price, P.Dis, Quantity, Free, Cost, C.Dis, Total, Exp.Date, Remarks, MRP, Location, Red Add (+) */}
              <div className="grid grid-cols-12 gap-1.5 items-end">
                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">PRICE</label>
                  <input
                    type="number"
                    step="0.01"
                    value={entryPrice || ''}
                    onChange={(e) => setEntryPrice(Number(e.target.value))}
                    className="w-full bg-white text-gray-900 font-bold border border-gray-300 rounded px-1.5 h-8 text-xs text-right focus:outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">P.DIS</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0"
                    value={entryPDis || ''}
                    onChange={(e) => setEntryPDis(Number(e.target.value))}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-1.5 h-8 text-white text-xs text-right focus:outline-none focus:border-[#00d2ff]"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">QUANTITY</label>
                  <input
                    ref={qtyInputRef}
                    type="number"
                    min="1"
                    value={entryQty}
                    onChange={(e) => setEntryQty(Math.max(1, Number(e.target.value)))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddLine()
                    }}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-1.5 h-8 text-white text-xs text-right font-bold focus:outline-none focus:border-[#00d2ff]"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">FREE</label>
                  <input
                    type="number"
                    min="0"
                    value={entryFreeQty || ''}
                    onChange={(e) => setEntryFreeQty(Number(e.target.value))}
                    className="w-full bg-white text-gray-900 font-bold border border-gray-300 rounded px-1.5 h-8 text-xs text-right focus:outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">COST</label>
                  <div className="relative">
                    <span className="absolute left-1.5 top-2 text-[10px] text-gray-500 pointer-events-none">Rs</span>
                    <input
                      type="number"
                      step="0.01"
                      value={entryCost || ''}
                      onChange={(e) => setEntryCost(Number(e.target.value))}
                      className="w-full bg-white text-gray-900 font-bold border border-gray-300 rounded pl-5 pr-1 h-8 text-xs text-right focus:outline-none"
                    />
                  </div>
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">C.DIS</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="10%"
                    value={entryCDis || ''}
                    onChange={(e) => setEntryCDis(Number(e.target.value))}
                    className="w-full bg-white text-gray-900 font-bold border border-gray-300 rounded px-1 h-8 text-xs text-right focus:outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">TOTAL</label>
                  <div className="bg-[#082623] border border-[#1d635c] text-white font-bold h-8 px-1.5 rounded flex items-center justify-between text-xs">
                    <span className="text-[9px] text-teal-400">Rs</span>
                    <span className="truncate">{calculatedLineTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">EXP.DATE</label>
                  <input
                    type="month"
                    value={entryExpDate}
                    onChange={(e) => setEntryExpDate(e.target.value)}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-1 h-8 text-white text-[10px] focus:outline-none focus:border-[#00d2ff]"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">REMARKS</label>
                  <input
                    type="text"
                    placeholder="Remark"
                    value={entryRemarks}
                    onChange={(e) => setEntryRemarks(e.target.value)}
                    className="w-full bg-white text-gray-900 border border-gray-300 rounded px-2 h-8 text-xs focus:outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">MRP</label>
                  <input
                    type="number"
                    step="0.01"
                    value={entryMrp || ''}
                    onChange={(e) => setEntryMrp(Number(e.target.value))}
                    className="w-full bg-white text-gray-900 font-bold border border-gray-300 rounded px-1 h-8 text-xs text-right focus:outline-none"
                  />
                </div>

                <div className="col-span-1 flex items-center gap-1">
                  <select
                    value={entryLocationId || effectiveLocationId}
                    onChange={(e) => setEntryLocationId(e.target.value)}
                    className="w-8 bg-[#082623] border border-[#1d635c] rounded h-8 text-white text-xs px-0.5 text-center focus:outline-none focus:border-[#00d2ff]"
                  >
                    {(locations.data || []).map(l => (
                      <option key={l.value} value={l.value}>{l.label.charAt(0)}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleAddLine}
                    title="Add Item (Enter)"
                    className="flex-1 bg-[#d92d20] hover:bg-[#b42318] text-white font-black h-8 rounded shadow transition flex items-center justify-center text-lg"
                  >
                    +
                  </button>
                </div>
              </div>

            </div>

            {/* Right Side: Item Details (2 Cols) */}
            <div className="col-span-2 border-l border-[#144743] pl-3 flex flex-col justify-between text-xs py-0.5">
              <span className="font-bold text-white text-xs block mb-1">
                Item Details
              </span>
              <div className="space-y-1 text-teal-200/90 text-[11px]">
                <div className="flex justify-between">
                  <span>Cost Price</span>
                  <strong className="text-white">Rs {Number(selectedProduct?.last_purchase_cost ?? 0).toFixed(2)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Last Price</span>
                  <strong className="text-white">Rs {Number(selectedProduct?.retail_price ?? 0).toFixed(2)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Location Stock</span>
                  <strong className={Number(currentStockQuery.data?.rows[0]?.available_quantity ?? selectedProduct?.available_quantity ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {Number(currentStockQuery.data?.rows[0]?.available_quantity ?? selectedProduct?.available_quantity ?? 0).toFixed(0)} {selectedProduct?.unit_name || ''}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Total Stock</span>
                  <strong className="text-[#38d4c5]">
                    {Number(selectedProduct?.company_available_quantity ?? selectedProduct?.available_quantity ?? 0).toFixed(0)} {selectedProduct?.unit_name || ''}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Reorder Level</span>
                  <span className="text-amber-300 font-semibold">{Number(selectedProduct?.reorder_level ?? 0).toFixed(0)}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>


      {/* ── 3. PRODUCT DETAILS GRID ───────────────────────────────────────── */}
      <div className="flex-1 min-h-[360px] overflow-y-auto bg-[#021311]">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-black text-[#e8f0ec] font-bold uppercase tracking-wider border-b border-[#144743] text-[11px]">
            <tr>
              <th className="py-2.5 px-3">PRODUCT DETAILS</th>
              <th className="py-2.5 px-2 text-right w-24">PRICE</th>
              <th className="py-2.5 px-2 text-center w-20">QUANTITY</th>
              <th className="py-2.5 px-3 text-right w-24">COST</th>
              <th className="py-2.5 px-2 text-center w-24">EX. DATE</th>
              <th className="py-2.5 px-2 text-center w-24">DISCOUNT %</th>
              <th className="py-2.5 px-3 text-right w-28">TOTAL</th>
              <th className="py-2.5 px-2 text-center w-16">TYPE</th>
              <th className="py-2.5 px-3 w-28">REMARKS</th>
              <th className="py-2.5 px-2 text-center w-16">IMEI</th>
              <th className="py-2.5 px-2 text-center w-16">REMOVE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0c2b29]">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-24 text-center text-teal-500/50">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <PackageOpen size={38} className="opacity-20 text-teal-400" />
                    <p className="text-sm font-semibold text-teal-400/80">No items added to purchase</p>
                    <p className="text-xs text-teal-600/70">Scan barcode or press F2 to search products</p>
                  </div>
                </td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.key} className="hover:bg-[#092624] transition group">
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-white text-[12px]">
                      {l.product_code} - {l.product_name}
                    </div>
                    {l.variant_name && (
                      <div className="text-[10px] text-teal-300 font-medium">
                        Variant: {l.variant_name} ({l.sku})
                      </div>
                    )}
                    <div className="text-[10px] text-teal-400/90 flex items-center gap-1.5 mt-0.5">
                      <span>Stock: <strong className="text-white">{Number(l.available_quantity ?? 0).toFixed(0)}</strong></span>
                      <span className="text-teal-500">→</span>
                      <span>After: <strong className="text-emerald-400">{Number(l.available_quantity ?? 0) + Number(l.quantity) + Number(l.free_quantity || 0)}</strong></span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right font-medium text-teal-100">
                    {Number(l.selling_price).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-2 text-center font-bold text-white">
                    {l.quantity} {l.free_quantity > 0 && <span className="text-emerald-400 text-[10px] font-normal">+{l.free_quantity}</span>}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-emerald-300">
                    {Number(l.unit_cost).toFixed(2)}
                  </td>
                  <td className="py-2.5 px-2 text-center text-teal-300 text-[11px]">
                    {l.expiry_date || '-'}
                  </td>
                  <td className="py-2.5 px-2 text-center text-amber-300 font-medium">
                    {l.discount_value > 0 ? `${l.discount_value}${l.discount_type === 'percentage' ? '%' : ''}` : '0%'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-black text-white text-[13px]">
                    {Number(l.line_total).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span className="bg-[#123937] text-teal-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      STD
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-emerald-300/80 text-[11px] truncate max-w-[120px]">
                    {l.remarks || '-'}
                  </td>
                  <td className="py-2.5 px-2 text-center text-teal-400 text-[11px]">
                    -
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(l.key)}
                      title="Remove item"
                      className="p-1 bg-[#d92d20] hover:bg-[#b42318] text-white rounded transition"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── 4. BOTTOM ACTION & SUMMARY BAR (SAVE PURCHASE) ─────────────────── */}
      <div className="bg-[#031413] border-t border-[#144743] px-4 py-2.5 flex items-center justify-between shadow-2xl shrink-0">
        <div className="flex items-center gap-4 text-xs text-teal-300">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#082623] border border-[#1d635c] text-[11px] font-mono text-teal-200">F2: Search</span>
            <span className="px-2 py-0.5 rounded bg-[#082623] border border-[#1d635c] text-[11px] font-mono text-teal-200">F4: Save Purchase</span>
          </div>
          {vendorId ? (
            <span className="text-emerald-400 font-medium flex items-center gap-1">
              ✓ Supplier: <strong className="text-white">{selectedVendor?.label || vendorSearchTerm}</strong>
            </span>
          ) : (
            <span className="text-amber-400 font-medium flex items-center gap-1 animate-pulse">
              ⚠ Please select a vendor
            </span>
          )}
          <span className="text-teal-300 text-xs hidden md:flex items-center gap-1 border-l border-[#1d635c] pl-3">
            Receiving to: <strong className="text-[#00d2ff]">{warehouses.data?.find(w => w.value === effectiveWarehouseId)?.label || 'Warehouse'} / {locations.data?.find(l => l.value === effectiveLocationId)?.label || 'Location'}</strong>
          </span>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-4 text-xs text-teal-200">
            <div>Items: <strong className="text-white text-sm">{totals.itemCount}</strong></div>
            <div>Total Qty: <strong className="text-white text-sm">{totals.totalQty}</strong></div>
            <div className="flex items-baseline gap-1.5 ml-2">
              <span className="text-teal-400 font-medium text-xs uppercase">Net Total:</span>
              <span className="text-2xl font-black text-white font-mono tracking-tight">
                Rs {Number(totals.grandTotal).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {lines.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Are you sure you want to clear all items from this purchase?')) {
                  setLines([])
                }
              }}
              className="px-3 h-9 rounded bg-[#162a28] hover:bg-[#203f3c] text-teal-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            >
              Clear Cart
            </button>
          )}

          <button
            type="button"
            disabled={saveDraftMutation.isPending}
            onClick={handleSavePurchase}
            className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white font-black text-sm h-10 px-6 rounded-md shadow-lg transition flex items-center gap-2 tracking-wide uppercase cursor-pointer"
          >
            <Save size={16} />
            {saveDraftMutation.isPending ? 'SAVING PURCHASE...' : 'SAVE PURCHASE'}
          </button>
        </div>
      </div>


      {/* ── 4. PRODUCT SEARCH MODAL (F2) ─────────────────────────────────── */}
      {showProductSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-[#041a18] border border-[#1b5e58] rounded-lg shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-3 border-b border-[#144743] bg-[#072421]">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Search size={16} className="text-[#38d4c5]" /> Product Lookup (F2)
              </h3>
              <button
                onClick={() => setShowProductSearchModal(false)}
                className="text-teal-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 border-b border-[#144743]">
              <input
                type="text"
                autoFocus
                placeholder="Search by code, product name, or SKU..."
                value={productModalSearch}
                onChange={(e) => setProductModalSearch(e.target.value)}
                className="w-full bg-[#082623] border border-[#1d635c] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#00d2ff]"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#021311] text-teal-300 font-bold sticky top-0">
                  <tr>
                    <th className="p-2">Code</th>
                    <th className="p-2">Name</th>
                    <th className="p-2">Variant / SKU</th>
                    <th className="p-2 text-right">Current Stock</th>
                    <th className="p-2 text-right">Last Cost</th>
                    <th className="p-2 text-right">Selling Price</th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0c2b29]">
                  {(productsQuery.data || []).map(p => (
                    <tr
                      key={p.product_variant_id}
                      className="hover:bg-[#0c332f] cursor-pointer transition"
                      onClick={() => handleSelectProduct(p)}
                    >
                      <td className="p-2 font-mono text-[#00d2ff] font-bold">{p.product_code}</td>
                      <td className="p-2 text-white font-medium">{p.product_name}</td>
                      <td className="p-2 text-teal-300">{p.variant_name || p.sku}</td>
                      <td className="p-2 text-right">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${Number(p.available_quantity ?? 0) > 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60' : 'bg-red-950 text-red-300 border border-red-800/60'}`}>
                          {Number(p.available_quantity ?? 0).toFixed(0)} {p.unit_name || ''}
                        </span>
                      </td>
                      <td className="p-2 text-right text-emerald-400 font-semibold">
                        Rs {Number(p.last_purchase_cost ?? 0).toFixed(2)}
                      </td>
                      <td className="p-2 text-right text-white font-bold">
                        Rs {Number(p.retail_price ?? 0).toFixed(2)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          className="bg-[#00a8e8] hover:bg-[#0094cc] text-white text-[11px] font-bold px-2 py-0.5 rounded"
                        >
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
