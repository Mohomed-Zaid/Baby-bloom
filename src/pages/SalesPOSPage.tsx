import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Search, Trash2, ShoppingCart, Pause, PlayCircle, Printer, XCircle } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { permissions } from '../config/permissions'
import { getErrorMessage } from '../lib/errors'
import { formatBusinessDate } from '../lib/dates'
import {
  createSalesDraft, holdInvoice, recallInvoice, invoiceAction,
  listPosProducts, findPosByBarcode, listHeldInvoices
} from '../services/sales'
import { listLookup } from '../services/masterData'
import type { PosCartLine, PosProduct, PosTender, SalesDiscountType } from '../types/sales'

const CASH_CUSTOMER_CODE = 'CASH'
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

export function SalesPOSPage() {
  const allowed = useAuthStore(s => s.user?.permissions) ?? []
  const can = (k: string) => allowed.includes(k)
  const qc = useQueryClient()

  // ── State ───────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<PosCartLine[]>([])
  const [customerId, setCustomerId] = useState<string>('')
  const [branchId, setBranchId] = useState<string>('')
  const [warehouseId, setWarehouseId] = useState<string>('')
  const [locationId, setLocationId] = useState<string>('')
  const [invoiceType, setInvoiceType] = useState<'cash'|'credit'|'mixed'>('cash')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [showProductModal, setShowProductModal] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)
  const [showHeldModal, setShowHeldModal] = useState(false)
  const [tender, setTender] = useState<PosTender>({ cash: 0, card: 0, cheque: 0, credit: 0 })
  const [notice, setNotice] = useState('')
  const [lastReceipt, setLastReceipt] = useState<{number:string;total:number;paid:number;change:number}|null>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const gt = grandTotal(cart)
  const tendered = tenderTotal(tender)
  const change = Math.max(tendered - gt, 0)
  const balance = Math.max(gt - tendered, 0)

  // ── Lookups ─────────────────────────────────────────────────────────────
  const branches = useQuery({ queryKey: ['lookup','branches'], queryFn: () => listLookup('branches'), enabled: can(permissions.salesCreate) })
  const warehouses = useQuery({ queryKey: ['lookup','warehouses', branchId], queryFn: () => listLookup('warehouses', 'name', { branch_id: branchId, is_active: true }), enabled: !!branchId })
  const locations = useQuery({ queryKey: ['lookup','locations', warehouseId], queryFn: () => listLookup('stock_locations', 'name', { warehouse_id: warehouseId, is_active: true }), enabled: !!warehouseId })
  const customers = useQuery({ queryKey: ['lookup','customers'], queryFn: () => listLookup('customers', 'name'), enabled: can(permissions.salesCreate) })
  const held = useQuery({ queryKey: ['sales','held', branchId], queryFn: () => listHeldInvoices(branchId || undefined), enabled: showHeldModal && !!branchId })
  const products = useQuery({ queryKey: ['pos-products', productSearch], queryFn: () => listPosProducts(productSearch), enabled: showProductModal })

  // When lookup data arrives, auto-select the first option if nothing chosen yet.
  // Using onChange pattern on the select elements avoids setState-in-effect.
  const effectiveBranchId = branchId || branches.data?.[0]?.value || ''
  const effectiveWarehouseId = warehouseId || warehouses.data?.[0]?.value || ''
  const effectiveLocationId = locationId || locations.data?.[0]?.value || ''

  // Refocus scanner
  const focusScan = useCallback(() => { setTimeout(() => scanRef.current?.focus(), 50) }, [])
  useEffect(() => { focusScan() }, [focusScan])

  const notify = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 4000) }

  // ── Hold bill (declared before keyboard handler so F8 can reference it) ─────
  const holdBill = useCallback(async () => {
    if (!effectiveBranchId || !effectiveWarehouseId || !effectiveLocationId || !customerId) { notify('Select branch, warehouse, location and customer first'); return }
    if (cart.length === 0) { notify('Cart is empty'); return }
    try {
      const today = new Date().toISOString().slice(0, 10)
      const draft = await createSalesDraft(
        { branch_id: effectiveBranchId, warehouse_id: effectiveWarehouseId, stock_location_id: effectiveLocationId, customer_id: customerId, invoice_date: today, due_date: today, invoice_type: invoiceType },
        cart.map(l => ({ product_variant_id: l.product_variant_id, quantity: l.quantity, unit_price: l.unit_price, discount_type: l.discount_type, discount_value: l.discount_value, tax_rate: l.tax_rate })),
      )
      await holdInvoice(draft.id)
      setCart([]); setTender({ cash: 0, card: 0, cheque: 0, credit: 0 })
      notify(`Bill ${draft.document_number} held (F9 to recall)`); focusScan()
      await qc.invalidateQueries({ queryKey: ['sales','held'] })
    } catch (err) { notify(getErrorMessage(err)) }
  }, [effectiveBranchId, effectiveWarehouseId, effectiveLocationId, customerId, cart, invoiceType, focusScan, qc])

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
  const addProduct = (p: PosProduct) => {
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

  // ── Barcode scan ─────────────────────────────────────────────────────────
  const handleScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const code = barcodeInput.trim()
    setBarcodeInput('')
    if (!code) return
    try {
      const p = await findPosByBarcode(code)
      if (p) addProduct(p)
      else notify(`No product found for barcode: ${code}`)
    } catch (err) { notify(getErrorMessage(err)) }
  }

  // holdBill is defined above before the keyboard handler

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
      if (!effectiveBranchId || !effectiveWarehouseId || !effectiveLocationId || !customerId) throw new Error('Select branch, warehouse, location and customer first')
      if (cart.length === 0) throw new Error('Cart is empty')
      if (invoiceType !== 'credit' && tendered < gt) throw new Error('Tendered amount is insufficient')
      const today = new Date().toISOString().slice(0, 10)
      const payments: Array<{payment_method: string; amount: number; card_reference?: string; cheque_number?: string; cheque_date?: string}> = []
      if (tender.cash > 0) payments.push({ payment_method: 'cash', amount: tender.cash })
      if (tender.card > 0) payments.push({ payment_method: 'card', amount: tender.card, card_reference: '' })
      if (tender.cheque > 0) payments.push({ payment_method: 'cheque', amount: tender.cheque, cheque_number: '', cheque_date: today })
      if (tender.credit > 0) payments.push({ payment_method: 'customer_credit', amount: tender.credit })
      const draft = await createSalesDraft(
        { branch_id: effectiveBranchId, warehouse_id: effectiveWarehouseId, stock_location_id: effectiveLocationId, customer_id: customerId, invoice_date: today, due_date: today, invoice_type: invoiceType },
        cart.map(l => ({ product_variant_id: l.product_variant_id, quantity: l.quantity, unit_price: l.unit_price, discount_type: l.discount_type, discount_value: l.discount_value, tax_rate: l.tax_rate })),
        payments as never,
      )
      return invoiceAction('post', draft.id)
    },
    onSuccess: (r) => {
      setLastReceipt({ number: r.document_number, total: r.grand_total ?? gt, paid: r.paid_amount ?? tendered, change: r.change_amount ?? change })
      setCart([]); setTender({ cash: 0, card: 0, cheque: 0, credit: 0 }); setShowPayModal(false)
      qc.invalidateQueries({ queryKey: ['sales'] }); qc.invalidateQueries({ queryKey: ['current-stock'] })
      setTimeout(() => window.print(), 200)
    },
    onError: e => notify(getErrorMessage(e)),
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
          <select className='compact-select' value={branchId} onChange={e => { setBranchId(e.target.value); setWarehouseId(''); setLocationId('') }}>
            <option value=''>— Branch —</option>
            {branches.data?.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
          <select className='compact-select' value={warehouseId} onChange={e => { setWarehouseId(e.target.value); setLocationId('') }}>
            <option value=''>— Warehouse —</option>
            {warehouses.data?.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
          <select className='compact-select' value={locationId} onChange={e => setLocationId(e.target.value)}>
            <option value=''>— Location —</option>
            {locations.data?.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
          <select className='compact-select' value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value=''>— Customer —</option>
            {customers.data?.filter(x => x.label !== CASH_CUSTOMER_CODE).map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
          <select className='compact-select' value={invoiceType} onChange={e => setInvoiceType(e.target.value as never)}>
            <option value='cash'>Cash</option>
            <option value='credit'>Credit</option>
            <option value='mixed'>Mixed</option>
          </select>
        </div>
        <div className='pos-topbar-right'>
          <span className='pos-date'>{formatBusinessDate(new Date().toISOString().slice(0,10))}</span>
        </div>
      </header>

      {notice && <div className='inline-notice pos-notice'>{notice}</div>}

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
              {cart.map((l, i) => (
                <tr key={l.product_variant_id} className='pos-cart-row'>
                  <td>
                    <span className='pos-prod-name'>{l.product_name}</span>
                    <small className='pos-prod-sub'>{l.product_code} · {l.variant_name} · Stock: {l.available_quantity.toFixed(2)}</small>
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── TOTALS BAR ── */}
      <footer className='pos-totals-bar'>
        <span>Lines: <b>{cart.length}</b></span>
        <span className='pos-grand'>Grand Total: <b className='pos-grand-amount'>{cash(gt)}</b></span>
      </footer>

      {/* ── THERMAL RECEIPT (print only) ── */}
      {lastReceipt && (
        <div className='receipt-only print-only'>
          <div className='receipt-header'><strong>Baby Bloom</strong><br />Tax Invoice</div>
          <div className='receipt-meta'>Invoice: {lastReceipt.number}<br />Date: {new Date().toLocaleDateString('en-LK')}</div>
          <hr />
          {cart.length > 0 && cart.map(l => <div key={l.product_variant_id} className='receipt-line'><span>{l.product_name}</span><span>{l.quantity} × {cash(l.unit_price)} = {cash(l.line_total)}</span></div>)}
          <hr />
          <div className='receipt-total'>Total: {cash(lastReceipt.total)}</div>
          <div className='receipt-total'>Paid: {cash(lastReceipt.paid)}</div>
          {lastReceipt.change > 0 && <div className='receipt-total'>Change: {cash(lastReceipt.change)}</div>}
          <div className='receipt-footer'>Thank you for shopping with Baby Bloom!</div>
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
                  <button key={p.product_variant_id} className='pos-product-card' onClick={() => addProduct(p)}>
                    <div className='pos-pcard-name'>{p.product_name}<small>{p.variant_name}</small></div>
                    <div className='pos-pcard-meta'>{p.product_code} · Stock: {p.available_quantity.toFixed(2)}</div>
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
            {notice && <div className='inline-error'>{notice}</div>}
            <div className='pos-pay-actions'>
              <button className='button secondary' onClick={() => { setTender({ cash: 0, card: 0, cheque: 0, credit: 0 }); setShowPayModal(false); focusScan() }}>Cancel</button>
              <button className='button primary' disabled={postMutation.isPending || (invoiceType !== 'credit' && tendered < gt)} onClick={() => postMutation.mutate()}>
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
