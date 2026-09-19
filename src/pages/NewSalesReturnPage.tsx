import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Search, Trash2, CheckCircle2, FileCheck, Printer,
  RotateCcw, AlertCircle, ShoppingBag, CreditCard, Banknote,
  Building2, Package, Sparkles, X, Plus, Minus, User, Calendar,
  MapPin, Tag, RefreshCw
} from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { listLookup } from '../services/masterData'
import {
  listInvoices, returnEligibility, createSalesReturnDraft,
  salesReturnAction, listPosProducts
} from '../services/sales'
import { useBranchStore } from '../stores/branchStore'
import { colomboNow, formatBusinessDate } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import type { SalesInvoiceRow, PosProduct } from '../types/sales'

interface ReturnLineItem {
  key: string
  original_invoice_item_id: string | null
  product_variant_id: string
  product_name: string
  sku: string
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
  invoice_number?: string
  total_amount: number
  date: string
  items: Array<{
    name: string
    quantity: number
    unit_price: number
    condition: string
  }>
}

const money = (n: number | null | undefined) =>
  `Rs. ${Number(n ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`

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
  const [branchId, setBranchId] = useState(currentBranchId || '')
  const [warehouseId, setWarehouseId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [returnDate, setReturnDate] = useState(colomboNow().format('YYYY-MM-DD'))
  const [settlementType, setSettlementType] = useState<'cash_refund' | 'bank_refund' | 'customer_credit'>('customer_credit')
  const [bankAccountId, setBankAccountId] = useState('')
  const [reason, setReason] = useState('Customer Return')
  const [notes, setNotes] = useState('')

  // Lines State
  const [lines, setLines] = useState<ReturnLineItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Product search for unlinked return
  const [productSearch, setProductSearch] = useState('')

  // Post-completion modal
  const [completedReturn, setCompletedReturn] = useState<CompletedReturnInfo | null>(null)

  // Lookups
  const { data: branches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches', 'name'),
  })

  const { data: warehouses = [] } = useQuery({
    queryKey: ['lookup', 'warehouses', branchId],
    queryFn: () => listLookup('warehouses', 'name', { branch_id: branchId, is_active: true }),
    enabled: !!branchId,
  })

  const effectiveWarehouseId = warehouseId || warehouses[0]?.value || ''

  const { data: locations = [] } = useQuery({
    queryKey: ['lookup', 'locations', effectiveWarehouseId],
    queryFn: () => listLookup('stock_locations', 'name', { warehouse_id: effectiveWarehouseId, is_active: true }),
    enabled: !!effectiveWarehouseId,
  })

  const effectiveLocationId = locationId || locations[0]?.value || ''

  const { data: customers = [] } = useQuery({
    queryKey: ['lookup', 'customers'],
    queryFn: () => listLookup('customers', 'name', { is_active: true }),
  })

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['lookup', 'bank_accounts'],
    queryFn: () => listLookup('bank_accounts', 'account_name', { is_active: true }),
  })

  // Invoices lookup query
  const { data: invoiceResults, isLoading: searchingInvoices } = useQuery({
    queryKey: ['sales-invoices-lookup', invoiceSearch, branchId],
    queryFn: () => listInvoices({
      status: 'posted',
      search: invoiceSearch,
      branchId: branchId || undefined,
      pageSize: 8,
    }),
    enabled: isLinked && invoiceSearch.trim().length >= 2,
  })

  // Product search for standalone return
  const { data: foundProducts = [] } = useQuery({
    queryKey: ['pos-product-search-return', productSearch, effectiveLocationId],
    queryFn: async () => {
      const res = await listPosProducts(productSearch, effectiveLocationId || undefined)
      return res.slice(0, 10)
    },
    enabled: !isLinked && productSearch.trim().length >= 2,
  })

  // When an invoice is selected, load its eligible lines
  const handleSelectInvoice = async (inv: SalesInvoiceRow) => {
    setSelectedInvoice(inv)
    setCustomerId(inv.customer_id)
    setBranchId(inv.branch_id)
    setWarehouseId(inv.warehouse_id)
    setLocationId(inv.stock_location_id)
    setInvoiceSearch('')
    setErrorMsg(null)

    try {
      const eligible = await returnEligibility(inv.id)
      const mapped: ReturnLineItem[] = eligible.map((e) => ({
        key: e.original_invoice_item_id,
        original_invoice_item_id: e.original_invoice_item_id,
        product_variant_id: e.product_variant_id,
        product_name: `${e.product_name} ${e.variant_name ? `(${e.variant_name})` : ''}`,
        sku: e.sku || e.product_code,
        sold_quantity: Number(e.sold_quantity),
        returned_quantity: Number(e.returned_quantity),
        eligible_quantity: Number(e.eligible_quantity),
        return_quantity: Number(e.eligible_quantity) > 0 ? 1 : 0,
        unit_price: Number(e.historical_unit_price),
        cost_price: Number(e.historical_cost_price ?? 0),
        restock_condition: 'good',
        remarks: '',
      }))
      setLines(mapped.filter((m) => m.eligible_quantity > 0))
    } catch (err) {
      setErrorMsg(getErrorMessage(err))
    }
  }

  const addStandaloneProduct = (p: PosProduct) => {
    if (lines.some((l) => l.product_variant_id === p.product_variant_id)) {
      setNotice('This item is already added to return lines.')
      return
    }
    const newLine: ReturnLineItem = {
      key: crypto.randomUUID(),
      original_invoice_item_id: null,
      product_variant_id: p.product_variant_id,
      product_name: `${p.product_name} ${p.variant_name ? `(${p.variant_name})` : ''}`,
      sku: p.sku || p.product_code,
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
  }

  // Batch line quantity adjusters
  const handleSetAllMax = () => {
    setLines(lines.map((l) => ({ ...l, return_quantity: l.eligible_quantity })))
  }

  const handleResetAllZero = () => {
    setLines(lines.map((l) => ({ ...l, return_quantity: 0 })))
  }

  // Totals calculations
  const activeLines = lines.filter((l) => l.return_quantity > 0)
  const totalUnits = activeLines.reduce((acc, l) => acc + l.return_quantity, 0)
  const grandTotal = activeLines.reduce((acc, l) => acc + (l.return_quantity * l.unit_price), 0)

  // Save Return Mutation
  const saveMutation = useMutation({
    mutationFn: async (shouldPost: boolean) => {
      if (!customerId) throw new Error('Please select or verify the customer.')
      if (!branchId || !effectiveWarehouseId || !effectiveLocationId) {
        throw new Error('Branch, warehouse, and stock location are required.')
      }
      if (!reason.trim()) throw new Error('Return reason is required.')

      if (activeLines.length === 0) {
        throw new Error('Please enter a return quantity for at least one item.')
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
        branch_id: branchId,
        warehouse_id: effectiveWarehouseId,
        stock_location_id: effectiveLocationId,
        sales_invoice_id: isLinked ? selectedInvoice?.id : null,
        invoice_id: isLinked ? selectedInvoice?.id : null,
        customer_id: customerId,
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
      }))

      // 1. Create draft return
      const draftRes = await createSalesReturnDraft(header, items)

      // 2. If shouldPost, post atomically
      if (shouldPost) {
        const postRes = await salesReturnAction('post', draftRes.id)
        return {
          id: postRes.id,
          document_number: postRes.document_number,
          posted: true,
          settlement_type: settlementType,
          customer_name: customers.find((c) => c.value === customerId)?.label || selectedInvoice?.customer_name || 'Customer',
          invoice_number: selectedInvoice?.invoice_number,
          total_amount: grandTotal,
          date: returnDate,
          items: activeLines.map((l) => ({
            name: l.product_name,
            quantity: l.return_quantity,
            unit_price: l.unit_price,
            condition: l.restock_condition,
          })),
        }
      }

      return {
        id: draftRes.id,
        document_number: draftRes.document_number,
        posted: false,
        settlement_type: settlementType,
        customer_name: customers.find((c) => c.value === customerId)?.label || selectedInvoice?.customer_name || 'Customer',
        invoice_number: selectedInvoice?.invoice_number,
        total_amount: grandTotal,
        date: returnDate,
        items: activeLines.map((l) => ({
          name: l.product_name,
          quantity: l.return_quantity,
          unit_price: l.unit_price,
          condition: l.restock_condition,
        })),
      }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] })
      queryClient.invalidateQueries({ queryKey: ['current-stock'] })
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })

      setCompletedReturn(res)
    },
    onError: (err) => {
      setErrorMsg(getErrorMessage(err))
    },
  })

  // Format settlement type label
  const settlementName = (t: string) => {
    switch (t) {
      case 'cash_refund': return 'Cash Refund (Disbursed from Drawer)'
      case 'bank_refund': return 'Bank / Card Reversal'
      case 'customer_credit': return 'Customer Credit Note'
      default: return t
    }
  }

  const selectedCustomerLabel = customers.find((c) => c.value === customerId)?.label || selectedInvoice?.customer_name || 'Customer'
  const selectedBranchName = branches.find((b) => b.value === branchId)?.label || 'Main Branch'

  return (
    <div className="page-stack">
      <PageHeader
        title="Process Sales Return"
        description="Lookup customer invoices or process standalone return items with automatic stock restocking and ledger settlement."
        breadcrumbs={[
          { label: 'Sales', path: '/sales/invoices' },
          { label: 'Returns', path: '/sales/returns' },
          { label: 'New Return' },
        ]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="button secondary" onClick={() => navigate('/sales/returns')}>
              <ArrowLeft size={16} /> Returns History
            </button>
          </div>
        }
      />

      {/* Mode Switcher Pill Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div className="return-mode-pill-bar">
          <button
            type="button"
            className={`return-mode-pill ${isLinked ? 'active' : ''}`}
            onClick={() => {
              setIsLinked(true)
              setSelectedInvoice(null)
              setLines([])
              setErrorMsg(null)
            }}
          >
            <ShoppingBag size={16} />
            <span>Invoice-Linked Return</span>
            <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.18)', padding: '2px 6px', borderRadius: '4px' }}>
              Audit-Safe
            </span>
          </button>
          <button
            type="button"
            className={`return-mode-pill ${!isLinked ? 'active' : ''}`}
            onClick={() => {
              setIsLinked(false)
              setSelectedInvoice(null)
              setLines([])
              setErrorMsg(null)
            }}
          >
            <Package size={16} />
            <span>Standalone Return</span>
            <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.18)', padding: '2px 6px', borderRadius: '4px' }}>
              Direct Restock
            </span>
          </button>
        </div>

        {isLinked && (
          <div style={{ fontSize: '12px', color: '#65746d', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} style={{ color: '#1d684f' }} />
            <span>Historical cost price & eligible balance will be automatically verified against original invoice.</span>
          </div>
        )}
      </div>

      {/* Notices */}
      {notice && (
        <div className="login-notice" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#eef7f2', borderColor: '#80bca4', color: '#123c2f' }}>
          <CheckCircle2 size={16} color="#1d684f" />
          <span>{notice}</span>
          <button style={{ marginLeft: 'auto', background: 'transparent', cursor: 'pointer' }} onClick={() => setNotice(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="login-notice" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fef3f2', borderColor: '#fecdca', color: '#b42318' }}>
          <AlertCircle size={16} color="#b42318" />
          <span style={{ flex: 1 }}>{errorMsg}</span>
          <button style={{ background: 'transparent', cursor: 'pointer' }} onClick={() => setErrorMsg(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2-Column Responsive Workspace Grid */}
      <div className="sales-return-shell">
        {/* Left Column: Lookup & Items Management */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header Card: Invoice Search or Standalone Parameters */}
          {isLinked ? (
            <div className="return-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#17211d', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Search size={18} color="#1d684f" />
                  <span>Select Original Sales Invoice</span>
                </h3>
                {selectedInvoice && (
                  <button
                    className="button secondary"
                    style={{ minHeight: '28px', padding: '0 10px', fontSize: '11px', gap: '4px' }}
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
                <div>
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="search-input" style={{ flex: 1, minHeight: '42px', padding: '0 12px' }}>
                        <Search size={16} color="#65746d" />
                        <input
                          type="text"
                          autoFocus
                          placeholder="Search by invoice number (e.g. INV-000001) or customer name..."
                          value={invoiceSearch}
                          onChange={(e) => setInvoiceSearch(e.target.value)}
                        />
                        {invoiceSearch && (
                          <button onClick={() => setInvoiceSearch('')} title="Clear">
                            <X size={14} color="#65746d" />
                          </button>
                        )}
                      </div>
                    </div>

                    {searchingInvoices && (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#1d684f', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="spinner" style={{ width: '14px', height: '14px' }} />
                        Searching invoices...
                      </div>
                    )}

                    {/* Invoice Search Dropdown Results */}
                    {invoiceResults && invoiceResults.rows.length > 0 && (
                      <div style={{
                        marginTop: '8px',
                        background: '#ffffff',
                        border: '1px solid #cfd9d4',
                        borderRadius: '9px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
                        maxHeight: '280px',
                        overflowY: 'auto',
                        zIndex: 10,
                      }}>
                        {invoiceResults.rows.map((inv) => (
                          <div
                            key={inv.id}
                            onClick={() => handleSelectInvoice(inv)}
                            style={{
                              padding: '11px 16px',
                              borderBottom: '1px solid #edf0ee',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              transition: 'background 0.12s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f8f6')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong style={{ color: '#17503e', fontSize: '14px' }}>{inv.invoice_number}</strong>
                                <span style={{
                                  fontSize: '11px',
                                  padding: '2px 7px',
                                  borderRadius: '999px',
                                  background: '#e3f5ea',
                                  color: '#17603f',
                                  fontWeight: 600,
                                }}>
                                  {inv.status.toUpperCase()}
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', color: '#17211d', marginTop: '2px', fontWeight: 500 }}>
                                {inv.customer_name} {inv.customer_code ? `(${inv.customer_code})` : ''}
                              </div>
                              <div style={{ fontSize: '11px', color: '#65746d', marginTop: '2px' }}>
                                📅 {formatBusinessDate(inv.invoice_date)} · 🏢 {inv.branch_name}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1d684f' }}>
                                {money(inv.grand_total)}
                              </div>
                              <div style={{ fontSize: '11px', color: '#65746d', marginTop: '2px' }}>
                                Select to return &rarr;
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {invoiceResults && invoiceResults.rows.length === 0 && invoiceSearch.length >= 2 && !searchingInvoices && (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#65746d', fontSize: '12px' }}>
                        No posted invoices found matching "{invoiceSearch}".
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Selected Invoice Rich Overview Banner */
                <div style={{
                  background: 'linear-gradient(135deg, #eef7f2, #e4f1eb)',
                  border: '1px solid #b2d9c7',
                  borderRadius: '10px',
                  padding: '16px 18px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: 750, letterSpacing: '0.08em', color: '#17503e', textTransform: 'uppercase' }}>
                        Linked Sales Invoice
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#0b2a21', marginTop: '2px' }}>
                        {selectedInvoice.invoice_number}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', color: '#65746d', textTransform: 'uppercase' }}>Invoice Grand Total</div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#17503e' }}>
                        {money(selectedInvoice.grand_total)}
                      </div>
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    marginTop: '14px',
                    paddingTop: '12px',
                    borderTop: '1px solid rgba(23, 80, 62, 0.15)',
                    fontSize: '12px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <User size={15} color="#17503e" />
                      <div>
                        <span style={{ color: '#65746d', fontSize: '10px', display: 'block' }}>Customer</span>
                        <strong style={{ color: '#17211d' }}>{selectedInvoice.customer_name}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={15} color="#17503e" />
                      <div>
                        <span style={{ color: '#65746d', fontSize: '10px', display: 'block' }}>Sale Date</span>
                        <strong style={{ color: '#17211d' }}>{formatBusinessDate(selectedInvoice.invoice_date)}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MapPin size={15} color="#17503e" />
                      <div>
                        <span style={{ color: '#65746d', fontSize: '10px', display: 'block' }}>Branch & Location</span>
                        <strong style={{ color: '#17211d' }}>
                          {selectedInvoice.branch_name} · {selectedInvoice.location_name}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Standalone Return Header Settings */
            <div className="return-card" style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: 700, color: '#17211d', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={18} color="#1d684f" />
                <span>Return Warehouse & Customer Configuration</span>
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <label className="form-field">
                  <span className="field-label" style={{ margin: '0 0 5px 0' }}>Customer *</span>
                  <select
                    className="text-input"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">Select Customer</option>
                    {customers.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span className="field-label" style={{ margin: '0 0 5px 0' }}>Branch *</span>
                  <select
                    className="text-input"
                    value={branchId}
                    onChange={(e) => {
                      setBranchId(e.target.value)
                      setWarehouseId('')
                      setLocationId('')
                    }}
                  >
                    <option value="">Select Branch</option>
                    {branches.map((b) => (
                      <option key={b.value} value={b.value}>{b.label}</option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span className="field-label" style={{ margin: '0 0 5px 0' }}>Warehouse *</span>
                  <select
                    className="text-input"
                    value={effectiveWarehouseId}
                    onChange={(e) => {
                      setWarehouseId(e.target.value)
                      setLocationId('')
                    }}
                  >
                    <option value="">Select Warehouse</option>
                    {warehouses.map((w) => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                </label>

                <label className="form-field">
                  <span className="field-label" style={{ margin: '0 0 5px 0' }}>Restock Location *</span>
                  <select
                    className="text-input"
                    value={effectiveLocationId}
                    onChange={(e) => setLocationId(e.target.value)}
                  >
                    <option value="">Select Stock Location</option>
                    {locations.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* Items Section */}
          <div className="return-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#17211d' }}>
                  Returned Items List
                </h3>
                <span style={{ fontSize: '11px', color: '#65746d' }}>
                  {isLinked
                    ? 'Adjust the return quantities below. Stock will be restored at the exact historical sale cost.'
                    : 'Search catalogue products below to add standalone return items.'}
                </span>
              </div>

              {/* Batch Tools for Linked Returns */}
              {isLinked && lines.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="button secondary"
                    style={{ minHeight: '28px', padding: '0 10px', fontSize: '11px' }}
                    onClick={handleSetAllMax}
                  >
                    Return All (Full Order)
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    style={{ minHeight: '28px', padding: '0 10px', fontSize: '11px' }}
                    onClick={handleResetAllZero}
                  >
                    Clear All (0)
                  </button>
                </div>
              )}

              {/* Standalone Product Search Input */}
              {!isLinked && (
                <div style={{ position: 'relative', width: '320px' }}>
                  <div className="search-input" style={{ minHeight: '34px', padding: '0 10px' }}>
                    <Search size={14} color="#65746d" />
                    <input
                      type="text"
                      placeholder="Add item by name or barcode..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                    {productSearch && (
                      <button onClick={() => setProductSearch('')}>
                        <X size={12} color="#65746d" />
                      </button>
                    )}
                  </div>

                  {foundProducts.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: '38px',
                      left: 0,
                      right: 0,
                      background: '#ffffff',
                      border: '1px solid #cfd9d4',
                      borderRadius: '8px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      zIndex: 20,
                    }}>
                      {foundProducts.map((p) => (
                        <div
                          key={p.product_variant_id}
                          onClick={() => addStandaloneProduct(p)}
                          style={{
                            padding: '9px 12px',
                            borderBottom: '1px solid #edf0ee',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f8f6')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                        >
                          <div>
                            <strong style={{ fontSize: '12px', color: '#17211d' }}>{p.product_name}</strong>
                            {p.variant_name && <span style={{ color: '#65746d', fontSize: '11px', marginLeft: '4px' }}>({p.variant_name})</span>}
                            <div style={{ fontSize: '10px', color: '#65746d' }}>SKU: {p.sku || p.product_code}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d684f' }}>{money(p.retail_price)}</div>
                            <div style={{ fontSize: '10px', color: '#65746d' }}>Stock: {p.available_quantity}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Empty state or lines table */}
            {lines.length === 0 ? (
              <div style={{
                padding: '48px 24px',
                textAlign: 'center',
                border: '1.5px dashed #dbe3df',
                borderRadius: '10px',
                background: '#fafcfb',
              }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#eef7f2', color: '#1d684f', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
                  <RotateCcw size={22} />
                </div>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#17211d' }}>
                  {isLinked ? 'No Invoice Selected' : 'No Items Added Yet'}
                </h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#65746d', maxWidth: '380px', marginInline: 'auto' }}>
                  {isLinked
                    ? 'Search and select a posted sales invoice above to populate return-eligible items.'
                    : 'Search for products in the catalog search bar above to include them in this return.'}
                </p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="align-left" style={{ minWidth: '200px' }}>Product & SKU</th>
                      {isLinked && <th className="align-center" style={{ width: '130px' }}>Sold / Ret</th>}
                      <th className="align-center" style={{ width: '150px' }}>Return Qty</th>
                      <th className="align-right" style={{ width: '110px' }}>Unit Refund</th>
                      <th className="align-center" style={{ width: '160px' }}>Stock Condition</th>
                      <th className="align-right" style={{ width: '120px' }}>Refund Total</th>
                      <th className="align-center" style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => {
                      const isActive = line.return_quantity > 0
                      return (
                        <tr
                          key={line.key}
                          style={{
                            background: isActive ? '#f8fbf9' : 'transparent',
                            transition: 'background 0.12s',
                          }}
                        >
                          <td className="align-left">
                            <strong style={{ color: '#17211d', fontSize: '13px' }}>{line.product_name}</strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                              <span style={{ fontSize: '10px', color: '#65746d' }}>SKU: {line.sku}</span>
                              {line.cost_price > 0 && (
                                <span style={{ fontSize: '10px', color: '#17503e', background: '#eef7f2', padding: '1px 5px', borderRadius: '3px' }}>
                                  Cost: {money(line.cost_price)}
                                </span>
                              )}
                            </div>
                            {/* Inline optional note */}
                            <input
                              type="text"
                              placeholder="Defect / line remark (optional)..."
                              value={line.remarks}
                              onChange={(e) => {
                                const val = e.target.value
                                setLines(lines.map((item, i) => (i === idx ? { ...item, remarks: val } : item)))
                              }}
                              style={{
                                width: '100%',
                                marginTop: '4px',
                                padding: '3px 7px',
                                fontSize: '11px',
                                border: '1px solid #e0e6e3',
                                borderRadius: '4px',
                                background: '#ffffff',
                              }}
                            />
                          </td>

                          {/* Sold / Returned Details for Linked Return */}
                          {isLinked && (
                            <td className="align-center">
                              <div style={{ fontSize: '12px', fontWeight: 600, color: '#17211d' }}>
                                {line.sold_quantity} sold
                              </div>
                              <div style={{ fontSize: '10px', color: '#65746d' }}>
                                ({line.returned_quantity} returned)
                              </div>
                              <div style={{ fontSize: '10px', color: '#1d684f', fontWeight: 600, marginTop: '2px' }}>
                                {line.eligible_quantity} eligible
                              </div>
                            </td>
                          )}

                          {/* Stepper Input */}
                          <td className="align-center">
                            <div className="return-stepper">
                              <button
                                type="button"
                                className="return-stepper-btn"
                                disabled={line.return_quantity <= 0}
                                onClick={() => {
                                  setLines(lines.map((item, i) => (i === idx ? { ...item, return_quantity: Math.max(0, item.return_quantity - 1) } : item)))
                                }}
                              >
                                <Minus size={12} />
                              </button>
                              <input
                                type="number"
                                min={0}
                                max={isLinked ? line.eligible_quantity : 9999}
                                value={line.return_quantity}
                                onChange={(e) => {
                                  const val = Math.max(0, Number(e.target.value))
                                  const capped = isLinked ? Math.min(line.eligible_quantity, val) : val
                                  setLines(lines.map((item, i) => (i === idx ? { ...item, return_quantity: capped } : item)))
                                }}
                                className="return-stepper-input"
                              />
                              <button
                                type="button"
                                className="return-stepper-btn"
                                disabled={isLinked && line.return_quantity >= line.eligible_quantity}
                                onClick={() => {
                                  const nextVal = line.return_quantity + 1
                                  const capped = isLinked ? Math.min(line.eligible_quantity, nextVal) : nextVal
                                  setLines(lines.map((item, i) => (i === idx ? { ...item, return_quantity: capped } : item)))
                                }}
                              >
                                <Plus size={12} />
                              </button>
                              {isLinked && (
                                <button
                                  type="button"
                                  className="return-stepper-max-btn"
                                  title="Return Maximum Eligible"
                                  onClick={() => {
                                    setLines(lines.map((item, i) => (i === idx ? { ...item, return_quantity: line.eligible_quantity } : item)))
                                  }}
                                >
                                  Max
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Unit Price */}
                          <td className="align-right" style={{ fontSize: '12px', fontWeight: 500, color: '#17211d' }}>
                            {money(line.unit_price)}
                          </td>

                          {/* Stock Condition */}
                          <td className="align-center">
                            <select
                              className="text-input"
                              style={{
                                height: '32px',
                                fontSize: '11px',
                                padding: '0 8px',
                                fontWeight: 600,
                                borderColor:
                                  line.restock_condition === 'good' ? '#80bca4' : line.restock_condition === 'damaged' ? '#f5b041' : '#eb5757',
                                background:
                                  line.restock_condition === 'good' ? '#eef7f2' : line.restock_condition === 'damaged' ? '#fffaf0' : '#fdf2f2',
                                color:
                                  line.restock_condition === 'good' ? '#17503e' : line.restock_condition === 'damaged' ? '#b45309' : '#b42318',
                              }}
                              value={line.restock_condition}
                              onChange={(e) => {
                                const cond = e.target.value as 'good' | 'damaged' | 'write_off'
                                setLines(lines.map((item, i) => (i === idx ? { ...item, restock_condition: cond } : item)))
                              }}
                            >
                              <option value="good">🟢 Good (Restock)</option>
                              <option value="damaged">🟠 Damaged Stock</option>
                              <option value="write_off">🔴 Write-Off (Scrap)</option>
                            </select>
                          </td>

                          {/* Line Total */}
                          <td className="align-right" style={{ fontSize: '13px', fontWeight: 700, color: isActive ? '#17503e' : '#65746d' }}>
                            {money(line.return_quantity * line.unit_price)}
                          </td>

                          {/* Remove button */}
                          <td className="align-center">
                            {!isLinked ? (
                              <button
                                className="icon-button"
                                style={{ width: '28px', height: '28px', color: '#b42318' }}
                                onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                                title="Remove line"
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : (
                              <button
                                className="icon-button"
                                style={{ width: '28px', height: '28px', color: '#65746d' }}
                                onClick={() => {
                                  setLines(lines.map((item, i) => (i === idx ? { ...item, return_quantity: 0 } : item)))
                                }}
                                title="Zero out quantity"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Settlement Summary & Action Dock */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '80px' }}>
          <div className="return-card" style={{ padding: '22px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700, color: '#17211d' }}>
              Refund & Settlement
            </h3>

            {/* Glowing Big Amount Card */}
            <div style={{
              padding: '18px 20px',
              background: 'linear-gradient(135deg, #0b2a21, #123c2f)',
              color: '#ffffff',
              borderRadius: '11px',
              boxShadow: '0 6px 18px rgba(11, 42, 33, 0.25)',
              marginBottom: '18px',
            }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: '#93cbb3', textTransform: 'uppercase', fontWeight: 750 }}>
                Total Refund Due
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#5ec99a', marginTop: '4px', letterSpacing: '-0.02em' }}>
                {money(grandTotal)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: '11px', color: '#c7dbd2' }}>
                <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  👤 {selectedCustomerLabel}
                </span>
                <span>{activeLines.length} items · {totalUnits} units</span>
              </div>
            </div>

            {/* Settlement Selection Cards */}
            <div style={{ marginBottom: '16px' }}>
              <span className="field-label" style={{ margin: '0 0 8px 0' }}>Settlement Method *</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div
                  className={`settlement-card ${settlementType === 'customer_credit' ? 'selected' : ''}`}
                  onClick={() => setSettlementType('customer_credit')}
                >
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: settlementType === 'customer_credit' ? '#dcece5' : '#eef2f0', display: 'grid', placeItems: 'center', color: '#17503e' }}>
                    <CreditCard size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#17211d' }}>Credit to Customer Account</div>
                    <div style={{ fontSize: '11px', color: '#65746d' }}>Creates customer credit note or reduces receivable</div>
                  </div>
                </div>

                <div
                  className={`settlement-card ${settlementType === 'cash_refund' ? 'selected' : ''}`}
                  onClick={() => setSettlementType('cash_refund')}
                >
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: settlementType === 'cash_refund' ? '#dcece5' : '#eef2f0', display: 'grid', placeItems: 'center', color: '#17503e' }}>
                    <Banknote size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#17211d' }}>Immediate Cash Refund</div>
                    <div style={{ fontSize: '11px', color: '#65746d' }}>Disbursed from drawer; credits Cash in Hand</div>
                  </div>
                </div>

                <div
                  className={`settlement-card ${settlementType === 'bank_refund' ? 'selected' : ''}`}
                  onClick={() => setSettlementType('bank_refund')}
                >
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: settlementType === 'bank_refund' ? '#dcece5' : '#eef2f0', display: 'grid', placeItems: 'center', color: '#17503e' }}>
                    <Building2 size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#17211d' }}>Bank / Card Reversal</div>
                    <div style={{ fontSize: '11px', color: '#65746d' }}>Disbursed via electronic bank transfer</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bank Account Selector (Only if bank_refund) */}
            {settlementType === 'bank_refund' && (
              <label className="form-field" style={{ marginBottom: '14px' }}>
                <span className="field-label" style={{ margin: '0 0 5px 0' }}>Disbursing Bank Account *</span>
                <select
                  className="text-input"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                >
                  <option value="">Select Company Bank Account</option>
                  {bankAccounts.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Return Date */}
            <label className="form-field" style={{ marginBottom: '14px' }}>
              <span className="field-label" style={{ margin: '0 0 5px 0' }}>Return Date *</span>
              <input
                type="date"
                className="text-input"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
              />
            </label>

            {/* Quick Reasons Chips */}
            <div style={{ marginBottom: '14px' }}>
              <span className="field-label" style={{ margin: '0 0 6px 0' }}>Quick Return Reason</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {QUICK_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`reason-chip ${reason === r ? 'selected' : ''}`}
                    onClick={() => setReason(r)}
                  >
                    <Tag size={10} style={{ marginRight: '4px' }} />
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                className="text-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Or type custom reason..."
              />
            </div>

            {/* Notes */}
            <label className="form-field" style={{ marginBottom: '20px' }}>
              <span className="field-label" style={{ margin: '0 0 5px 0' }}>Internal Audit Notes (Optional)</span>
              <textarea
                className="text-input"
                style={{ minHeight: '60px', padding: '8px 11px', resize: 'vertical' }}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Remarks about customer return condition, invoice verification..."
              />
            </label>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                className="button primary"
                style={{
                  height: '46px',
                  fontSize: '14px',
                  fontWeight: 700,
                  boxShadow: '0 4px 14px rgba(29, 104, 79, 0.35)',
                }}
                disabled={saveMutation.isPending || grandTotal <= 0}
                onClick={() => saveMutation.mutate(true)}
              >
                {saveMutation.isPending ? (
                  <>
                    <span className="spinner" style={{ width: '16px', height: '16px' }} />
                    Processing Return & Ledger...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    Post Return & Settle ({money(grandTotal)})
                  </>
                )}
              </button>

              <button
                type="button"
                className="button secondary"
                style={{ height: '38px', fontSize: '13px' }}
                disabled={saveMutation.isPending || grandTotal <= 0}
                onClick={() => saveMutation.mutate(false)}
              >
                <FileCheck size={16} /> Save Return as Draft
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Post-Completion & Thermal Slip Modal */}
      {completedReturn && (
        <dialog
          open
          className="confirm-dialog"
          style={{
            maxWidth: '560px',
            padding: '24px',
            border: 'none',
            borderRadius: '14px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: '#e3f5ea',
              color: '#17603f',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 12px',
            }}>
              <CheckCircle2 size={32} />
            </div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#17211d' }}>
              Sales Return {completedReturn.posted ? 'POSTED' : 'SAVED AS DRAFT'}!
            </h2>
            <div style={{ fontSize: '13px', color: '#65746d', marginTop: '4px' }}>
              Document Ref: <strong style={{ color: '#17503e' }}>{completedReturn.document_number}</strong>
            </div>
          </div>

          {/* Thermal Slip Preview Container */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #dbe3df',
            borderRadius: '8px',
            padding: '16px',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#17211d',
            marginBottom: '20px',
            maxHeight: '260px',
            overflowY: 'auto',
          }}>
            <div className="return-slip-print" style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: '15px' }}>BABY BLOOM</div>
              <div style={{ fontSize: '11px' }}>{selectedBranchName}</div>
              <div style={{ margin: '6px 0', borderBottom: '1px dashed #000', paddingBottom: '4px', fontWeight: 700 }}>
                SALES RETURN CREDIT SLIP
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', textAlign: 'left' }}>
                <span>Return #: {completedReturn.document_number}</span>
                <span>Date: {completedReturn.date}</span>
              </div>
              {completedReturn.invoice_number && (
                <div style={{ fontSize: '11px', textAlign: 'left' }}>
                  Inv Ref: {completedReturn.invoice_number}
                </div>
              )}
              <div style={{ fontSize: '11px', textAlign: 'left', marginBottom: '8px' }}>
                Customer: {completedReturn.customer_name}
              </div>

              <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '6px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>ITEM</span>
                  <span>QTY x RATE</span>
                  <span>TOTAL</span>
                </div>
                {completedReturn.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', margin: '3px 0' }}>
                    <span style={{ textAlign: 'left', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {it.name}
                    </span>
                    <span>{it.quantity} x {Number(it.unit_price).toFixed(2)}</span>
                    <span>{Number(it.quantity * it.unit_price).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '13px', margin: '8px 0 4px' }}>
                <span>TOTAL REFUND:</span>
                <span>{money(completedReturn.total_amount)}</span>
              </div>
              <div style={{ fontSize: '11px', textAlign: 'left' }}>
                Settlement: {settlementName(completedReturn.settlement_type)}
              </div>
              <div style={{ marginTop: '12px', fontSize: '10px', textAlign: 'center', color: '#555' }}>
                * Goods verified and restocked *<br />
                Thank you for your business
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button primary"
              style={{ flex: 1, minHeight: '40px', gap: '6px' }}
              onClick={() => window.print()}
            >
              <Printer size={16} /> Print Return Slip
            </button>
            <button
              type="button"
              className="button secondary"
              style={{ minHeight: '40px' }}
              onClick={() => {
                setCompletedReturn(null)
                setSelectedInvoice(null)
                setLines([])
                setInvoiceSearch('')
              }}
            >
              New Return
            </button>
            <button
              type="button"
              className="button secondary"
              style={{ minHeight: '40px' }}
              onClick={() => navigate('/sales/returns')}
            >
              Done &rarr;
            </button>
          </div>
        </dialog>
      )}
    </div>
  )
}
