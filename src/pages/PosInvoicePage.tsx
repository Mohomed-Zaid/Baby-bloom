import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, Trash2, X, ShoppingCart,
  FileText, UserPlus, AlertTriangle, Camera, Barcode as BarcodeIcon,
  PauseCircle, Clock, RotateCcw
} from 'lucide-react'
import { BarcodeScannerModal, playBarcodeBeep } from '../components/common/BarcodeScannerModal'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import { permissions } from '../config/permissions'
import { getErrorMessage } from '../lib/errors'
import {
  createSalesDraft, holdInvoice, recallInvoice, invoiceAction,
  listPosProducts, findPosByBarcode, listHeldInvoices, getInvoice
} from '../services/sales'

import { listStaff } from '../services/staffService'
import { requireSupabase, throwOnError } from '../services/client'
import { createMasterRecord, listLookup, nextMasterCode } from '../services/masterData'
import type { PosCartLine, PosProduct, SalesDiscountType, SalesInvoiceRow, CreateSalesDraftPayment, CustomerPaymentMethod } from '../types/sales'

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatRs = (n: number) => `Rs ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const calcLine = (l: PosCartLine): PosCartLine => {
  const base = l.quantity * l.unit_price
  const da = l.discount_type === 'percentage'
    ? base * (l.discount_value / 100)
    : l.discount_type === 'fixed'
      ? Math.min(l.discount_value, base)
      : 0
  const net = base - da
  const tax = net * (l.tax_rate / 100)
  return {
    ...l,
    discount_amount: Math.round(da * 100) / 100,
    line_total: Math.round((net + tax) * 100) / 100,
  }
}

interface CustomerRecord {
  id: string
  customer_code: string
  name: string
  phone?: string | null
  address?: string | null
  city?: string | null
  credit_limit: number
  credit_days: number
  price_level: string
  sms_enabled: boolean
}

interface SplitPaymentRow {
  id: string
  journalName: string
  cfPercent: number
  amount: number
  method: 'card' | 'bank_transfer' | 'cheque' | 'others'
  refNo?: string
  bankAccountId?: string
}

export function PosInvoicePage() {
  const allowed = useAuthStore(s => s.user?.permissions) ?? []
  const can = (k: string) => allowed.includes(k)
  const qc = useQueryClient()
  const selectedBranch = useBranchStore(s => s.branchId)

  // ── Header & POS State ─────────────────────────────────────────────────────
  const [invoiceDate, setInvoiceDate] = useState(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' })
  })
  const [billingType, setBillingType] = useState<'Invoice' | 'Order'>('Invoice')
  const [printTemplate, setPrintTemplate] = useState<'Default' | 'Thermal 80mm' | 'A4'>('Default')
  const [priceLevel, setPriceLevel] = useState<'Default' | 'Retail' | 'Wholesale' | 'Special'>('Default')
  const [selectedSalesRepId, setSelectedSalesRepId] = useState<string>('')
  const branchId = selectedBranch || ''
  const warehouseId = ''
  const locationId = ''

  // ── Customer State ─────────────────────────────────────────────────────────
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [customerSearchTerm, setCustomerSearchTerm] = useState<string>('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false)

  // ── Cart & Entry Strip State ───────────────────────────────────────────────
  const [cart, setCart] = useState<PosCartLine[]>([])
  const [activeItemDetails, setActiveItemDetails] = useState<PosProduct | null>(null)

  // Line Entry Inputs
  const [entryCode, setEntryCode] = useState('')
  const [entryName, setEntryName] = useState('')
  const [entryWarranty, setEntryWarranty] = useState('Select Warr')
  const [entryType, setEntryType] = useState('ISSUE')
  const [entryUnit, setEntryUnit] = useState('PCS')
  const [entryQty, setEntryQty] = useState<number>(1)
  const [entryPrice, setEntryPrice] = useState<number>(0)
  const [entryDiscountRs, setEntryDiscountRs] = useState<number>(0)
  const [entryDiscountPercent, setEntryDiscountPercent] = useState<number>(0)
  const [entryRemarks, setEntryRemarks] = useState('')
  const [entryLocationId, setEntryLocationId] = useState('')
  const [entryNote, setEntryNote] = useState('')

  // Modals & UI Toggles
  const [showProductSearchModal, setShowProductSearchModal] = useState(false)
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [showProcessEndModal, setShowProcessEndModal] = useState(false)
  const [showHeldModal, setShowHeldModal] = useState(false)
  const [showBarcodeScannerModal, setShowBarcodeScannerModal] = useState(false)
  const [quickBarcodeInput, setQuickBarcodeInput] = useState('')
  const quickBarcodeInputRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [lastReceipt, setLastReceipt] = useState<{
    number: string
    date: string
    branchName: string
    customerName: string
    customerPhone?: string
    items: Array<{ name: string; variant?: string; qty: number; price: number; discount: number; total: number }>
    subtotal: number
    discount: number
    grandTotal: number
    tendered: number
    paid: number
    change: number
    balance: number
  } | null>(null)

  // ── Process End / Payment Modal State ──────────────────────────────────────
  const [modalPaidAmount, setModalPaidAmount] = useState<number>(0)
  const [billDiscountRs, setBillDiscountRs] = useState<number>(0)
  const [billDiscountPercent, setBillDiscountPercent] = useState<number>(0)
  const [refNo, setRefNo] = useState('')
  const [poNo, setPoNo] = useState('')
  const [dueDays, setDueDays] = useState('')
  const [smsNumber, setSmsNumber] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [splitPayments, setSplitPayments] = useState<SplitPaymentRow[]>([])

  // Split Entry strip in modal
  const [splitCfPercent, setSplitCfPercent] = useState<number>(0)
  const [splitChannel, setSplitChannel] = useState('Daraz')
  const [splitAmount, setSplitAmount] = useState<number>(0)

  // Cheque Fields
  const [chequeNo, setChequeNo] = useState('')
  const [chequeBank, setChequeBank] = useState('')
  const [chequeDate, setChequeDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [chequeAmount, setChequeAmount] = useState<number>(0)

  // Card Fields
  const [cardMachine] = useState('')
  const [cardRef] = useState('')
  const [cardAmount] = useState<number>(0)

  // Quick Add Customer Form
  const [newCustName, setNewCustName] = useState('')
  const [newCustPhone, setNewCustPhone] = useState('')
  const [newCustAddress, setNewCustAddress] = useState('')
  const [newCustCreditLimit, setNewCustCreditLimit] = useState(0)
  const [newCustCreditDays, setNewCustCreditDays] = useState(30)

  // Refs for scanner autofocus
  const codeInputRef = useRef<HTMLInputElement>(null)
  const qtyInputRef = useRef<HTMLInputElement>(null)
  const paidInputRef = useRef<HTMLInputElement>(null)
  const [showProductNameDropdown, setShowProductNameDropdown] = useState(false)

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotice({ message, type })
    setTimeout(() => setNotice(null), 4500)
  }, [])

  // ── Lookups ────────────────────────────────────────────────────────────────
  const branchesQuery = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('branches')
        .select('id, name, is_head_office')
        .eq('is_active', true)
        .order('is_head_office', { ascending: false })
        .order('name', { ascending: true })
      throwOnError(error)
      return ((data ?? []) as Array<{ id: string; name: string; is_head_office: boolean }>).map((b) => ({
        value: b.id,
        label: b.is_head_office ? `🏢 ${b.name} (HQ)` : b.name,
      }))
    },
    enabled: can(permissions.salesCreate),
  })

  const effectiveBranchId = branchId || selectedBranch || branchesQuery.data?.[0]?.value || ''

  const warehousesQuery = useQuery({
    queryKey: ['lookup', 'warehouses', effectiveBranchId],
    queryFn: () => listLookup('warehouses', 'name', effectiveBranchId ? { branch_id: effectiveBranchId, is_active: true } : { is_active: true }),
    enabled: Boolean(effectiveBranchId),
  })

  const allWarehousesQuery = useQuery({
    queryKey: ['lookup', 'all-warehouses'],
    queryFn: () => listLookup('warehouses', 'name', { is_active: true }),
    enabled: warehousesQuery.isSuccess && (warehousesQuery.data?.length ?? 0) === 0,
  })

  const effectiveWarehouseId = warehouseId || warehousesQuery.data?.[0]?.value || allWarehousesQuery.data?.[0]?.value || ''

  const locationsQuery = useQuery({
    queryKey: ['lookup', 'locations', effectiveWarehouseId],
    queryFn: () => listLookup('stock_locations', 'name', effectiveWarehouseId ? { warehouse_id: effectiveWarehouseId, is_active: true } : { is_active: true }),
    enabled: Boolean(effectiveWarehouseId),
  })

  const allLocationsQuery = useQuery({
    queryKey: ['lookup', 'all-locations'],
    queryFn: () => listLookup('stock_locations', 'name', { is_active: true }),
    enabled: locationsQuery.isSuccess && (locationsQuery.data?.length ?? 0) === 0,
  })

  const effectiveLocationId = locationId || locationsQuery.data?.[0]?.value || allLocationsQuery.data?.[0]?.value || ''
  const currentEntryLocationId = entryLocationId || effectiveLocationId


  // Staff / Sales Reps
  const staffQuery = useQuery({
    queryKey: ['staff', 'active', effectiveBranchId],
    queryFn: () => listStaff({ activeOnly: true, branchId: effectiveBranchId }),
  })

  const effectiveSalesRepId = selectedSalesRepId || undefined

  // Customers Query
  const customersQuery = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('customers')
        .select('id, customer_code, name, phone, address, city, credit_limit, credit_days, price_level, sms_enabled')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('customer_code', { ascending: true })
      throwOnError(error)
      return ((data || []) as unknown) as CustomerRecord[]
    },
  })

  const defaultCashCust = customersQuery.data?.find(c =>
    c.customer_code.toLowerCase().includes('c-001') ||
    c.name.toLowerCase().includes('cash') ||
    c.name.toLowerCase().includes('walk')
  )
  const effectiveCustomerId = selectedCustomerId || defaultCashCust?.id || customersQuery.data?.[0]?.id || ''
  const selectedCustomer = customersQuery.data?.find(c => c.id === effectiveCustomerId) || null

  const effectiveSmsNumber = smsNumber !== '' ? smsNumber : (selectedCustomer?.phone || '')
  const effectiveDueDays = dueDays !== '' ? dueDays : (selectedCustomer?.credit_days ? String(selectedCustomer.credit_days) : '')

  // Customer Financial Badges (Due balance, last bill, cheques)
  const customerFinancialsQuery = useQuery({
    queryKey: ['customer-financials', effectiveCustomerId],
    queryFn: async () => {
      if (!effectiveCustomerId) return { due: 0, lastBill: 'N/A', rtnCheque: 0, chequeInHand: 0 }

      const supabase = requireSupabase()
      let due = 0
      try {
        const { data: balData } = await supabase
          .from('customer_balance')
          .select('total_outstanding')
          .eq('customer_id', effectiveCustomerId)
          .maybeSingle()
        if (balData) {
          due = Number((balData as Record<string, unknown>).total_outstanding || 0)
        }
      } catch {
        due = 0
      }

      let lastBill = 'N/A'
      try {
        const { data: invData } = await supabase
          .from('sales_invoices')
          .select('invoice_number')
          .eq('customer_id', effectiveCustomerId)
          .eq('status', 'posted')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (invData && (invData as Record<string, unknown>).invoice_number) {
          lastBill = String((invData as Record<string, unknown>).invoice_number)
        }
      } catch {
        lastBill = 'N/A'
      }

      let rtnCheque = 0
      let chequeInHand = 0
      try {
        const { data: cheques } = await supabase
          .from('cheques')
          .select('status, direction')
          .eq('direction', 'inbound')
        if (cheques) {
          const chqList = cheques as Array<{ status: string; direction: string }>
          chequeInHand = chqList.filter(c => ['received', 'pending'].includes(c.status)).length
          rtnCheque = chqList.filter(c => ['bounced', 'returned'].includes(c.status)).length
        }
      } catch {
        // Ignored
      }

      return { due, lastBill, rtnCheque, chequeInHand }
    },
    enabled: Boolean(effectiveCustomerId),
  })

  // Bank Accounts / Chart of Accounts
  const bankAccountsQuery = useQuery({
    queryKey: ['lookup', 'bank-accounts'],
    queryFn: () => listLookup('bank_accounts', 'account_name'),
  })

  // ── Calculations ───────────────────────────────────────────────────────────
  const subTotalAmount = cart.reduce((s, l) => s + (l.quantity * l.unit_price), 0)
  const itemDiscountTotal = cart.reduce((s, l) => s + l.discount_amount, 0)
  const rawGrandTotal = cart.reduce((s, l) => s + l.line_total, 0)

  const effectiveBillDiscount = billDiscountRs > 0
    ? Math.min(billDiscountRs, rawGrandTotal)
    : billDiscountPercent > 0
      ? (rawGrandTotal * billDiscountPercent) / 100
      : 0

  const grandTotalAmount = Math.max(0, rawGrandTotal - effectiveBillDiscount)
  const totalProductsCount = cart.length
  const totalQuantitySum = cart.reduce((s, l) => s + l.quantity, 0)

  // Tender breakdown
  const splitTotal = splitPayments.reduce((s, r) => s + r.amount, 0)
  const directCardTotal = cardAmount
  const directChequeTotal = chequeAmount
  const directCashTotal = Math.max(0, modalPaidAmount - splitTotal - directCardTotal - directChequeTotal)

  const tenderSummary = {
    cash: directCashTotal,
    card: splitPayments.filter(p => p.method === 'card').reduce((s, p) => s + p.amount, 0) + directCardTotal,
    cheque: splitPayments.filter(p => p.method === 'cheque').reduce((s, p) => s + p.amount, 0) + directChequeTotal,
    others: splitPayments.filter(p => p.method === 'others' || p.method === 'bank_transfer').reduce((s, p) => s + p.amount, 0),
  }

  const effectiveTotalPaid = modalPaidAmount
  const remainingBalance = Math.max(0, grandTotalAmount - effectiveTotalPaid)
  const changeAmount = Math.max(0, effectiveTotalPaid - grandTotalAmount)

  const calculatedEntryLineTotal = Math.max(
    0,
    (entryQty * entryPrice) - (
      entryDiscountRs > 0
        ? Math.min(entryDiscountRs, entryQty * entryPrice)
        : (entryQty * entryPrice * (entryDiscountPercent / 100))
    )
  )

  // ── Hold Bill Flow (F8) ────────────────────────────────────────────────────
  const handleHoldBill = useCallback(async () => {
    if (cart.length === 0) {
      notify('Cart is empty. Add products to hold.', 'error')
      return
    }

    try {
      let targetBranchId = effectiveBranchId
      if (!targetBranchId) {
        const { data: b } = (await requireSupabase().from('branches').select('id').eq('is_active', true).limit(1).maybeSingle()) as { data: { id: string } | null }
        if (b?.id) targetBranchId = b.id
      }
      let targetWarehouseId = effectiveWarehouseId
      if (!targetWarehouseId) {
        const { data: w } = (await requireSupabase().from('warehouses').select('id').eq('is_active', true).limit(1).maybeSingle()) as { data: { id: string } | null }
        if (w?.id) targetWarehouseId = w.id
      }
      let targetLocationId = effectiveLocationId
      if (!targetLocationId) {
        const { data: l } = (await requireSupabase().from('stock_locations').select('id').eq('is_active', true).limit(1).maybeSingle()) as { data: { id: string } | null }
        if (l?.id) targetLocationId = l.id
      }
      let targetCustomerId = effectiveCustomerId
      if (!targetCustomerId) {
        const { data: c } = (await requireSupabase().from('customers').select('id').eq('is_active', true).limit(1).maybeSingle()) as { data: { id: string } | null }
        if (c?.id) targetCustomerId = c.id
      }

      if (!targetBranchId || !targetWarehouseId || !targetLocationId || !targetCustomerId) {
        notify('Ensure Branch, Warehouse, Location and Customer are configured.', 'error')
        return
      }

      const draft = await createSalesDraft(
        {
          branch_id: targetBranchId,
          warehouse_id: targetWarehouseId,
          stock_location_id: targetLocationId,
          customer_id: targetCustomerId,
          invoice_date: invoiceDate,
          due_date: invoiceDate,
          invoice_type: 'cash',
          bill_discount_type: billDiscountRs > 0 ? 'fixed' : billDiscountPercent > 0 ? 'percentage' : 'none',
          bill_discount_value: billDiscountRs > 0 ? billDiscountRs : billDiscountPercent,
          rep_id: effectiveSalesRepId || undefined,
          notes: entryNote || paymentNote || undefined,
        },
        cart.map(l => ({
          product_variant_id: l.product_variant_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_type: l.discount_type || 'none',
          discount_value: l.discount_value || 0,
          tax_rate: l.tax_rate || 0,
          remarks: l.remarks || undefined,
        }))
      )

      await holdInvoice(draft.id)
      setCart([])
      setShowProcessEndModal(false)
      notify(`Bill ${draft.document_number} held successfully! (Press F9 to recall)`, 'success')
      await qc.invalidateQueries({ queryKey: ['sales', 'held'] })
    } catch (err) {
      notify(getErrorMessage(err), 'error')
    }
  }, [
    cart,
    effectiveBranchId,
    effectiveWarehouseId,
    effectiveLocationId,
    effectiveCustomerId,
    invoiceDate,
    billDiscountRs,
    billDiscountPercent,
    effectiveSalesRepId,
    entryNote,
    paymentNote,
    notify,
    qc,
  ])

  // ── Keyboard Shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F4: Open Process End Modal
      if (e.key === 'F4') {
        e.preventDefault()
        if (cart.length > 0) {
          setModalPaidAmount(grandTotalAmount)
          setShowProcessEndModal(true)
          setTimeout(() => paidInputRef.current?.focus(), 150)
        } else {
          notify('Please add items to cart before proceeding to checkout', 'error')
        }
      }
      // F2: Product Search Modal
      if (e.key === 'F2') {
        e.preventDefault()
        setShowProductSearchModal(true)
      }
      // F3: Barcode Camera Scanner Modal
      if (e.key === 'F3') {
        e.preventDefault()
        setShowBarcodeScannerModal(prev => !prev)
      }
      // F8: Hold Bill
      if (e.key === 'F8' && cart.length > 0) {
        e.preventDefault()
        void handleHoldBill()
      }
      // F9: Recall Held Bills
      if (e.key === 'F9') {
        e.preventDefault()
        setShowHeldModal(true)
      }
      // Escape: Close active modals
      if (e.key === 'Escape') {
        setShowProcessEndModal(false)
        setShowProductSearchModal(false)
        setShowBarcodeScannerModal(false)
        setShowHeldModal(false)
        setShowNewCustomerModal(false)
        setShowCustomerDropdown(false)
        codeInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cart.length, grandTotalAmount, handleHoldBill, notify])

  // Autofocus scanner on mount
  useEffect(() => {
    const timer = setTimeout(() => codeInputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  // ── Product Selection & Barcode Flow ────────────────────────────────────────
  const liveProductsQuery = useQuery({
    queryKey: ['pos-product-autocomplete', entryName, effectiveLocationId],
    queryFn: () => listPosProducts(entryName, effectiveLocationId),
    enabled: entryName.trim().length >= 2 && showProductNameDropdown,
  })

  const handleProductSelect = (product: PosProduct, focusQty = false) => {
    setActiveItemDetails(product)
    setEntryCode(product.barcode || product.sku || product.product_code)
    setEntryName(product.product_name + (product.variant_name ? ` (${product.variant_name})` : ''))
    setEntryUnit(product.unit_name || 'PCS')
    setEntryPrice(product.retail_price || 0)
    setEntryQty(1)
    setEntryDiscountRs(0)
    setEntryDiscountPercent(0)
    setEntryRemarks('')
    setShowProductNameDropdown(false)
    if (focusQty) {
      setTimeout(() => qtyInputRef.current?.focus(), 50)
    }
  }


  const addCurrentEntryToCart = (selectedProd?: PosProduct) => {
    const prod = selectedProd || activeItemDetails
    if (!prod) {
      notify('Please select or scan a valid product first', 'error')
      return
    }

    if (entryQty <= 0) {
      notify('Quantity must be greater than 0', 'error')
      return
    }

    if (prod.track_stock && !prod.allow_negative_stock && prod.available_quantity < entryQty) {
      notify(`Warning: Available stock is ${prod.available_quantity}, requested ${entryQty}`, 'error')
      return
    }

    const discountType: SalesDiscountType = entryDiscountRs > 0
      ? 'fixed'
      : entryDiscountPercent > 0
        ? 'percentage'
        : 'none'
    const discountValue = entryDiscountRs > 0 ? entryDiscountRs : entryDiscountPercent

    const lineTotal = Math.max(0, (entryQty * entryPrice) - (
      discountType === 'fixed'
        ? Math.min(discountValue, entryQty * entryPrice)
        : (entryQty * entryPrice * (discountValue / 100))
    ))

    const newLine: PosCartLine = {
      product_variant_id: prod.product_variant_id,
      product_code: prod.product_code,
      product_name: prod.product_name,
      variant_name: prod.variant_name,
      sku: prod.sku,
      barcode: prod.barcode ?? null,
      unit_name: entryUnit || prod.unit_name || 'PCS',
      available_quantity: prod.available_quantity,
      quantity: entryQty,
      unit_price: entryPrice,
      cost_price: prod.last_cost ?? 0,
      tax_rate: prod.tax_rate ?? 0,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: (entryQty * entryPrice) - lineTotal,
      line_total: lineTotal,
      track_stock: prod.track_stock,
      allow_negative_stock: prod.allow_negative_stock,
    }

    setCart(prev => {
      const existingIdx = prev.findIndex(l => l.product_variant_id === prod.product_variant_id)
      if (existingIdx >= 0) {
        const current = prev[existingIdx]
        if (!current) return prev
        const updated = [...prev]
        const newQty = current.quantity + entryQty
        updated[existingIdx] = calcLine({
          ...current,
          quantity: newQty,
          unit_price: entryPrice,
        })
        return updated
      }
      return [...prev, newLine]
    })

    setEntryCode('')
    setEntryName('')
    setEntryQty(1)
    setEntryPrice(0)
    setEntryDiscountRs(0)
    setEntryDiscountPercent(0)
    setEntryRemarks('')
    codeInputRef.current?.focus()
  }

  const handleProcessBarcodeScan = async (rawCode: string): Promise<boolean> => {
    const code = rawCode.trim()
    if (!code) return false

    try {
      const matched = await findPosByBarcode(code, effectiveLocationId)
      if (matched) {
        playBarcodeBeep()
        handleProductSelect(matched)
        addCurrentEntryToCart(matched)
        notify(`Scanned: ${matched.product_name} (${code})`, 'success')
        setEntryCode('')
        setQuickBarcodeInput('')
        return true
      }
      const matches = await listPosProducts(code, effectiveLocationId)
      if (matches.length === 1 && matches[0]) {
        playBarcodeBeep()
        handleProductSelect(matches[0])
        addCurrentEntryToCart(matches[0])
        notify(`Scanned: ${matches[0].product_name} (${code})`, 'success')
        setEntryCode('')
        setQuickBarcodeInput('')
        return true
      }
      if (matches.length > 1) {
        setProductSearchTerm(code)
        setShowProductSearchModal(true)
        notify(`Found ${matches.length} matching products for "${code}". Please pick one.`, 'info')
        return true
      }
      notify(`No product found for code/barcode "${code}"`, 'error')
      return false
    } catch (err) {
      notify(getErrorMessage(err), 'error')
      return false
    }
  }

  const handleBarcodeScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    await handleProcessBarcodeScan(entryCode)
  }

  const handleQuickBarcodeKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    await handleProcessBarcodeScan(quickBarcodeInput)
    quickBarcodeInputRef.current?.focus()
  }

  const removeCartRow = (idx: number) => {
    setCart(prev => prev.filter((_, i) => i !== idx))
  }

  const updateCartQty = (idx: number, delta: number) => {
    setCart(prev => {
      const cur = prev[idx]
      if (!cur) return prev
      const newQ = cur.quantity + delta
      if (newQ <= 0) {
        return prev.filter((_, i) => i !== idx)
      }
      const updated = [...prev]
      updated[idx] = calcLine({ ...cur, quantity: newQ })
      return updated
    })
  }

  // ── Quick Add Customer Modal ───────────────────────────────────────────────
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCustName.trim()) {
      notify('Customer name is required', 'error')
      return
    }

    try {
      const customerCode = await nextMasterCode(effectiveBranchId, 'customer')
      const newId = await createMasterRecord('customers', {
        branch_id: effectiveBranchId,
        customer_code: customerCode,
        name: newCustName.trim(),
        phone: newCustPhone.trim() || null,
        address: newCustAddress.trim() || null,
        credit_limit: newCustCreditLimit,
        credit_days: newCustCreditDays,
        price_level: 'retail',
        is_active: true,
      })
      await qc.invalidateQueries({ queryKey: ['customers'] })
      setSelectedCustomerId(newId)
      setShowNewCustomerModal(false)
      setNewCustName('')
      setNewCustPhone('')
      setNewCustAddress('')
      notify(`Customer created: ${customerCode} - ${newCustName}`, 'success')
    } catch (err) {
      notify(getErrorMessage(err), 'error')
    }
  }

  // ── Split Tender In Process End Modal ───────────────────────────────────────
  const addSplitPayment = () => {
    if (splitAmount <= 0) {
      notify('Enter a valid split payment amount', 'error')
      return
    }

    const newSplit: SplitPaymentRow = {
      id: Math.random().toString(36).substring(2, 9),
      journalName: splitChannel,
      cfPercent: splitCfPercent,
      amount: splitAmount,
      method: splitChannel.toLowerCase().includes('card') ? 'card'
        : splitChannel.toLowerCase().includes('cheque') ? 'cheque'
        : 'bank_transfer',
    }

    setSplitPayments(prev => [...prev, newSplit])
    setSplitAmount(0)
  }

  const removeSplitPayment = (id: string) => {
    setSplitPayments(prev => prev.filter(p => p.id !== id))
  }

  // ── Cash Presets ───────────────────────────────────────────────────────────
  const handleCashPreset = (val: number) => {
    setModalPaidAmount(prev => Math.round((prev + val) * 100) / 100)
  }

  const handleExactCash = () => {
    setModalPaidAmount(grandTotalAmount)
  }

  const handleClearCash = () => {
    setModalPaidAmount(0)
  }

  // ── Held Bills Recall (F9) ─────────────────────────────────────────────────
  const heldBillsQuery = useQuery({
    queryKey: ['sales', 'held', effectiveBranchId],
    queryFn: () => listHeldInvoices(effectiveBranchId),
    refetchInterval: 10000,
  })

  const cancelHeldMutation = useMutation({
    mutationFn: async (id: string) => {
      return invoiceAction('cancel', id, 'Discarded from POS recall list')
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ['sales', 'held'] })
      notify(`Held invoice ${res.document_number} cancelled`, 'info')
    },
    onError: e => notify(getErrorMessage(e), 'error'),
  })

  const recallMutation = useMutation({
    mutationFn: async (id: string) => {
      const recallRes = await recallInvoice(id)
      const full = await getInvoice(id)
      return { recallRes, full }
    },
    onSuccess: async ({ recallRes, full }) => {
      await qc.invalidateQueries({ queryKey: ['sales', 'held'] })
      setShowHeldModal(false)

      if (full.header.customer_id) {
        setSelectedCustomerId(full.header.customer_id)
      }

      const loadedLines: PosCartLine[] = full.items.map(it => ({
        product_variant_id: it.product_variant_id,
        product_code: it.product_code,
        product_name: it.product_name,
        variant_name: it.variant_name ?? undefined,
        sku: it.sku,
        barcode: it.barcode ?? null,
        unit_name: (it as { unit_name?: string }).unit_name || 'PCS',
        available_quantity: 999,

        quantity: it.quantity,
        unit_price: it.unit_price,
        cost_price: 0,
        tax_rate: it.tax_rate || 0,
        discount_type: it.discount_type || 'none',
        discount_value: it.discount_value || 0,
        discount_amount: it.discount_amount || 0,
        line_total: it.line_total,
        track_stock: true,
        allow_negative_stock: false,
        remarks: it.remarks ?? undefined,
      }))

      setCart(loadedLines)
      notify(`Recalled invoice ${recallRes.document_number} with ${loadedLines.length} items into cart`, 'success')
      codeInputRef.current?.focus()
    },
    onError: e => notify(getErrorMessage(e), 'error'),
  })


  // ── Post Sales Invoice (Payment / "BILL" Button) ────────────────────────────
  const postInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveBranchId || !effectiveWarehouseId || !effectiveLocationId || !effectiveCustomerId) {
        throw new Error('Please select Branch, Warehouse, Location and Customer')
      }
      if (cart.length === 0) {
        throw new Error('Active invoice cart is empty')
      }

      const payments: CreateSalesDraftPayment[] = []

      for (const sp of splitPayments) {
        payments.push({
          payment_method: (sp.method === 'card' ? 'card' : sp.method === 'cheque' ? 'cheque' : 'bank_transfer') as CustomerPaymentMethod,
          amount: sp.amount,
          card_reference: sp.refNo || undefined,
          bank_account_id: sp.bankAccountId || (selectedAccountId || undefined),
          notes: `${sp.journalName} (CF: ${sp.cfPercent}%)`,
        })
      }

      if (cardAmount > 0) {
        payments.push({
          payment_method: 'card',
          amount: cardAmount,
          card_reference: cardRef || cardMachine || undefined,
          notes: cardMachine ? `Card Machine: ${cardMachine}` : undefined,
        })
      }

      if (chequeAmount > 0) {
        payments.push({
          payment_method: 'cheque',
          amount: chequeAmount,
          cheque_number: chequeNo || undefined,
          cheque_date: chequeDate || invoiceDate,
          notes: chequeBank ? `Bank: ${chequeBank}` : undefined,
        })
      }

      const nonCashTotal = payments.reduce((s, p) => s + p.amount, 0)
      const remainingNeeded = Math.max(0, grandTotalAmount - nonCashTotal)
      const cashPortion = Math.min(directCashTotal, remainingNeeded)

      if (cashPortion > 0) {
        payments.push({
          payment_method: 'cash',
          amount: cashPortion,
          notes: 'POS Cash Settlement',
        })
      }

      const totalPaymentsGiven = payments.reduce((s, p) => s + p.amount, 0)

      const determinedInvoiceType = totalPaymentsGiven >= grandTotalAmount
        ? 'cash'
        : totalPaymentsGiven > 0
          ? 'mixed'
          : 'credit'

      const billDiscType: SalesDiscountType = billDiscountRs > 0
        ? 'fixed'
        : billDiscountPercent > 0
          ? 'percentage'
          : 'none'
      const billDiscVal = billDiscountRs > 0 ? billDiscountRs : billDiscountPercent

      // 1. Create Sales Draft
      const draft = await createSalesDraft(
        {
          branch_id: effectiveBranchId,
          warehouse_id: effectiveWarehouseId,
          stock_location_id: effectiveLocationId,
          customer_id: effectiveCustomerId,
          invoice_date: invoiceDate,
          due_date: invoiceDate,
          invoice_type: determinedInvoiceType,
          bill_discount_type: billDiscType,
          bill_discount_value: billDiscVal,
          rep_id: effectiveSalesRepId || undefined,
          notes: paymentNote || entryNote || undefined,
          internal_reference: refNo || poNo || undefined,
        },
        cart.map(l => ({
          product_variant_id: l.product_variant_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_type: l.discount_type,
          discount_value: l.discount_value,
          tax_rate: l.tax_rate,
          remarks: l.remarks || undefined,
        })),
        payments
      )

      // 2. Atomically Post Invoice (Deducts stock via sale_out and posts customer ledger)
      const postResult = await invoiceAction('post', draft.id)
      return { draft, postResult, payments, totalPaid: effectiveTotalPaid }
    },
    onSuccess: (res) => {
      const receiptData = {
        number: res.postResult.document_number || res.draft.document_number,
        date: new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' }),
        branchName: branchesQuery.data?.find(b => b.value === effectiveBranchId)?.label || 'Easy Baby - Store',
        customerName: selectedCustomer ? `${selectedCustomer.customer_code} - ${selectedCustomer.name}` : 'Cash Customer',
        customerPhone: selectedCustomer?.phone || '',
        items: cart.map(l => ({
          name: l.product_name,
          variant: l.variant_name,
          qty: l.quantity,
          price: l.unit_price,
          discount: l.discount_amount,
          total: l.line_total,
        })),
        subtotal: subTotalAmount,
        discount: itemDiscountTotal + effectiveBillDiscount,
        grandTotal: grandTotalAmount,
        tendered: res.totalPaid,
        paid: Math.min(res.totalPaid, grandTotalAmount),
        change: Math.max(0, res.totalPaid - grandTotalAmount),
        balance: Math.max(0, grandTotalAmount - res.totalPaid),
      }

      setLastReceipt(receiptData)
      notify(`Invoice ${receiptData.number} successfully processed and posted!`, 'success')

      setCart([])
      setSplitPayments([])
      setModalPaidAmount(0)
      setShowProcessEndModal(false)

      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['current-stock'] })
      qc.invalidateQueries({ queryKey: ['pos-products'] })
      qc.invalidateQueries({ queryKey: ['pos-search-modal'] })
      qc.invalidateQueries({ queryKey: ['purchase-products'] })
      qc.invalidateQueries({ queryKey: ['purchase-stock'] })
      qc.invalidateQueries({ queryKey: ['stock-movements'] })
      qc.invalidateQueries({ queryKey: ['customer-financials'] })

      setTimeout(() => {
        window.print()
        codeInputRef.current?.focus()
      }, 400)
    },
    onError: (err) => {
      notify(getErrorMessage(err), 'error')
    },
  })

  // ── Permissions Guard ──────────────────────────────────────────────────────
  if (!can(permissions.salesCreate)) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] bg-[#0c2423] text-emerald-100">
        <div className="p-8 bg-[#133534] border border-[#1b4d4b] rounded-lg text-center shadow-xl">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-400" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-sm text-emerald-300/80">You do not have permission to create sales invoices.</p>
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
        <div className={`px-4 py-1 text-xs font-semibold flex items-center justify-between ${
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

      {/* ── 2. TOP HEADER & METADATA BAR (3 DISTINCT FLOATING CARDS) ───────── */}
      <div className="grid grid-cols-12 gap-2.5 p-2.5 bg-[#031514] border-b border-[#144743]">

        {/* CARD 1: Customer Card (5 Cols) */}
        <div className="col-span-5 bg-[#041a18] border border-[#1b5e58] rounded-md p-3 shadow-md flex flex-col justify-between">
          {/* Top Row: Customer Input + NEW + C/LEVEL */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-[#38d4c5] font-bold uppercase tracking-wider block mb-1">
                SELECT CUSTOMER
              </label>
              <div className="relative flex gap-1">
                <input
                  type="text"
                  placeholder="Example : Jonh"
                  value={customerSearchTerm || (selectedCustomer ? `${selectedCustomer.customer_code} - ${selectedCustomer.name}` : '')}
                  onChange={(e) => {
                    setCustomerSearchTerm(e.target.value)
                    setShowCustomerDropdown(true)
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  className="w-full bg-[#082623] border border-[#1d635c] rounded px-3 h-8 text-white text-xs placeholder:text-teal-400/40 focus:outline-none focus:border-[#00d2ff] focus:ring-1 focus:ring-[#00d2ff]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(true)}
                  className="bg-[#00a8e8] hover:bg-[#0094cc] text-white text-xs font-bold px-3 h-8 rounded transition text-center shadow-xs whitespace-nowrap"
                >
                  NEW
                </button>
                {/* Autocomplete Dropdown */}
                {showCustomerDropdown && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto bg-[#071f1d] border border-[#1b5e58] rounded shadow-2xl">
                    {(customersQuery.data || [])
                      .filter(c => {
                        const term = customerSearchTerm.toLowerCase()
                        return !term || c.name.toLowerCase().includes(term) || c.customer_code.toLowerCase().includes(term) || (c.phone && c.phone.includes(term))
                      })
                      .map(c => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomerId(c.id)
                            setCustomerSearchTerm('')
                            setShowCustomerDropdown(false)
                          }}
                          className="px-2.5 py-1.5 hover:bg-[#113a37] cursor-pointer border-b border-[#0e2c2a] flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-[#00d2ff] mr-2">{c.customer_code}</span>
                            <span className="text-white">{c.name}</span>
                          </div>
                          <span className="text-[10px] text-teal-300">{c.phone || 'No phone'}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="w-28">
              <label className="text-[11px] text-[#38d4c5] font-bold uppercase tracking-wider block mb-1">
                C/LEVEL
              </label>
              <select
                value={priceLevel}
                onChange={(e) => setPriceLevel(e.target.value as 'Default' | 'Retail' | 'Wholesale' | 'Special')}
                className="w-full bg-[#082623] border border-[#1d635c] rounded px-2 text-white text-xs h-8 focus:outline-none focus:border-[#00d2ff]"
              >
                <option value="Default">Default</option>
                <option value="Retail">Retail</option>
                <option value="Wholesale">Wholesale</option>
                <option value="Special">Special</option>
              </select>
            </div>
          </div>

          {/* Customer Title in Bold Cyan */}
          <div className="my-2.5">
            <h2 className="text-[17px] font-black text-[#00d2ff] tracking-wide truncate">
              {selectedCustomer ? `${selectedCustomer.customer_code} - ${selectedCustomer.name.toUpperCase()}` : 'C-001 - CASH CUSTOMER'}
            </h2>
          </div>

          {/* Financial Metrics in 4 Rows */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex items-center justify-between text-teal-300 font-medium">
              <span>Due - {Number(customerFinancialsQuery.data?.due || 0).toFixed(2)}</span>
            </div>
            <div className="h-4 bg-[#082623] border border-[#164e48] rounded-xs" />

            <div className="flex items-center justify-between text-teal-300 font-medium">
              <span>Rtn-cheque</span>
            </div>
            <div className="h-4 bg-[#082623] border border-[#164e48] rounded-xs" />

            <div className="flex items-center justify-between text-teal-300 font-medium">
              <span>Cheque in hand</span>
            </div>
            <div className="h-4 bg-[#082623] border border-[#164e48] rounded-xs" />

            <div className="flex items-center justify-between text-teal-300 font-medium">
              <span>Last Bill</span>
            </div>
            <div className="h-5 bg-[#082623] border border-[#164e48] rounded-xs px-2 flex items-center justify-start text-[11px] font-bold text-white">
              {customerFinancialsQuery.data?.lastBill || 'A-8136'}
            </div>
          </div>
        </div>

        {/* CARD 2: Date, Salesrep, Type, Print (3 Cols) */}
        <div className="col-span-3 bg-[#041a18] border border-[#1b5e58] rounded-md p-3 shadow-md flex flex-col justify-between">
          <div>
            <label className="text-[11px] text-[#38d4c5] font-bold block mb-1">DATE</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full bg-[#082623] border border-[#1d635c] rounded px-2.5 text-white text-xs h-8 focus:outline-none focus:border-[#00d2ff]"
            />
          </div>

          <div>
            <label className="text-[11px] text-[#38d4c5] font-bold block mb-1">SALESREP</label>
            <select
              value={selectedSalesRepId}
              onChange={(e) => setSelectedSalesRepId(e.target.value)}
              className="w-full bg-[#082623] border border-[#1d635c] rounded px-2.5 text-white text-xs h-8 focus:outline-none focus:border-[#00d2ff]"
            >
              <option value="">-- None / Default --</option>
              {(staffQuery.data || []).map(s => (
                <option key={s.id} value={s.id}>
                  {s.staff_code} - {s.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-[#38d4c5] font-bold block mb-1">TYPE</label>
              <select
                value={billingType}
                onChange={(e) => setBillingType(e.target.value as 'Invoice' | 'Order')}
                className="w-full bg-[#082623] border border-[#1d635c] rounded px-2 text-white text-xs h-8 focus:outline-none focus:border-[#00d2ff]"
              >
                <option value="Invoice">Invoice</option>
                <option value="Order">Order</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-[#38d4c5] font-bold block mb-1">PRINT</label>
              <select
                value={printTemplate}
                onChange={(e) => setPrintTemplate(e.target.value as 'Default' | 'Thermal 80mm' | 'A4')}
                className="w-full bg-[#082623] border border-[#1d635c] rounded px-2 text-white text-xs h-8 focus:outline-none focus:border-[#00d2ff]"
              >
                <option value="Default">Default</option>
                <option value="Thermal 80mm">Thermal 80mm</option>
                <option value="A4">A4 Sheet</option>
              </select>
            </div>
          </div>
        </div>

        {/* CARD 3: Giant Metric Display & Action Buttons (4 Cols) */}
        <div className="col-span-4 bg-[#041a18] border border-[#1b5e58] rounded-md p-3 shadow-md flex flex-col justify-between">
          <div className="flex justify-end items-baseline gap-2">
            <span className="text-2xl font-bold text-teal-300">Rs</span>
            <span className="text-4xl font-black text-white tracking-tight drop-shadow-md font-mono">
              {Number(grandTotalAmount).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-teal-200">
              <span>No of Products : <strong className="text-white">{totalProductsCount}</strong></span>
              <span>Total Quantity : <strong className="text-white">{totalQuantitySum.toFixed(0)}</strong></span>
            </div>
            <div className="flex items-center justify-end text-xs">
              <span className="text-teal-200 mr-2">Discount :</span>
              <strong className="text-[#ff3b30] font-bold text-sm">{itemDiscountTotal.toFixed(2)}</strong>
            </div>
          </div>

          <div className="flex items-center gap-1.5 pt-1">
            {/* Quick Orange Add Button */}
            <button
              type="button"
              onClick={() => {
                if (cart.length === 0) {
                  notify('Cart is empty. Add products first.', 'error')
                  return
                }
                setModalPaidAmount(grandTotalAmount)
                setShowProcessEndModal(true)
                setTimeout(() => paidInputRef.current?.focus(), 150)
              }}
              title="Process Invoice"
              className="bg-[#f59e0b] hover:bg-[#d97706] text-white font-bold h-8 w-8 rounded transition text-lg flex items-center justify-center shadow-xs shrink-0"
            >
              +
            </button>

            {/* Quick Barcode Scanner Input Slot */}
            <div className="flex-1 relative flex items-center min-w-[140px]">
              <BarcodeIcon size={14} className="absolute left-2.5 text-[#38d4c5] pointer-events-none" />
              <input
                ref={quickBarcodeInputRef}
                type="text"
                value={quickBarcodeInput}
                onChange={(e) => setQuickBarcodeInput(e.target.value)}
                onKeyDown={handleQuickBarcodeKeyDown}
                placeholder="Scan / Type Barcode..."
                className="w-full bg-[#082623] border border-[#1d635c] rounded h-8 pl-8 pr-2 text-white text-xs font-mono placeholder:text-teal-400/50 focus:outline-none focus:border-[#00d2ff] focus:ring-1 focus:ring-[#00d2ff]"
              />
            </div>

            {/* Live Camera Barcode Scanner Button */}
            <button
              type="button"
              onClick={() => setShowBarcodeScannerModal(true)}
              className="bg-[#0b3b36] hover:bg-[#125850] border border-[#38d4c5] text-[#38d4c5] hover:text-white font-bold h-8 px-2.5 rounded transition flex items-center gap-1.5 text-xs tracking-wider shrink-0"
              title="Open Camera Barcode Scanner (F3)"
            >
              <Camera size={13} /> SCAN (F3)
            </button>

            {/* Search Button */}
            <button
              type="button"
              onClick={() => setShowProductSearchModal(true)}
              className="bg-[#082623] hover:bg-[#0c3632] border border-[#f59e0b] text-[#f59e0b] font-bold h-8 px-2.5 rounded transition flex items-center gap-1.5 text-xs tracking-wider shrink-0 cursor-pointer"
            >
              <Search size={13} /> SEARCH (F2)
            </button>

            {/* HOLD BILL (F8) Button */}
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={() => void handleHoldBill()}
              className={`h-8 px-2.5 rounded font-bold transition flex items-center gap-1.5 text-xs tracking-wider uppercase shrink-0 border ${
                cart.length > 0
                  ? 'bg-amber-950/70 hover:bg-amber-900 border-amber-500 text-amber-300 hover:text-white shadow-sm cursor-pointer'
                  : 'bg-[#082623] border-[#1d635c]/50 text-gray-500 cursor-not-allowed opacity-60'
              }`}
              title="Hold active bill (F8)"
            >
              <PauseCircle size={13} /> HOLD (F8)
            </button>

            {/* TAKE BACK HELD (F9) Button */}
            <button
              type="button"
              onClick={() => setShowHeldModal(true)}
              className={`h-8 px-2.5 rounded transition flex items-center gap-1.5 text-xs font-bold tracking-wider shrink-0 cursor-pointer relative border ${
                (heldBillsQuery.data?.length ?? 0) > 0
                  ? 'bg-[#063330] hover:bg-[#094d48] border-[#00d2ff] text-[#00d2ff] hover:text-white shadow-md'
                  : 'bg-[#082623] hover:bg-[#0c3632] border-[#1d635c] text-teal-300'
              }`}
              title="Take back held sales into cart (F9)"
            >
              <RotateCcw size={13} />
              TAKE HELD (F9)
              {(heldBillsQuery.data?.length ?? 0) > 0 && (
                <span className="ml-0.5 bg-amber-400 text-black font-extrabold text-[10px] px-1.5 py-0.2 rounded-full shadow-xs">
                  {heldBillsQuery.data?.length}
                </span>
              )}
            </button>

            {/* INVOICE (F4) Primary Button */}
            <button
              type="button"
              onClick={() => {
                if (cart.length === 0) {
                  notify('Cart is empty. Add products first.', 'error')
                  return
                }
                setModalPaidAmount(grandTotalAmount)
                setShowProcessEndModal(true)
                setTimeout(() => paidInputRef.current?.focus(), 150)
              }}
              className="bg-[#0e7472] hover:bg-[#108583] text-white font-bold h-8 px-3 rounded shadow transition flex items-center gap-1 text-xs tracking-wider uppercase shrink-0 cursor-pointer"
            >
              <span className="font-extrabold">+</span> INVOICE (F4)
            </button>
          </div>
        </div>

      </div>


      {/* ── 3. FAST BARCODE & LINE-ITEM ENTRY STRIP (BORDERED CARD) ───────── */}
      <div className="p-2.5 bg-[#031514] border-b border-[#144743]">
        <div className="bg-[#041a18] border border-[#1b5e58] rounded-md p-3 shadow-md">
          <div className="grid grid-cols-12 gap-3">

            {/* Left Entry Inputs (9 Cols) */}
            <div className="col-span-9 flex flex-col justify-between gap-2.5">

              {/* Row 1: Code, Product Name, Warranty */}
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-[#38d4c5] font-semibold uppercase tracking-wide">CODE / BARCODE</label>
                    <button
                      type="button"
                      onClick={() => setShowBarcodeScannerModal(true)}
                      className="text-[10px] text-[#00d2ff] hover:text-white flex items-center gap-1 bg-[#093531] px-1.5 py-0.5 rounded border border-[#1d635c] hover:border-[#00d2ff] transition"
                      title="Scan using camera (F3)"
                    >
                      <Camera size={10} /> Camera
                    </button>
                  </div>
                  <input
                    ref={codeInputRef}
                    type="text"
                    placeholder="Scan / Type Code + Enter"
                    value={entryCode}
                    onChange={(e) => setEntryCode(e.target.value)}
                    onKeyDown={handleBarcodeScan}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-3 h-8 text-white text-xs font-mono placeholder:text-teal-400/40 focus:outline-none focus:border-[#00d2ff] focus:ring-1 focus:ring-[#00d2ff]"
                  />
                </div>

                <div className="col-span-6">
                  <label className="text-[11px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">PRODUCT NAME</label>
                  <div className="flex gap-1 items-center">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Example : Pizza"
                        value={entryName}
                        onChange={(e) => {
                          setEntryName(e.target.value)
                          setProductSearchTerm(e.target.value)
                          setShowProductNameDropdown(true)
                        }}
                        onFocus={() => {
                          if (entryName.trim().length >= 2) setShowProductNameDropdown(true)
                        }}
                        className="w-full bg-[#082623] border border-[#1d635c] rounded px-3 h-8 text-white text-xs placeholder:text-teal-400/40 focus:outline-none focus:border-[#00d2ff] focus:ring-1 focus:ring-[#00d2ff]"
                      />

                      {/* Live Autocomplete Dropdown */}
                      {showProductNameDropdown && entryName.trim().length >= 2 && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto bg-[#071f1d] border border-[#1b5e58] rounded shadow-2xl">
                          {liveProductsQuery.isLoading ? (
                            <div className="px-3 py-2 text-xs text-teal-400">Searching products...</div>
                          ) : (liveProductsQuery.data || []).length === 0 ? (
                            <div className="px-3 py-2 text-xs text-teal-600">No matching products found</div>
                          ) : (
                            (liveProductsQuery.data || []).map(p => (
                              <div
                                key={p.product_variant_id}
                                onClick={() => handleProductSelect(p, true)}
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
                                  <div className="font-bold text-white">Rs {Number(p.retail_price).toFixed(2)}</div>
                                  <div className={`text-[10px] ${p.available_quantity > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    Stock: {Number(p.available_quantity).toFixed(0)}
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
                      title="Search Product"
                      className="bg-[#00a8e8] hover:bg-[#0094cc] text-white font-black h-8 w-8 rounded text-sm transition flex items-center justify-center shrink-0"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="col-span-3">
                  <label className="text-[11px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">WARRANTY</label>
                  <select
                    value={entryWarranty}
                    onChange={(e) => setEntryWarranty(e.target.value)}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-2.5 h-8 text-white text-xs focus:outline-none focus:border-[#00d2ff]"
                  >
                    <option value="Select Warr">Select Warr</option>
                    <option value="None">None</option>
                    <option value="3 Months">3 Months</option>
                    <option value="6 Months">6 Months</option>
                    <option value="1 Year">1 Year</option>
                    <option value="2 Years">2 Years</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Type, Unit, Quantity, Price, Discount, Dis(%), Total, Remarks, Location, Red Add (+) */}
              <div className="grid grid-cols-12 gap-1.5 items-end">
                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">TYPE</label>
                  <input
                    type="text"
                    value={entryType}
                    onChange={(e) => setEntryType(e.target.value)}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-1 h-8 text-white text-xs text-center focus:outline-none focus:border-[#00d2ff]"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">UNIT</label>
                  <input
                    type="text"
                    value={entryUnit}
                    onChange={(e) => setEntryUnit(e.target.value)}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-1 h-8 text-white text-xs text-center focus:outline-none focus:border-[#00d2ff]"
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
                      if (e.key === 'Enter') addCurrentEntryToCart()
                    }}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-1.5 h-8 text-white text-xs text-right font-bold focus:outline-none focus:border-[#00d2ff]"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">PRICE</label>
                  <div className="relative">
                    <span className="absolute left-1.5 top-2 text-[10px] text-teal-400/80 pointer-events-none">Rs</span>
                    <input
                      type="number"
                      step="0.01"
                      value={entryPrice || ''}
                      onChange={(e) => setEntryPrice(Number(e.target.value))}
                      className="w-full bg-[#082623] border border-[#1d635c] rounded pl-6 pr-1 h-8 text-white text-xs text-right focus:outline-none focus:border-[#00d2ff]"
                    />
                  </div>
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">DISCOUNT</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={entryDiscountRs || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setEntryDiscountRs(val)
                      if (entryPrice > 0 && entryQty > 0) {
                        setEntryDiscountPercent(Math.round(((val / (entryPrice * entryQty)) * 100) * 100) / 100)
                      }
                    }}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-1.5 h-8 text-white text-xs text-right focus:outline-none focus:border-[#00d2ff]"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">DIS(%)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0%"
                    value={entryDiscountPercent || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setEntryDiscountPercent(val)
                      if (entryPrice > 0 && entryQty > 0) {
                        setEntryDiscountRs(Math.round((entryPrice * entryQty * (val / 100)) * 100) / 100)
                      }
                    }}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-1.5 h-8 text-white text-xs text-right focus:outline-none focus:border-[#00d2ff]"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">TOTAL</label>
                  <div className="bg-[#781818] border border-red-700 text-white font-bold h-8 px-2 rounded flex items-center justify-between text-xs shadow-inner">
                    <span className="text-[10px] text-red-200">Rs</span>
                    <span className="font-black text-white">{calculatedEntryLineTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">REMARKS</label>
                  <input
                    type="text"
                    placeholder="Imei Number"
                    value={entryRemarks}
                    onChange={(e) => setEntryRemarks(e.target.value)}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-2.5 h-8 text-white text-xs placeholder:text-teal-500/40 focus:outline-none focus:border-[#00d2ff]"
                  />
                </div>

                <div className="col-span-1">
                  <label className="text-[10px] text-[#38d4c5] font-semibold block mb-1 uppercase tracking-wide">LOCATION</label>
                  <select
                    value={currentEntryLocationId}
                    onChange={(e) => setEntryLocationId(e.target.value)}
                    className="w-full bg-[#082623] border border-[#1d635c] rounded px-1 h-8 text-white text-xs focus:outline-none focus:border-[#00d2ff]"
                  >
                    {(locationsQuery.data || []).map(l => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => addCurrentEntryToCart()}
                    title="Add Item to Cart (Enter)"
                    className="w-full bg-[#d92d20] hover:bg-[#b42318] text-white font-black h-8 rounded shadow transition flex items-center justify-center text-lg"
                  >
                    +
                  </button>
                </div>
              </div>

            </div>

            {/* Right Side: Item Details & Note Box (3 Cols) */}
            <div className="col-span-3 grid grid-cols-2 gap-2 border-l border-[#144743] pl-2.5">
              {/* Real-time Item Metadata Card */}
              <div className="flex flex-col justify-between text-xs py-0.5">
                <span className="font-bold text-white text-xs block mb-1">
                  Item Details
                </span>
                <div className="space-y-0.5 text-teal-200/90 text-[11px]">
                  {(can('products.view_cost') || can(permissions.salesViewCost)) && (
                    <div className="flex justify-between">
                      <span>• Cost Price:</span>
                      <strong className="text-white">Rs {Number(activeItemDetails?.last_cost || 0).toFixed(2)}</strong>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>• Last Price:</span>
                    <strong className="text-white">Rs {Number(activeItemDetails?.retail_price || 0).toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>• Stock/Reorder:</span>
                    <strong className={Number(activeItemDetails?.available_quantity || 0) > 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {Number(activeItemDetails?.available_quantity || 0).toFixed(0)}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>• Category:</span>
                    <span className="text-white truncate max-w-[80px]">General</span>
                  </div>
                  <div className="flex justify-between">
                    <span>• Promotion:</span>
                    <span className="text-emerald-400 truncate max-w-[80px]">Active</span>
                  </div>
                </div>
              </div>

              {/* Burgundy Note Box */}
              <div className="bg-[#381616] border border-[#5c2424] rounded-sm p-2 flex flex-col">
                <span className="text-[11px] text-[#ff9999] font-medium block mb-1">Note</span>
                <textarea
                  rows={3}
                  placeholder="ENTER YOUR MESSAGE"
                  value={entryNote}
                  onChange={(e) => setEntryNote(e.target.value)}
                  className="w-full flex-1 bg-transparent border-0 p-0 text-white text-[11px] placeholder:text-[#a35252] focus:outline-none resize-none leading-tight"
                />
              </div>
            </div>

          </div>
        </div>
      </div>


      {/* ── 4. ACTIVE INVOICE GRID ────────────────────────────────────────── */}

      <div className="flex-1 min-h-[360px] overflow-y-auto bg-[#021311]">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-black text-[#e8f0ec] font-bold uppercase tracking-wider border-b border-[#144743] text-[11px]">
            <tr>
              <th className="py-2.5 px-3">PRODUCT DETAILS</th>
              <th className="py-2.5 px-2 text-center w-16">UNIT</th>
              <th className="py-2.5 px-2 text-center w-20">QUANTITY</th>
              <th className="py-2.5 px-3 text-right w-24">PRICE</th>
              <th className="py-2.5 px-3 text-center w-28">DISCOUNT %</th>
              <th className="py-2.5 px-3 text-right w-28">TOTAL</th>
              <th className="py-2.5 px-2 text-center w-20">TYPE</th>
              <th className="py-2.5 px-3 w-28">REMARKS</th>
              <th className="py-2.5 px-2 text-center w-16">REMOVE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0c2b29]">
            {cart.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-20 text-center text-teal-500/50">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <ShoppingCart size={38} className="opacity-20 text-teal-400" />
                    <p className="text-sm font-semibold text-teal-400/80">Cart is empty</p>
                    <p className="text-xs text-teal-600/70">Scan barcode or press F2 to search products</p>
                    {(heldBillsQuery.data?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowHeldModal(true)}
                        className="mt-3 bg-[#00d2ff] hover:bg-[#38e0ff] text-black font-black px-4 py-2 rounded-md shadow-lg transition flex items-center gap-2 text-xs cursor-pointer tracking-wider"
                      >
                        <RotateCcw size={15} /> TAKE BACK HELD SALE ({(heldBillsQuery.data?.length ?? 0)})
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              cart.map((line, idx) => (
                <tr key={`${line.product_variant_id}-${idx}`} className="hover:bg-[#092624] transition group">
                  <td className="py-2 px-3">
                    <div className="font-bold text-white text-[12px]">
                      {line.product_code} - {line.sku || ''} - {line.product_name}
                    </div>
                    {line.variant_name && (
                      <div className="text-[10px] text-teal-300 font-medium">
                        Variant: {line.variant_name}
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-center font-medium text-teal-300">
                    {line.unit_name || 'PCS'}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <div className="inline-flex items-center gap-1 bg-[#0b2927] px-1.5 py-0.5 rounded border border-[#144743]">
                      <button
                        type="button"
                        onClick={() => updateCartQty(idx, -1)}
                        className="text-teal-300 hover:text-white font-bold px-1"
                      >
                        -
                      </button>
                      <span className="font-bold text-white px-1">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(idx, 1)}
                        className="text-teal-300 hover:text-white font-bold px-1"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-emerald-100">
                    {Number(line.unit_price).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-3 text-center text-amber-300 font-medium">
                    {line.discount_value > 0
                      ? `${line.discount_type === 'percentage' ? line.discount_value + '%' : 'Rs ' + line.discount_value} | ${line.discount_amount.toFixed(2)}`
                      : '0.00% | 0.00'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-black text-white text-[13px]">
                    {Number(line.line_total).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span className="bg-[#123937] text-teal-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                      ISSUE
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-emerald-300/80 text-[11px] truncate max-w-[120px]">
                    {line.remarks ? `| ${line.remarks}` : '| A'}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeCartRow(idx)}
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

      {/* ── 5. FLOATING "PROCESS END" PAYMENT MODAL ───────────────────────── */}
      {showProcessEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 select-none">
          <div className="bg-[#0c2423] border border-[#1b4d4b] rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#091b1a] border-b border-[#1b4d4b]">
              <h2 className="text-sm font-black tracking-wider text-white uppercase flex items-center gap-2">
                PROCESS END
              </h2>
              <button
                type="button"
                onClick={() => setShowProcessEndModal(false)}
                className="p-1 text-red-400 hover:text-white hover:bg-red-900/60 rounded transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body - 2 Columns */}
            <div className="grid grid-cols-12 gap-3 p-3 text-xs">

              {/* LEFT COLUMN: Summary Card & Meta Details (5.5 Cols) */}
              <div className="col-span-5 flex flex-col gap-2">

                {/* Red Border Summary Card */}
                <div className="border-2 border-red-500 rounded bg-[#0a1e1d] p-3 flex flex-col gap-2 shadow-inner">
                  {/* Total */}
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-black text-white uppercase">TOTAL</span>
                    <span className="text-2xl font-black text-white">
                      {formatRs(grandTotalAmount)}
                    </span>
                  </div>

                  {/* Paid */}
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold text-emerald-300 uppercase">PAID</span>
                    <span className="text-xl font-bold text-white">
                      {formatRs(modalPaidAmount)}
                    </span>
                  </div>

                  {/* Balance / Change */}
                  <div className="flex justify-between items-baseline border-t border-red-900/60 pt-1.5">
                    <span className="text-sm font-black text-white uppercase">
                      {modalPaidAmount >= grandTotalAmount ? 'CHANGE' : 'BALANCE'}
                    </span>
                    <span className={`text-2xl font-black ${
                      modalPaidAmount >= grandTotalAmount ? 'text-emerald-400' : 'text-red-500'
                    }`}>
                      {formatRs(modalPaidAmount >= grandTotalAmount ? changeAmount : remainingBalance)}
                    </span>
                  </div>

                  {/* Tender Summary Row: CASH, CARD, CHEQUE, OTHERS */}
                  <div className="grid grid-cols-4 gap-1 text-[10px] pt-1 border-t border-[#1a4442] text-center">
                    <div className="bg-[#123634] p-1 rounded">
                      <span className="text-emerald-400 font-bold block">CASH</span>
                      <span className="text-white font-semibold">{tenderSummary.cash.toFixed(2)}</span>
                    </div>
                    <div className="bg-[#123634] p-1 rounded">
                      <span className="text-emerald-400 font-bold block">CARD</span>
                      <span className="text-white font-semibold">{tenderSummary.card.toFixed(2)}</span>
                    </div>
                    <div className="bg-[#123634] p-1 rounded">
                      <span className="text-emerald-400 font-bold block">CHEQUE</span>
                      <span className="text-white font-semibold">{tenderSummary.cheque.toFixed(2)}</span>
                    </div>
                    <div className="bg-[#123634] p-1 rounded">
                      <span className="text-emerald-400 font-bold block">OTHERS</span>
                      <span className="text-white font-semibold">{tenderSummary.others.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Left Form Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-emerald-300 font-bold uppercase block mb-0.5">PRINT TYPE</label>
                    <select
                      value={printTemplate}
                      onChange={(e) => setPrintTemplate(e.target.value as 'Default' | 'Thermal 80mm' | 'A4')}
                      className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-teal-400"
                    >
                      <option value="Default">Default</option>
                      <option value="Thermal 80mm">Thermal 80mm</option>
                      <option value="A4">A4 Sheet</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-emerald-300 font-bold uppercase block mb-0.5">REF NO</label>
                    <input
                      type="text"
                      placeholder="Ref / Voucher #"
                      value={refNo}
                      onChange={(e) => setRefNo(e.target.value)}
                      className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-teal-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-emerald-300 font-bold uppercase block mb-0.5">PONO/BOXNO</label>
                    <input
                      type="text"
                      placeholder="PO / Box #"
                      value={poNo}
                      onChange={(e) => setPoNo(e.target.value)}
                      className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-teal-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-emerald-300 font-bold uppercase block mb-0.5">CREDIT LIMIT</label>
                    <div className="bg-[#163e3c] border border-[#1b4d4b] rounded px-2 py-1 text-emerald-300 text-xs font-semibold">
                      Rs {selectedCustomer?.credit_limit ? Number(selectedCustomer.credit_limit).toFixed(2) : '0.00'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-emerald-300 font-bold uppercase block mb-0.5">DUE DAYS</label>
                    <input
                      type="text"
                      placeholder="30"
                      value={effectiveDueDays}
                      onChange={(e) => setDueDays(e.target.value)}
                      className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-teal-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-emerald-300 font-bold uppercase block mb-0.5">SMS NUMBER</label>
                    <input
                      type="text"
                      placeholder="94701518680"
                      value={effectiveSmsNumber}
                      onChange={(e) => setSmsNumber(e.target.value)}
                      className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-teal-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-emerald-300 font-bold uppercase block mb-0.5">ACCOUNT</label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-teal-400"
                  >
                    <option value="">Select Account</option>
                    {(bankAccountsQuery.data || []).map(a => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-emerald-300 font-bold uppercase block mb-0.5">NOTE</label>
                  <textarea
                    rows={2}
                    placeholder="Settlement notes..."
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded p-1.5 text-white text-xs focus:outline-none focus:border-teal-400 resize-none"
                  />
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    disabled={postInvoiceMutation.isPending}
                    onClick={() => postInvoiceMutation.mutate()}
                    className="w-full bg-[#00c853] hover:bg-[#00b047] text-white font-black py-2.5 px-4 rounded shadow-lg text-sm tracking-wider uppercase transition flex items-center justify-center gap-2"
                  >
                    {postInvoiceMutation.isPending ? 'PROCESSING...' : 'BILL / PAY'}
                  </button>
                </div>
              </div>

              {/* RIGHT COLUMN: Discounts, Cash Tender, Presets, Split & Cheques (7 Cols) */}
              <div className="col-span-7 flex flex-col gap-2.5 border-l border-[#194b48] pl-3">

                {/* Discount Boxes & Paid Box */}
                <div>
                  <label className="text-[10px] text-emerald-300 font-bold uppercase block mb-0.5">DISCOUNT</label>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <input
                      type="number"
                      placeholder="Discount Rs"
                      value={billDiscountRs || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        setBillDiscountRs(val)
                        if (rawGrandTotal > 0) {
                          setBillDiscountPercent(Math.round(((val / rawGrandTotal) * 100) * 100) / 100)
                        }
                      }}
                      className="bg-[#163e3c] border border-[#1b4d4b] rounded px-2.5 py-1 text-white text-xs text-right focus:outline-none focus:border-teal-400"
                    />
                    <input
                      type="number"
                      placeholder="Discount %"
                      value={billDiscountPercent || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        setBillDiscountPercent(val)
                        if (rawGrandTotal > 0) {
                          setBillDiscountRs(Math.round((rawGrandTotal * (val / 100)) * 100) / 100)
                        }
                      }}
                      className="bg-[#163e3c] border border-[#1b4d4b] rounded px-2.5 py-1 text-white text-xs text-right focus:outline-none focus:border-teal-400"
                    />
                  </div>

                  <label className="text-[10px] text-emerald-300 font-bold uppercase block mb-0.5">PAID</label>
                  <input
                    ref={paidInputRef}
                    type="number"
                    step="0.01"
                    value={modalPaidAmount || ''}
                    onChange={(e) => setModalPaidAmount(Math.max(0, Number(e.target.value)))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') postInvoiceMutation.mutate()
                    }}
                    className="w-full bg-[#184644] border-2 border-teal-400/80 rounded px-3 py-2 text-3xl font-black text-white text-right focus:outline-none focus:ring-2 focus:ring-teal-300 shadow-inner"
                  />
                </div>

                {/* Quick Cash Presets */}
                <div className="grid grid-cols-5 gap-1.5">
                  {[10, 20, 50, 100, 500].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleCashPreset(val)}
                      className="bg-[#123b38] hover:bg-[#1a524e] border border-[#1e5854] text-white font-bold py-1.5 rounded transition text-xs"
                    >
                      +{val.toFixed(2)}
                    </button>
                  ))}
                  {[1000, 5000].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleCashPreset(val)}
                      className="bg-[#123b38] hover:bg-[#1a524e] border border-[#1e5854] text-white font-bold py-1.5 rounded transition text-xs"
                    >
                      +{val.toFixed(2)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleExactCash}
                    className="bg-[#0e7472] hover:bg-[#118f8c] border border-teal-500 text-white font-black py-1.5 rounded transition text-xs col-span-2"
                  >
                    Exact ({formatRs(grandTotalAmount)})
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCash}
                    className="bg-[#3b1717] hover:bg-[#5c2424] border border-red-900/60 text-red-200 font-bold py-1.5 rounded transition text-xs"
                  >
                    Clear
                  </button>
                </div>

                {/* Split Tender Strip */}
                <div className="bg-[#0a1e1d] border border-[#164341] rounded p-2 flex flex-col gap-1.5">
                  <span className="text-[10px] text-teal-300 font-bold uppercase tracking-wider block">
                    CARD / BANK / SPLIT TENDER
                  </span>
                  <div className="grid grid-cols-12 gap-1.5 items-center">
                    <div className="col-span-2">
                      <label className="text-[9px] text-emerald-400 block">CF%</label>
                      <input
                        type="number"
                        placeholder="X%"
                        value={splitCfPercent || ''}
                        onChange={(e) => setSplitCfPercent(Number(e.target.value))}
                        className="w-full bg-[#143c3a] border border-[#1b4d4b] rounded px-1.5 py-1 text-white text-xs text-right"
                      />
                    </div>
                    <div className="col-span-4">
                      <label className="text-[9px] text-emerald-400 block">CARD/BANK</label>
                      <select
                        value={splitChannel}
                        onChange={(e) => setSplitChannel(e.target.value)}
                        className="w-full bg-[#143c3a] border border-[#1b4d4b] rounded px-1.5 py-1 text-white text-xs"
                      >
                        <option value="Daraz">Daraz</option>
                        <option value="Commercial Bank">Commercial Bank</option>
                        <option value="Bank of Ceylon">Bank of Ceylon</option>
                        <option value="Hatton National Bank">Hatton National Bank</option>
                        <option value="Card Terminal 1">Card Terminal 1</option>
                        <option value="Others">Others</option>
                      </select>
                    </div>
                    <div className="col-span-4">
                      <label className="text-[9px] text-emerald-400 block">AMOUNT</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={splitAmount || ''}
                        onChange={(e) => setSplitAmount(Number(e.target.value))}
                        className="w-full bg-[#143c3a] border border-[#1b4d4b] rounded px-2 py-1 text-white text-xs text-right font-bold"
                      />
                    </div>
                    <div className="col-span-2 flex items-end pt-3">
                      <button
                        type="button"
                        onClick={addSplitPayment}
                        className="w-full bg-[#00c853] hover:bg-[#00b047] text-white font-bold py-1 rounded transition text-xs text-center"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Split Table */}
                  {splitPayments.length > 0 && (
                    <div className="mt-1 border border-[#194b48] rounded overflow-hidden">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-[#123634] text-emerald-300">
                          <tr>
                            <th className="py-1 px-2">JOURNAL NAME</th>
                            <th className="py-1 px-2 text-right">CF%</th>
                            <th className="py-1 px-2 text-right">AMOUNT</th>
                            <th className="py-1 px-2 text-center w-8">-</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#133735]">
                          {splitPayments.map(p => (
                            <tr key={p.id}>
                              <td className="py-1 px-2 text-white">{p.journalName}</td>
                              <td className="py-1 px-2 text-right text-emerald-300">{p.cfPercent}%</td>
                              <td className="py-1 px-2 text-right font-bold text-teal-300">{p.amount.toFixed(2)}</td>
                              <td className="py-1 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeSplitPayment(p.id)}
                                  className="text-red-400 hover:text-white"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Cheque & Card Details Drawer (Accordion / Collapsible) */}
                <div className="bg-[#0a1e1d] border border-[#164341] rounded p-2 text-[10px]">
                  <span className="text-emerald-400 font-bold block mb-1">CHEQUE / CARD DETAILS (OPTIONAL)</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    <div>
                      <span className="text-emerald-500 block mb-0.5">Cheque No</span>
                      <input
                        type="text"
                        placeholder="CHQ-0001"
                        value={chequeNo}
                        onChange={(e) => setChequeNo(e.target.value)}
                        className="w-full bg-[#143c3a] border border-[#1b4d4b] rounded p-1 text-white"
                      />
                    </div>
                    <div>
                      <span className="text-emerald-500 block mb-0.5">Bank</span>
                      <input
                        type="text"
                        placeholder="Bank Name"
                        value={chequeBank}
                        onChange={(e) => setChequeBank(e.target.value)}
                        className="w-full bg-[#143c3a] border border-[#1b4d4b] rounded p-1 text-white"
                      />
                    </div>
                    <div>
                      <span className="text-emerald-500 block mb-0.5">Date</span>
                      <input
                        type="date"
                        value={chequeDate}
                        onChange={(e) => setChequeDate(e.target.value)}
                        className="w-full bg-[#143c3a] border border-[#1b4d4b] rounded p-1 text-white"
                      />
                    </div>
                    <div>
                      <span className="text-emerald-500 block mb-0.5">Cheque Amount</span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={chequeAmount || ''}
                        onChange={(e) => setChequeAmount(Number(e.target.value))}
                        className="w-full bg-[#143c3a] border border-[#1b4d4b] rounded p-1 text-white text-right font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Actions inside Modal */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#194b48]">
                  <button
                    type="button"
                    onClick={() => void handleHoldBill()}
                    className="bg-amber-950/80 hover:bg-amber-900 border border-amber-600/70 text-amber-200 hover:text-white font-bold py-2 px-4 rounded transition text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <PauseCircle size={14} /> HOLD BILL (F8)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowProcessEndModal(false)}
                    className="bg-red-950 hover:bg-red-900 text-red-200 font-semibold py-2 px-4 rounded transition text-xs"
                  >
                    CANCEL (Esc)
                  </button>
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* ── 6. FAST PRODUCT SEARCH MODAL (F2) ─────────────────────────────── */}
      {showProductSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
          <div className="bg-[#0c2423] border border-[#1b4d4b] rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-[#091b1a] border-b border-[#1b4d4b]">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Search size={16} className="text-teal-400" /> SELECT PRODUCT (F2)
              </h3>
              <button
                type="button"
                onClick={() => setShowProductSearchModal(false)}
                className="text-emerald-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 border-b border-[#1b4d4b]">
              <input
                type="text"
                autoFocus
                placeholder="Search by code, SKU, or product name..."
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                className="w-full bg-[#163e3c] border border-teal-500/60 rounded px-3 py-2 text-white text-xs focus:outline-none focus:border-teal-300"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <ProductSearchResults
                searchTerm={productSearchTerm}
                locationId={effectiveLocationId}
                onSelect={(prod) => {
                  handleProductSelect(prod)
                  setShowProductSearchModal(false)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 7. QUICK ADD CUSTOMER MODAL ───────────────────────────────────── */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
          <div className="bg-[#0c2423] border border-[#1b4d4b] rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#091b1a] border-b border-[#1b4d4b]">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <UserPlus size={16} className="text-cyan-400" /> QUICK REGISTER CUSTOMER
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(false)}
                className="text-emerald-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-4 flex flex-col gap-3 text-xs">
              <div>
                <label className="text-emerald-300 font-semibold block mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. A.M.Dinesh Anuruddha"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded px-3 py-1.5 text-white focus:outline-none focus:border-teal-400"
                />
              </div>

              <div>
                <label className="text-emerald-300 font-semibold block mb-1">Mobile / Phone Number</label>
                <input
                  type="text"
                  placeholder="e.g. 0771234567"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded px-3 py-1.5 text-white focus:outline-none focus:border-teal-400"
                />
              </div>

              <div>
                <label className="text-emerald-300 font-semibold block mb-1">Address / City</label>
                <input
                  type="text"
                  placeholder="e.g. 129/2, Main St, Kataragama"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded px-3 py-1.5 text-white focus:outline-none focus:border-teal-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-emerald-300 font-semibold block mb-1">Credit Limit (Rs)</label>
                  <input
                    type="number"
                    value={newCustCreditLimit}
                    onChange={(e) => setNewCustCreditLimit(Number(e.target.value))}
                    className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded px-3 py-1.5 text-white text-right focus:outline-none focus:border-teal-400"
                  />
                </div>
                <div>
                  <label className="text-emerald-300 font-semibold block mb-1">Credit Days</label>
                  <input
                    type="number"
                    value={newCustCreditDays}
                    onChange={(e) => setNewCustCreditDays(Number(e.target.value))}
                    className="w-full bg-[#163e3c] border border-[#1b4d4b] rounded px-3 py-1.5 text-white text-right focus:outline-none focus:border-teal-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1b4d4b]">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="px-3 py-1.5 bg-[#143c3a] text-emerald-200 rounded hover:bg-[#1a4e4b]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#00a8e8] text-white font-bold rounded hover:bg-[#0094cc]"
                >
                  Save & Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 8. RECALL HELD BILLS MODAL (F9) ───────────────────────────────── */}
      {showHeldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
          <div className="bg-[#0c2423] border border-[#1b4d4b] rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-[#091b1a] border-b border-[#1b4d4b]">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <FileText size={16} className="text-amber-400" /> RECALL HELD INVOICES (F9)
              </h3>
              <button
                type="button"
                onClick={() => setShowHeldModal(false)}
                className="text-emerald-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 divide-y divide-[#164341]">
              {(heldBillsQuery.data || []).length === 0 ? (
                <div className="py-12 text-center text-teal-400/60 flex flex-col items-center justify-center gap-2">
                  <Clock size={28} className="text-teal-600/50" />
                  <p className="text-sm font-semibold">No held bills found for this branch.</p>
                  <p className="text-xs text-teal-500/50">Press F8 or click &quot;HOLD (F8)&quot; on any active cart to hold it.</p>
                </div>
              ) : (
                heldBillsQuery.data?.map((inv: SalesInvoiceRow) => (
                  <div key={inv.id} className="py-3 px-3 flex items-center justify-between hover:bg-[#0e2c2a] rounded transition">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#00d2ff] text-sm tracking-wide">{inv.invoice_number}</span>
                        <span className="text-emerald-300 font-semibold text-xs">
                          {inv.customer_name || 'Walk-in Customer'}
                        </span>
                        {inv.customer_phone && (
                          <span className="text-[11px] text-teal-400/70 font-mono">({inv.customer_phone})</span>
                        )}
                      </div>
                      <div className="text-[11px] text-teal-300/70 flex items-center gap-3">
                        <span>Date: {inv.held_at ? new Date(inv.held_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : inv.invoice_date}</span>
                        <span>Total: <strong className="text-amber-400 font-mono font-bold">Rs {Number(inv.grand_total || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</strong></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={cancelHeldMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Discard held bill ${inv.invoice_number}?`)) {
                            cancelHeldMutation.mutate(inv.id)
                          }
                        }}
                        className="bg-red-950/60 hover:bg-red-900 border border-red-800/80 text-red-300 hover:text-white px-2.5 py-1.5 rounded text-xs transition flex items-center gap-1 cursor-pointer"
                        title="Cancel and discard this held bill"
                      >
                        <Trash2 size={12} /> Discard
                      </button>
                      <button
                        type="button"
                        disabled={recallMutation.isPending}
                        onClick={() => recallMutation.mutate(inv.id)}
                        className="bg-[#0e7472] hover:bg-[#118f8c] text-white font-bold px-3 py-1.5 rounded text-xs transition shadow-sm cursor-pointer"
                      >
                        {recallMutation.isPending ? 'Recalling...' : 'Recall to Cart'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 9. THERMAL RECEIPT (80mm @media print) ────────────────────────── */}
      {lastReceipt && (
        <div className="receipt-only font-mono text-[11px] leading-tight text-black p-2 max-w-[72mm]">
          <div className="text-center font-bold text-sm pb-1 border-b border-black">
            {lastReceipt.branchName}
          </div>
          <div className="text-center text-[10px] pb-1">
            Baby Bloom Business Suite
          </div>
          <div className="py-1 border-b border-dashed border-black text-[10px]">
            <div>Inv #: {lastReceipt.number}</div>
            <div>Date: {lastReceipt.date}</div>
            <div>Customer: {lastReceipt.customerName}</div>
            {lastReceipt.customerPhone && <div>Tel: {lastReceipt.customerPhone}</div>}
          </div>

          <div className="py-1 border-b border-dashed border-black">
            {lastReceipt.items.map((it, idx: number) => (
              <div key={idx} className="mb-1">
                <div className="font-semibold truncate">{it.name}</div>
                <div className="flex justify-between text-[10px]">
                  <span>{it.qty} x Rs {Number(it.price).toFixed(2)}</span>
                  <span>Rs {Number(it.total).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="py-1 border-b border-black space-y-0.5 text-right font-semibold">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>Rs {Number(lastReceipt.subtotal).toFixed(2)}</span>
            </div>
            {lastReceipt.discount > 0 && (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span>- Rs {Number(lastReceipt.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs font-bold pt-1 border-t border-dashed border-black">
              <span>TOTAL:</span>
              <span>Rs {Number(lastReceipt.grandTotal).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Tendered:</span>
              <span>Rs {Number(lastReceipt.tendered).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Change:</span>
              <span>Rs {Number(lastReceipt.change).toFixed(2)}</span>
            </div>
            {lastReceipt.balance > 0 && (
              <div className="flex justify-between text-[10px] text-red-600 font-bold">
                <span>Balance Due:</span>
                <span>Rs {Number(lastReceipt.balance).toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="text-center pt-2 text-[9px]">
            Thank you for shopping with us!<br />
            Goods once sold cannot be returned without receipt.
          </div>
        </div>
      )}

      {/* ── 10. LIVE CAMERA BARCODE SCANNER MODAL ───────────────────────── */}
      <BarcodeScannerModal
        isOpen={showBarcodeScannerModal}
        onClose={() => setShowBarcodeScannerModal(false)}
        onScan={handleProcessBarcodeScan}
        title="POS Live Camera Barcode Scanner"
      />

    </div>
  )
}

// ── Product Search Sub-Component ─────────────────────────────────────────────
function ProductSearchResults({
  searchTerm,
  locationId,
  onSelect,
}: {
  searchTerm: string
  locationId: string
  onSelect: (p: PosProduct) => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['pos-search-modal', searchTerm, locationId],
    queryFn: () => listPosProducts(searchTerm, locationId),
  })

  if (isLoading) {
    return <div className="py-8 text-center text-emerald-400">Searching products...</div>
  }

  if (!data || data.length === 0) {
    return <div className="py-8 text-center text-emerald-600">No products found matching "{searchTerm}"</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
      {data.map(p => (
        <div
          key={p.product_variant_id}
          onClick={() => onSelect(p)}
          className="bg-[#0f2d2b] border border-[#164341] hover:border-teal-400 hover:bg-[#153f3c] p-2.5 rounded cursor-pointer transition flex flex-col justify-between"
        >
          <div>
            <div className="flex items-start justify-between">
              <span className="font-bold text-cyan-300">{p.product_code}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                p.available_quantity > 0 ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'
              }`}>
                Stock: {Number(p.available_quantity).toFixed(0)}
              </span>
            </div>
            <div className="font-semibold text-white mt-1">{p.product_name}</div>
            {p.variant_name && <div className="text-[10px] text-emerald-400">{p.variant_name}</div>}
          </div>
          <div className="flex items-center justify-between mt-2 pt-1 border-t border-[#1a4745]">
            <span className="text-[10px] text-emerald-500 font-mono">{p.barcode || p.sku}</span>
            <span className="font-black text-white text-sm">Rs {Number(p.retail_price).toFixed(2)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
