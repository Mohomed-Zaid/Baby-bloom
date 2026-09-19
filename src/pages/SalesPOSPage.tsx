import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Search, Trash2, ShoppingCart, Printer, XCircle, Wallet, AlertTriangle, MapPin, PlayCircle, Pause } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import { permissions } from '../config/permissions'
import { getErrorMessage } from '../lib/errors'
import { formatBusinessDate } from '../lib/dates'
import {
  createSalesDraft, holdInvoice, recallInvoice, invoiceAction,
  listPosProducts, findPosByBarcode, listHeldInvoices
} from '../services/sales'
import { listStaff } from '../services/staffService'
import { requireSupabase, throwOnError } from '../services/client'
import { listLookup } from '../services/masterData'
import type { PosCartLine, PosProduct, PosTender, SalesDiscountType } from '../types/sales'

const cash = (n: number) => `Rs. ${Number(n).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`
const calcLine = (l: PosCartLine): PosCartLine => {
  const base = l.quantity * l.unit_price
  const da = l.discount_type === 'percentage' ? base * l.discount_value / 100
    : l.discount_type === 'fixed' ? Math.min(l.discount_value, base) : 0
  const net = base - da
  const tax = net * l.tax_rate / 100
  return { ...l, discount_amount: Math.round(da * 100) / 100, line_total: Math.round((net + tax) * 100) / 100 }
}
const grandTotal = (lines: PosCartLine[]) => lines.reduce((s, l) => s + l.line_total, 0)
const tenderTotal = (t: PosTender) => t.cash + t.card + t.credit + t.cheque

export interface PosReceiptData {
  number: string
  date: string
  branchName: string
  customerName: string
  items: Array<{
    name: string
    variant?: string
    qty: number
    price: number
    total: number
  }>
  subtotal: number
  discount: number
  grandTotal: number
  tendered: number
  paid: number
  change: number
  balance: number
  paymentMethod: string
}

export function SalesPOSPage() {
  const navigate = useNavigate()
  const allowed = useAuthStore(s => s.user?.permissions) ?? []
  const can = (k: string) => allowed.includes(k)
  const qc = useQueryClient()
  const selectedBranch = useBranchStore(s => s.branchId)

  // ── State ───────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<PosCartLine[]>([])
  const [customerId, setCustomerId] = useState<string>('')
  const [branchId, setBranchId] = useState<string>('')
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [locationId, setLocationId] = useState<string>('')
  const [repId, setRepId] = useState<string>('')
  const [invoiceType, setInvoiceType] = useState<'cash'|'credit'|'mixed'>('cash')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [showProductModal, setShowProductModal] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)
  const [showHeldModal, setShowHeldModal] = useState(false)
  const [tender, setTender] = useState<PosTender>({ cash: 0, card: 0, cheque: 0, credit: 0 })
  const [notice, setNotice] = useState('')
  const [lastReceipt, setLastReceipt] = useState<PosReceiptData | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const gt = grandTotal(cart)
  const tendered = tenderTotal(tender)
  const change = Math.max(tendered - gt, 0)
  const balance = Math.max(gt - tendered, 0)

  // ── Lookups (ordered so defaults are automatically top of the list) ───────
  const branches = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('branches')
        .select('id, name, is_head_office')
        .eq('is_active', true)
        .order('is_head_office', { ascending: false })
        .order('name', { ascending: true })
      throwOnError(error)
      return ((data ?? []) as { id: string; name: string; is_head_office: boolean }[]).map(b => ({
        value: b.id,
        label: b.is_head_office ? `🏢 ${b.name} (HQ)` : b.name,
        is_head_office: b.is_head_office,
      }))
    },
    enabled: can(permissions.salesCreate),
  })
  const effectiveBranchId = branchId || selectedBranch || branches.data?.[0]?.value || ''

  const warehouses = useQuery({
    queryKey: ['lookup', 'warehouses', effectiveBranchId],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('warehouses')
        .select('id, name, is_default')
        .eq('branch_id', effectiveBranchId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true })
      throwOnError(error)
      return ((data ?? []) as { id: string; name: string; is_default: boolean }[]).map(w => ({
        value: w.id,
        label: w.is_default ? `⭐ ${w.name} (Default)` : w.name,
        is_default: w.is_default,
      }))
    },
    enabled: !!effectiveBranchId,
  })
  const effectiveWarehouseId = (warehouseId && warehouses.data?.some(w => w.value === warehouseId))
    ? warehouseId
    : warehouses.data?.[0]?.value || ''

  const locations = useQuery({
    queryKey: ['lookup', 'locations', effectiveWarehouseId],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('stock_locations')
        .select('id, name, code')
        .eq('warehouse_id', effectiveWarehouseId)
        .eq('is_active', true)
        .order('name', { ascending: true })
      throwOnError(error)
      return ((data ?? []) as { id: string; name: string; code: string }[]).map(l => ({
        value: l.id,
        label: `${l.name} (${l.code})`,
      }))
    },
    enabled: !!effectiveWarehouseId,
  })
  const effectiveLocationId = (locationId && locations.data?.some(l => l.value === locationId))
    ? locationId
    : locations.data?.[0]?.value || ''

  const customers = useQuery({ queryKey: ['lookup','customers'], queryFn: () => listLookup('customers', 'name'), enabled: can(permissions.salesCreate) })
  const staffQuery = useQuery({
    queryKey: ['staff-lookup', effectiveBranchId],
    queryFn: () => listStaff({ branchId: effectiveBranchId || undefined, activeOnly: true }),
    enabled: !!effectiveBranchId,
  })
  const held = useQuery({ queryKey: ['sales','held', effectiveBranchId], queryFn: () => listHeldInvoices(effectiveBranchId || undefined), enabled: showHeldModal && !!effectiveBranchId })
  const products = useQuery({ queryKey: ['pos-products', productSearch, effectiveLocationId], queryFn: () => listPosProducts(productSearch, effectiveLocationId), enabled: showProductModal })

  // ── Real-time location stock for items in cart ───────────────────────────
  const cartVariantIds = cart.map(l => l.product_variant_id)
  const cartStockQuery = useQuery({
    queryKey: ['cart-stock-state', effectiveLocationId, cartVariantIds.slice().sort().join(',')],
    queryFn: async () => {
      if (cartVariantIds.length === 0) return []
      const { data, error } = await requireSupabase()
        .from('current_stock')
        .select('product_variant_id, stock_location_id, warehouse_id, branch_id, branch_name, warehouse_name, location_name, available_quantity, quantity_on_hand')
        .in('product_variant_id', cartVariantIds)
      throwOnError(error)
      return (data ?? []) as Array<{
        product_variant_id: string
        stock_location_id: string
        warehouse_id: string
        branch_id: string
        branch_name: string
        warehouse_name: string
        location_name: string
        available_quantity: number
        quantity_on_hand: number
      }>
    },
    enabled: cartVariantIds.length > 0,
  })

  const getVariantStockInfo = useCallback((variantId: string) => {
    const rows = cartStockQuery.data?.filter(s => s.product_variant_id === variantId) ?? []
    const here = rows.find(s => s.stock_location_id === effectiveLocationId)
    const availableHere = Number(here?.available_quantity ?? 0)
    const otherRows = rows.filter(s => s.stock_location_id !== effectiveLocationId && Number(s.available_quantity ?? 0) > 0)
    const bestOther = otherRows[0] ?? null
    return { availableHere, bestOther, otherRows }
  }, [cartStockQuery.data, effectiveLocationId])

  const switchToLocation = useCallback((loc: { branch_id: string; warehouse_id: string; stock_location_id: string; warehouse_name: string; location_name: string }) => {
    setBranchId(loc.branch_id)
    setWarehouseId(loc.warehouse_id)
    setLocationId(loc.stock_location_id)
    notify(`📍 Switched to ${loc.warehouse_name} · ${loc.location_name} where stock is in hand!`)
  }, [])

  // Stock check
  const stockDiscrepancies = cart.map((line) => {
    const info = getVariantStockInfo(line.product_variant_id)
    const available = cartStockQuery.isSuccess ? info.availableHere : line.available_quantity
    const isShort = line.track_stock && !line.allow_negative_stock && line.quantity > available
    return { line, available, isShort, bestOther: info.bestOther }
  })

  const shortLines = stockDiscrepancies.filter(d => d.isShort)
  const hasStockError = shortLines.length > 0

  // Find Walk-in or Cash Customer
  const walkInCustomer = customers.data?.find(c => {
    const l = c.label.toLowerCase()
    return l.includes('walk') || l.includes('cash')
  })
  const effectiveCustomerId = customerId || walkInCustomer?.value || customers.data?.[0]?.value || ''

  // Refocus scanner
  const focusScan = useCallback(() => { setTimeout(() => scanRef.current?.focus(), 50) }, [])
  useEffect(() => { focusScan() }, [focusScan])

  function notify(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 4000) }

  // ── Hold bill (declared before keyboard handler so F8 can reference it) ─────
  const holdBill = useCallback(async () => {
    if (!effectiveBranchId || !effectiveWarehouseId || !effectiveLocationId || !effectiveCustomerId) { notify('Select branch, warehouse, location and customer first'); return }
    if (cart.length === 0) { notify('Cart is empty'); return }
    try {
      const today = new Date().toISOString().slice(0, 10)
      const draft = await createSalesDraft(
        { branch_id: effectiveBranchId, warehouse_id: effectiveWarehouseId, stock_location_id: effectiveLocationId, customer_id: effectiveCustomerId, invoice_date: today, due_date: today, invoice_type: invoiceType, rep_id: repId || undefined },
        cart.map(l => ({ product_variant_id: l.product_variant_id, quantity: l.quantity, unit_price: l.unit_price, discount_type: l.discount_type, discount_value: l.discount_value, tax_rate: l.tax_rate })),
      )
      await holdInvoice(draft.id)
      setCart([]); setTender({ cash: 0, card: 0, cheque: 0, credit: 0 })
      notify(`Bill ${draft.document_number} held (F9 to recall)`); focusScan()
      await qc.invalidateQueries({ queryKey: ['sales','held'] })
    } catch (err) { notify(getErrorMessage(err)) }
  }, [effectiveBranchId, effectiveWarehouseId, effectiveLocationId, effectiveCustomerId, cart, invoiceType, repId, focusScan, qc])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'F2') { e.preventDefault(); setShowProductModal(true) }
      if (e.key === 'F4' && cart.length > 0) { e.preventDefault(); setShowPayModal(true) }
      if (e.key === 'F8' && cart.length > 0) { e.preventDefault(); void holdBill() }
      if (e.key === 'F9') { e.preventDefault(); setShowHeldModal(true) }
      if (e.key === 'Escape') { setShowProductModal(false); setShowPayModal(false); setShowHeldModal(false); focusScan() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cart.length, holdBill, focusScan])

  // ── Add to cart ──────────────────────────────────────────────────────────
  const addProduct = async (p: PosProduct) => {
    // If product has 0 available at current location, check if it exists at another location
    if (p.track_stock && !p.allow_negative_stock && p.available_quantity <= 0) {
      try {
        const { data: stocks } = await requireSupabase()
          .from('current_stock')
          .select('stock_location_id, warehouse_id, branch_id, warehouse_name, location_name, available_quantity')
          .eq('product_variant_id', p.product_variant_id)
          .gt('available_quantity', 0)
          .order('available_quantity', { ascending: false })
          .limit(1)

        const stockList = (stocks ?? []) as unknown as Array<{
          stock_location_id: string
          warehouse_id: string
          branch_id: string
          warehouse_name: string
          location_name: string
          available_quantity: number
        }>

        if (stockList.length > 0 && stockList[0]) {
          const target = stockList[0]
          switchToLocation(target)
          p.available_quantity = Number(target.available_quantity)
        }
      } catch {
        // Continue with default
      }
    }

    setCart(prev => {
      const existing = prev.findIndex(l => l.product_variant_id === p.product_variant_id)
      if (existing >= 0) {
        const updated = [...prev]
        const current = updated[existing]!
        updated[existing] = calcLine({ ...current, quantity: current.quantity + 1 })
        return updated
      }
      const line: PosCartLine = calcLine({
        product_variant_id: p.product_variant_id,
        product_code: p.product_code, product_name: p.product_name,
        variant_name: p.variant_name, sku: p.sku,
        barcode: p.barcode ?? null, unit_name: p.unit_name,
        available_quantity: p.available_quantity,
        quantity: 1, unit_price: p.retail_price, cost_price: p.last_cost ?? 0,
        tax_rate: p.tax_rate, discount_type: 'none', discount_value: 0,
        discount_amount: 0, line_total: 0,
        track_stock: p.track_stock, allow_negative_stock: p.allow_negative_stock,
      })
      return [...prev, line]
    })
    setShowProductModal(false); focusScan()
  }

  const updateQty = (idx: number, qty: number) => {
    if (qty <= 0) { setCart(c => c.filter((_, i) => i !== idx)); return }
    setCart(c => c.map((l, i) => i === idx ? calcLine({ ...l, quantity: qty }) : l))
  }

  const updateDisc = (idx: number, type: SalesDiscountType, value: number) =>
    setCart(c => c.map((l, i) => i === idx ? calcLine({ ...l, discount_type: type, discount_value: value }) : l))

  // ── Barcode / SKU / Name scanner ────────────────────────────────────────
  const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const code = barcodeInput.trim()
    setBarcodeInput('')
    if (!code) return
    try {
      const p = await findPosByBarcode(code, effectiveLocationId)
      if (p) {
        void addProduct(p)
      } else {
        // Fallback: check if multiple products match by name, SKU or variant
        const matches = await listPosProducts(code, effectiveLocationId)
        if (matches.length > 0) {
          setProductSearch(code)
          setShowProductModal(true)
          notify(`Found ${matches.length} matching product(s). Please select:`)
        } else {
          notify(`No product found for "${code}" (checked barcode, SKU, and product name)`)
        }
      }
    } catch (err) { notify(getErrorMessage(err)) }
  }

  // ── Recall held bill ─────────────────────────────────────────────────────
  const recallMutation = useMutation({
    mutationFn: (id: string) => recallInvoice(id),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ['sales','held'] })
      notify(`Recalled ${result.document_number}`); setShowHeldModal(false); focusScan()
    },
    onError: e => notify(getErrorMessage(e)),
  })

  // ── Post invoice ─────────────────────────────────────────────────────────
  const postMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveBranchId || !effectiveWarehouseId || !effectiveLocationId || !effectiveCustomerId) throw new Error('Select branch, warehouse, location and customer first')
      if (cart.length === 0) throw new Error('Cart is empty')
      if (invoiceType !== 'credit' && tendered < gt) throw new Error('Tendered amount is insufficient')

      if (hasStockError) {
        const first = shortLines[0]!
        if (first.bestOther) {
          throw new Error(
            `"${first.line.product_name} (${first.line.variant_name})" has 0 stock at the selected location, but ${Number(first.bestOther.available_quantity).toFixed(0)} units are available at ${first.bestOther.warehouse_name} · ${first.bestOther.location_name}. Please click "Switch Location" above to complete sale.`
          )
        }
        throw new Error(
          `Insufficient stock for "${first.line.product_name} (${first.line.variant_name})": requested ${first.line.quantity}, but only ${first.available.toFixed(0)} available at this location. Please add stock via Products > "+ Add Stock".`
        )
      }
      const today = new Date().toISOString().slice(0, 10)

      // Cap immediate cash payment applied to invoice so it never exceeds remaining invoice balance
      const nonCashTotal = tender.card + tender.cheque + tender.credit
      const remainingNeeded = Math.max(0, gt - nonCashTotal)
      const cashApplied = Math.min(tender.cash, remainingNeeded)

      const payments: Array<{payment_method: string; amount: number; card_reference?: string; cheque_number?: string; cheque_date?: string}> = []
      if (cashApplied > 0) payments.push({ payment_method: 'cash', amount: cashApplied })
      if (tender.card > 0) payments.push({ payment_method: 'card', amount: tender.card, card_reference: '' })
      if (tender.cheque > 0) payments.push({ payment_method: 'cheque', amount: tender.cheque, cheque_number: '', cheque_date: today })
      if (tender.credit > 0) payments.push({ payment_method: 'customer_credit', amount: tender.credit })
      const draft = await createSalesDraft(
        { branch_id: effectiveBranchId, warehouse_id: effectiveWarehouseId, stock_location_id: effectiveLocationId, customer_id: effectiveCustomerId, invoice_date: today, due_date: today, invoice_type: invoiceType, rep_id: repId || undefined },
        cart.map(l => ({ product_variant_id: l.product_variant_id, quantity: l.quantity, unit_price: l.unit_price, discount_type: l.discount_type, discount_value: l.discount_value, tax_rate: l.tax_rate })),
        payments as never,
      )
      return invoiceAction('post', draft.id)
    },
    onSuccess: (r) => {
      const receiptItems = cart.map(l => ({
        name: l.product_name,
        variant: l.variant_name,
        qty: l.quantity,
        price: l.unit_price,
        total: l.line_total,
      }))
      const changeAmount = Math.max(0, tendered - (r.grand_total ?? gt))
      const paidAmount = Math.min(tendered, r.grand_total ?? gt)
      const balAmount = Math.max(0, (r.grand_total ?? gt) - paidAmount)

      setLastReceipt({
        number: r.document_number,
        date: new Date().toLocaleString('en-LK'),
        branchName: branches.data?.find(b => b.value === effectiveBranchId)?.label ?? 'Main Branch',
        customerName: customers.data?.find(c => c.value === effectiveCustomerId)?.label ?? 'Walk-in Customer',
        items: receiptItems,
        subtotal: cart.reduce((s, l) => s + (l.quantity * l.unit_price), 0),
        discount: cart.reduce((s, l) => s + l.discount_amount, 0),
        grandTotal: r.grand_total ?? gt,
        tendered: tendered,
        paid: paidAmount,
        change: changeAmount,
        balance: balAmount,
        paymentMethod: invoiceType.toUpperCase(),
      })
      setCart([])
      setTender({ cash: 0, card: 0, cheque: 0, credit: 0 })
      setShowPayModal(false)
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['current-stock'] })
      qc.invalidateQueries({ queryKey: ['cart-stock-state'] })
      setTimeout(() => window.print(), 350)
    },
    onError: (e) => {
      const rawMsg = getErrorMessage(e)
      if (rawMsg.includes('Insufficient available stock')) {
        notify('⚠️ Out of Stock: This item has 0 stock at the selected location. Click "Switch Location" or add stock via Products > "+ Add Stock".')
      } else {
        notify(rawMsg)
      }
    },
  })

  const denominations = [5000, 2000, 1000, 500, 100, 50]

  if (!can(permissions.salesCreate)) return <div className='panel-state'>You do not have permission to create sales.</div>

  return (
    <div className='pos-shell'>
      {/* ── TOP BAR ── */}
      <header className='pos-topbar'>
        <div className='pos-topbar-left'>
          <ShoppingCart size={20} className='pos-logo-icon' />
          <span className='pos-title'>Baby Bloom POS</span>
        </div>
        <div className='pos-topbar-controls'>
          <select
            className='compact-select'
            style={{ background: '#123c2f', color: '#ffffff', borderColor: 'rgba(255,255,255,0.25)' }}
            value={effectiveBranchId}
            onChange={e => { setBranchId(e.target.value); setWarehouseId(''); setLocationId('') }}
          >
            <option value='' style={{ background: '#0b2a21', color: '#ffffff' }}>— Branch —</option>
            {branches.data?.map(x => (
              <option key={x.value} value={x.value} style={{ background: '#0b2a21', color: '#ffffff' }}>
                {x.label}
              </option>
            ))}
          </select>

          <select
            className='compact-select'
            style={{ background: '#123c2f', color: '#ffffff', borderColor: 'rgba(255,255,255,0.25)' }}
            value={effectiveWarehouseId}
            onChange={e => { setWarehouseId(e.target.value); setLocationId('') }}
          >
            <option value='' style={{ background: '#0b2a21', color: '#ffffff' }}>— Warehouse —</option>
            {warehouses.data?.map(x => (
              <option key={x.value} value={x.value} style={{ background: '#0b2a21', color: '#ffffff' }}>
                {x.label}
              </option>
            ))}
          </select>

          <select
            className='compact-select'
            style={{ background: '#123c2f', color: '#ffffff', borderColor: 'rgba(255,255,255,0.25)' }}
            value={effectiveLocationId}
            onChange={e => setLocationId(e.target.value)}
          >
            <option value='' style={{ background: '#0b2a21', color: '#ffffff' }}>— Location —</option>
            {locations.data?.map(x => (
              <option key={x.value} value={x.value} style={{ background: '#0b2a21', color: '#ffffff' }}>
                {x.label}
              </option>
            ))}
          </select>

          <select
            className='compact-select'
            style={{ background: '#123c2f', color: '#ffffff', borderColor: 'rgba(255,255,255,0.25)' }}
            value={effectiveCustomerId}
            onChange={e => setCustomerId(e.target.value)}
          >
            <option value='' style={{ background: '#0b2a21', color: '#ffffff' }}>— Customer —</option>
            {customers.data?.map(x => (
              <option key={x.value} value={x.value} style={{ background: '#0b2a21', color: '#ffffff' }}>
                {x.label.toLowerCase().includes('walk') || x.label.toLowerCase().includes('cash')
                  ? `🚶 Walk-in Customer (${x.label})`
                  : x.label}
              </option>
            ))}
          </select>

          <select
            className='compact-select'
            style={{ background: '#123c2f', color: '#ffffff', borderColor: 'rgba(255,255,255,0.25)' }}
            value={repId}
            onChange={e => setRepId(e.target.value)}
            title="Assign Sales Representative"
          >
            <option value='' style={{ background: '#0b2a21', color: '#ffffff' }}>— Sales Rep —</option>
            {staffQuery.data?.map(s => (
              <option key={s.id} value={s.id} style={{ background: '#0b2a21', color: '#ffffff' }}>
                👤 {s.full_name} ({s.staff_code})
              </option>
            ))}
          </select>

          <select
            className='compact-select'
            style={{ background: '#123c2f', color: '#ffffff', borderColor: 'rgba(255,255,255,0.25)' }}
            value={invoiceType}
            onChange={e => setInvoiceType(e.target.value as never)}
          >
            <option value='cash' style={{ background: '#0b2a21', color: '#ffffff' }}>Cash</option>
            <option value='credit' style={{ background: '#0b2a21', color: '#ffffff' }}>Credit</option>
            <option value='mixed' style={{ background: '#0b2a21', color: '#ffffff' }}>Mixed</option>
          </select>
        </div>
        <div className='pos-topbar-right' style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastReceipt && (
            <button
              type="button"
              className="button secondary"
              style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}
              onClick={() => window.print()}
              title="Re-print last invoice receipt"
            >
              <Printer size={14} color="#166534" /> Print #{lastReceipt.number}
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={() => navigate('/pos/shift')}
            title="Manage Shift Session & Cash Drawer"
          >
            <Wallet size={14} color="#10b981" />
            Shift / Drawer
          </button>
          <span className='pos-date'>{formatBusinessDate(new Date().toISOString().slice(0,10))}</span>
        </div>
      </header>

      {notice && <div className='inline-notice pos-notice'>{notice}</div>}

      {/* ── STOCK LOCATION MISMATCH ALERT BANNER ── */}
      {shortLines.length > 0 && shortLines[0] && (
        <div style={{
          margin: '8px 16px 0',
          padding: '10px 14px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#991b1b' }}>
            <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0 }} />
            <div>
              <strong>Stock Location Notice: </strong>
              "{shortLines[0].line.product_name}" has <strong>0 stock</strong> at selected location (<em>{locations.data?.find(l => l.value === effectiveLocationId)?.label || 'Current Location'}</em>).
              {shortLines[0].bestOther ? (
                <span> Available: <strong>{Number(shortLines[0].bestOther.available_quantity).toFixed(0)} units</strong> at <strong>{shortLines[0].bestOther.warehouse_name} ({shortLines[0].bestOther.location_name})</strong>.</span>
              ) : (
                <span> Please add stock via Products &gt; "+ Add Stock".</span>
              )}
            </div>
          </div>
          {shortLines[0].bestOther && (
            <button
              type="button"
              className="button primary"
              style={{ padding: '5px 12px', fontSize: 12, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
              onClick={() => switchToLocation(shortLines[0]!.bestOther!)}
            >
              <MapPin size={14} />
              Switch to {shortLines[0].bestOther.warehouse_name}
            </button>
          )}
        </div>
      )}

      {/* ── SCANNER ── */}
      <div className='pos-scanner-bar'>
        <Search size={16} className='pos-scan-icon' />
        <input ref={scanRef} className='pos-scanner-input' placeholder='Scan barcode or press F2 to search…' value={barcodeInput}
          onChange={e => setBarcodeInput(e.target.value)} onKeyDown={handleScan} autoComplete='off' />
        <button className='button secondary pos-fab' onClick={() => setShowProductModal(true)} title='F2 — Product Search'>F2 Search</button>
        <button className='button secondary pos-fab' disabled={cart.length === 0} onClick={() => void holdBill()} title='F8 — Hold Bill'>F8 Hold</button>
        <button className='button secondary pos-fab' onClick={() => setShowHeldModal(true)} title='F9 — Recall Held Bill'>F9 Recall</button>
        <button className='button primary pos-fab' disabled={cart.length === 0} onClick={() => setShowPayModal(true)} title='F4 — Pay'>F4 Pay</button>
      </div>

      {/* ── CART TABLE ── */}
      <div className='pos-cart-area'>
        {cart.length === 0 ? (
          <div className='pos-empty-cart'>
            <Package size={48} className='pos-empty-icon' />
            <p>Scan a product or press <kbd>F2</kbd> to add items</p>
          </div>
        ) : (
          <table className='pos-cart-table'>
            <thead>
              <tr>
                <th>Product</th><th className='num'>Qty</th><th className='num'>Unit Price</th>
                <th className='num'>Disc%</th><th className='num'>Tax%</th><th className='num'>Total</th><th></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((l, i) => {
                const info = stockDiscrepancies.find(x => x.line.product_variant_id === l.product_variant_id)
                const avail = info ? info.available : l.available_quantity
                const isShort = info?.isShort ?? false
                return (
                  <tr key={l.product_variant_id} className='pos-cart-row'>
                    <td>
                      <span className='pos-prod-name'>{l.product_name}</span>
                      <small className='pos-prod-sub' style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <span>{l.product_code} · {l.variant_name}</span>
                        {isShort ? (
                          <span style={{ color: '#dc2626', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            ⚠️ 0 at this location
                            {info?.bestOther && (
                              <button
                                type="button"
                                style={{
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: 4,
                                  padding: '1px 6px',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                                onClick={() => switchToLocation(info.bestOther!)}
                              >
                                Switch to {info.bestOther.warehouse_name} ({Number(info.bestOther.available_quantity).toFixed(0)} available)
                              </button>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: '#059669', fontWeight: 600 }}>
                            · Stock: {avail.toFixed(0)}
                          </span>
                        )}
                      </small>
                    </td>
                    <td className='num'>
                      <div className='pos-qty-cell'>
                        <button className='pos-qty-btn' onClick={() => updateQty(i, l.quantity - 1)}>−</button>
                        <input className='pos-qty-input' type='number' min={1} value={l.quantity} onChange={e => updateQty(i, parseFloat(e.target.value) || 0)} />
                        <button className='pos-qty-btn' onClick={() => updateQty(i, l.quantity + 1)}>+</button>
                      </div>
                    </td>
                    <td className='num'>
                      <input className='pos-price-input' type='number' min={0} value={l.unit_price}
                        onChange={e => setCart(c => c.map((x, xi) => xi === i ? calcLine({ ...x, unit_price: parseFloat(e.target.value) || 0 }) : x))} />
                    </td>
                    <td className='num'>
                      <input className='pos-price-input' type='number' min={0} max={100} value={l.discount_value}
                        onChange={e => updateDisc(i, 'percentage', parseFloat(e.target.value) || 0)} />
                    </td>
                    <td className='num'><span className='pos-taxrate'>{l.tax_rate}%</span></td>
                    <td className='num pos-linetotal'>{cash(l.line_total)}</td>
                    <td><button className='pos-remove-btn' onClick={() => setCart(c => c.filter((_, xi) => xi !== i))}><Trash2 size={14} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── TOTALS BAR ── */}
      <footer className='pos-totals-bar'>
        <span>Lines: <b>{cart.length}</b></span>
        <span className='pos-grand'>Grand Total: <b className='pos-grand-amount'>{cash(gt)}</b></span>
      </footer>

      {/* ── THERMAL RECEIPT (80mm print template) ── */}
      {lastReceipt && (
        <div id="pos-thermal-receipt" className='receipt-only print-only pos-receipt-print'>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Baby Bloom</h2>
            <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 800, textTransform: 'uppercase' }}>Official Tax Invoice / Receipt</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 700 }}>Branch: {lastReceipt.branchName}</p>
          </div>
          <div style={{ borderTop: '2px solid #000', margin: '6px 0' }} />
          <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>INVOICE:</span>
              <strong style={{ fontWeight: 900 }}>{lastReceipt.number}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>DATE:</span>
              <span>{lastReceipt.date}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>CUSTOMER:</span>
              <span style={{ fontWeight: 800 }}>{lastReceipt.customerName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>PAYMENT:</span>
              <strong style={{ fontWeight: 900 }}>{lastReceipt.paymentMethod}</strong>
            </div>
          </div>
          <div style={{ borderTop: '2px solid #000', margin: '6px 0' }} />
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', fontWeight: 700 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #000', textAlign: 'left', fontWeight: 900, textTransform: 'uppercase' }}>
                <th style={{ padding: '3px 0' }}>Item</th>
                <th style={{ textAlign: 'right', padding: '3px 0' }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '3px 0' }}>Price</th>
                <th style={{ textAlign: 'right', padding: '3px 0' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {lastReceipt.items.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px dashed #666' }}>
                  <td style={{ padding: '4px 0', fontWeight: 800, fontSize: 12.5 }}>
                    {item.name} {item.variant && item.variant !== 'Default' ? `(${item.variant})` : ''}
                  </td>
                  <td style={{ textAlign: 'right', verticalAlign: 'top', fontWeight: 800, padding: '4px 0' }}>{item.qty}</td>
                  <td style={{ textAlign: 'right', verticalAlign: 'top', fontWeight: 700, padding: '4px 0' }}>{cash(item.price)}</td>
                  <td style={{ textAlign: 'right', verticalAlign: 'top', fontWeight: 900, padding: '4px 0' }}>{cash(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderTop: '2px solid #000', margin: '6px 0' }} />
          <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3, fontWeight: 700 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span>
              <span style={{ fontWeight: 800 }}>{cash(lastReceipt.subtotal)}</span>
            </div>
            {lastReceipt.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                <span>Discount:</span>
                <span>-{cash(lastReceipt.discount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 17, borderTop: '2.5px solid #000', borderBottom: '2.5px solid #000', padding: '5px 0', margin: '4px 0' }}>
              <span>GRAND TOTAL:</span>
              <span>{cash(lastReceipt.grandTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Amount Tendered:</span>
              <span style={{ fontWeight: 800 }}>{cash(lastReceipt.tendered)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Paid to Invoice:</span>
              <span style={{ fontWeight: 800 }}>{cash(lastReceipt.paid)}</span>
            </div>
            {lastReceipt.change > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 15, padding: '2px 0' }}>
                <span>CHANGE RETURNED:</span>
                <span style={{ fontWeight: 900 }}>{cash(lastReceipt.change)}</span>
              </div>
            )}
            {lastReceipt.balance > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 14 }}>
                <span>Balance Due:</span>
                <span>{cash(lastReceipt.balance)}</span>
              </div>
            )}
          </div>
          <div style={{ borderTop: '2px solid #000', margin: '8px 0 6px' }} />
          <div style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 800, lineHeight: 1.4 }}>
            <div>*** Thank you for shopping with Baby Bloom! ***</div>
            <div>Exchange within 7 days with original invoice.</div>
          </div>
        </div>
      )}

      {/* ── PRODUCT SEARCH MODAL ── */}
      {showProductModal && (
        <div className='modal-overlay' onClick={() => { setShowProductModal(false); focusScan() }}>
          <div className='modal-box pos-product-modal' onClick={e => e.stopPropagation()}>
            <div className='modal-header'><h3>Product Search</h3><button className='modal-close' onClick={() => { setShowProductModal(false); focusScan() }}><XCircle size={20}/></button></div>
            <input className='text-input' placeholder='Name, code, SKU or barcode…' autoFocus value={productSearch} onChange={e => setProductSearch(e.target.value)} />
            {products.isLoading ? <div className='panel-state'>Searching…</div> : (
              <div className='pos-product-list'>
                {products.data?.map(p => (
                  <button key={p.product_variant_id} className='pos-product-card' onClick={() => void addProduct(p)}>
                    <div className='pos-pcard-name'>{p.product_name}<small>{p.variant_name}</small></div>
                    <div className='pos-pcard-meta'>
                      {p.product_code} · {p.available_quantity > 0 ? (
                        <span style={{ color: '#059669', fontWeight: 600 }}>{p.available_quantity.toFixed(0)} in stock</span>
                      ) : (p.company_available_quantity ?? 0) > 0 ? (
                        <span style={{ color: '#2563eb', fontWeight: 600 }}>0 here ({p.company_available_quantity?.toFixed(0)} in another warehouse - click to switch)</span>
                      ) : (
                        <span style={{ color: '#dc2626' }}>0 in stock</span>
                      )}
                    </div>
                    <div className='pos-pcard-price'>{cash(p.retail_price)}</div>
                  </button>
                ))}
                {(products.data?.length ?? 0) === 0 && !products.isLoading && <div className='panel-state'>No products found</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PAYMENT MODAL ── */}
      {showPayModal && (
        <div className='modal-overlay'>
          <div className='modal-box pos-pay-modal'>
            <div className='modal-header'><h3>Collect Payment</h3><button className='modal-close' onClick={() => { setShowPayModal(false); focusScan() }}><XCircle size={20}/></button></div>
            <div className='pos-pay-total'>{cash(gt)}</div>
            <div className='pos-denominations'>
              {denominations.map(d => (
                <button key={d} className='pos-denom-btn' onClick={() => setTender(t => ({ ...t, cash: t.cash + d }))}>
                  +{d}
                </button>
              ))}
              <button className='pos-denom-btn pos-exact' onClick={() => setTender(t => ({ ...t, cash: Math.max(gt - t.card - t.cheque - t.credit, 0) }))}>Exact</button>
            </div>
            <div className='pos-tender-rows'>
              {[['cash','Cash'],['card','Card'],['cheque','Cheque'],['credit','Credit']].map(([key, label]) => (
                <label key={key} className='pos-tender-row'>
                  <span>{label}</span>
                  <input className='pos-tender-input' type='number' min={0} step={0.01}
                    value={tender[key as keyof PosTender] || ''}
                    onChange={e => setTender(t => ({ ...t, [key as keyof PosTender]: parseFloat(e.target.value) || 0 }))} />
                </label>
              ))}
            </div>
            <div className='pos-pay-summary'>
              <span>Tendered <b>{cash(tendered)}</b></span>
              {change > 0 && <span className='pos-change'>Change <b>{cash(change)}</b></span>}
              {balance > 0 && <span className='pos-balance-due'>Balance <b>{cash(balance)}</b></span>}
            </div>
            {hasStockError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
                <strong>⚠️ Insufficient Stock at Current Location:</strong> "{shortLines[0]?.line.product_name}" has {shortLines[0]?.available.toFixed(0)} available at this location (requested {shortLines[0]?.line.quantity}).
                {shortLines[0]?.bestOther && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span>
                      Stock of <strong>{Number(shortLines[0].bestOther.available_quantity).toFixed(0)} units</strong> exists in <strong>{shortLines[0].bestOther.warehouse_name} ({shortLines[0].bestOther.location_name})</strong>!
                    </span>
                    <button
                      type="button"
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontWeight: 600,
                        whiteSpace: 'nowrap'
                      }}
                      onClick={() => {
                        if (shortLines[0]?.bestOther) {
                          switchToLocation(shortLines[0].bestOther)
                          setShowPayModal(false)
                        }
                      }}
                    >
                      Switch Location &amp; Continue
                    </button>
                  </div>
                )}
              </div>
            )}
            {notice && <div className='inline-error'>{notice}</div>}
            <div className='pos-pay-actions'>
              <button className='button secondary' onClick={() => { setTender({ cash: 0, card: 0, cheque: 0, credit: 0 }); setShowPayModal(false); focusScan() }}>Cancel</button>
              <button className='button primary' disabled={postMutation.isPending || hasStockError || (invoiceType !== 'credit' && tendered < gt)} onClick={() => postMutation.mutate()}>
                {postMutation.isPending ? 'Posting…' : <><Printer size={15}/> Confirm & Print</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HELD BILLS MODAL ── */}
      {showHeldModal && (
        <div className='modal-overlay' onClick={() => { setShowHeldModal(false); focusScan() }}>
          <div className='modal-box pos-held-modal' onClick={e => e.stopPropagation()}>
            <div className='modal-header'><h3>Held Bills</h3><button className='modal-close' onClick={() => { setShowHeldModal(false); focusScan() }}><XCircle size={20}/></button></div>
            {held.isLoading ? <div className='panel-state'>Loading…</div> : (
              <div className='pos-held-list'>
                {held.data?.map(inv => (
                  <div key={inv.id} className='pos-held-card'>
                    <div className='pos-held-info'>
                      <strong>{inv.invoice_number}</strong>
                      <small>{inv.customer_name} · {cash(inv.grand_total)}</small>
                    </div>
                    <button className='button primary pos-recall-btn' onClick={() => recallMutation.mutate(inv.id)}>
                      <PlayCircle size={14}/> Recall
                    </button>
                    <button className='button secondary pos-cancel-held-btn' onClick={() => invoiceAction('cancel', inv.id, 'Dismissed from held list').then(() => qc.invalidateQueries({ queryKey: ['sales','held'] })).catch(e => notify(getErrorMessage(e)))}>
                      <Pause size={14}/>
                    </button>
                  </div>
                ))}
                {(held.data?.length ?? 0) === 0 && !held.isLoading && <div className='panel-state'>No held bills</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
