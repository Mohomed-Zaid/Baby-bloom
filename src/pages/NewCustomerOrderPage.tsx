import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import {
  Package,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ArrowLeft,
  Truck,
  MapPin,
  Phone,
  Calendar,
  Building,
  DollarSign,
  User,
  CreditCard,
  AlertCircle,
  ExternalLink,
  Plus,
  ShoppingBag,
} from 'lucide-react'
import {
  fetchCustomersLookup,
  fetchBranchesLookup,
  fetchWarehousesAndLocations,
  fetchVariantsLookup,
  fetchCustomerCreditStatus,
  fetchCustomerTierPrice,
  createCustomerOrder,
} from '../services/orderService'
import type {
  CustomerCreditStatus,
  PricingTier,
  DeliveryType,
} from '../types/orders'

interface OrderLineDraft {
  product_variant_id: string
  variant_name: string
  sku: string
  available_stock: number
  ordered_quantity: number
  unit_price: number
  discount_amount: number
  line_total: number
}

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0)
}

const POPULAR_COURIERS = [
  'PromptX Courier',
  'Domex Express Logistics',
  'Koombiyo Delivery',
  'Certis Lanka Courier',
  'CityPak Logistics',
  'Fardar Express',
  'Pronto Lanka',
  'Sri Lanka Post (EMS)',
]

export function NewCustomerOrderPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── Global Toast ──────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Header & Logistics State ──────────────────────────────────────────────
  const [branchId, setBranchId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [pricingTier, setPricingTier] = useState<PricingTier>('retail')
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('courier')
  const [courierName, setCourierName] = useState('PromptX Courier')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(
    new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
  )
  const [notes, setNotes] = useState('')

  // ── Payment & Advance State ───────────────────────────────────────────────
  const [advancePaid, setAdvancePaid] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank_transfer' | 'cheque'>('cash')

  // ── Items State ───────────────────────────────────────────────────────────
  const [lines, setLines] = useState<OrderLineDraft[]>([])
  const [selectedVariantId, setSelectedVariantId] = useState('')

  // ── Lookups ───────────────────────────────────────────────────────────────
  const { data: branches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: fetchBranchesLookup,
  })

  // Active Locations
  const activeBranchId = branchId || (branches[0]?.id ?? '')
  const { data: whLocData } = useQuery({
    queryKey: ['lookup', 'warehouses-locations', activeBranchId],
    queryFn: () => fetchWarehousesAndLocations(activeBranchId),
    enabled: !!activeBranchId,
  })

  const activeWarehouseId = warehouseId || (whLocData?.warehouses?.[0]?.id ?? '')
  const activeLocationId = locationId || (whLocData?.locations?.[0]?.id ?? '')

  const { data: customers = [] } = useQuery({
    queryKey: ['lookup', 'customers'],
    queryFn: fetchCustomersLookup,
  })

  const { data: variants = [] } = useQuery({
    queryKey: ['lookup', 'variants', activeLocationId],
    queryFn: () => fetchVariantsLookup(activeLocationId),
    enabled: !!activeLocationId,
  })

  // Customer Credit Status
  const { data: creditStatus, isLoading: creditLoading } = useQuery<CustomerCreditStatus | null>({
    queryKey: ['customer-credit', customerId],
    queryFn: () => (customerId ? fetchCustomerCreditStatus(customerId) : null),
    enabled: !!customerId,
  })

  const handleCustomerChange = (selectedId: string) => {
    setCustomerId(selectedId)
    if (selectedId && customers.length > 0) {
      const cust = customers.find((c) => c.id === selectedId)
      if (cust) {
        setDeliveryAddress(cust.address || '')
        setContactPhone(cust.phone || '')
        if (cust.pricing_tier) {
          setPricingTier(cust.pricing_tier as PricingTier)
        }
      }
    }
  }

  // ── Financial Calculations ────────────────────────────────────────────────
  const subtotal = useMemo(() => {
    return lines.reduce((acc, l) => acc + l.ordered_quantity * l.unit_price, 0)
  }, [lines])

  const discountTotal = useMemo(() => {
    return lines.reduce((acc, l) => acc + l.discount_amount, 0)
  }, [lines])

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - discountTotal)
  }, [subtotal, discountTotal])

  const balanceAmount = useMemo(() => {
    return Math.max(0, grandTotal - advancePaid)
  }, [grandTotal, advancePaid])

  // Credit limit calculations
  const isCreditBlocked = creditStatus?.is_credit_blocked ?? false
  const currentOutstanding = creditStatus?.total_outstanding ?? 0
  const creditLimit = creditStatus?.credit_limit ?? 0
  const projectedBalance = currentOutstanding + balanceAmount
  const isOverLimit = creditLimit > 0 && projectedBalance > creditLimit

  // ── Add Line Item ─────────────────────────────────────────────────────────
  const handleAddLine = async (variantId: string) => {
    if (!variantId || variants.length === 0) return
    const v = variants.find((item) => item.id === variantId)
    if (!v) return

    if (lines.some((l) => l.product_variant_id === variantId)) {
      notify('This product is already added. Adjust quantity in the table below.', true)
      return
    }

    let resolvedPrice = v.retail_price
    if (customerId) {
      try {
        const tierPrice = await fetchCustomerTierPrice(customerId, variantId)
        if (tierPrice > 0) resolvedPrice = tierPrice
      } catch {
        // fallback
      }
    } else {
      if (pricingTier === 'wholesale') resolvedPrice = v.wholesale_price || v.retail_price
      if (pricingTier === 'special' || pricingTier === 'tier_1') resolvedPrice = v.special_price || v.retail_price
    }

    const availableStock = v.available_quantity ?? 50
    const newLine: OrderLineDraft = {
      product_variant_id: v.id,
      variant_name: `${v.product?.name ? v.product.name + ' - ' : ''}${v.variant_name}`,
      sku: v.sku,
      available_stock: availableStock,
      ordered_quantity: 1,
      unit_price: resolvedPrice,
      discount_amount: 0,
      line_total: resolvedPrice,
    }

    setLines([...lines, newLine])
    setSelectedVariantId('')
    notify(`Added ${newLine.variant_name}`)
  }

  const updateLine = (index: number, field: keyof OrderLineDraft, value: number) => {
    const next = [...lines]
    const current = { ...next[index]! }

    if (field === 'ordered_quantity') current.ordered_quantity = value
    if (field === 'unit_price') current.unit_price = value
    if (field === 'discount_amount') current.discount_amount = value

    current.line_total = Math.max(0, current.ordered_quantity * current.unit_price - current.discount_amount)
    next[index] = current
    setLines(next)
  }

  const removeLine = (index: number) => {
    setLines(lines.filter((_, idx) => idx !== index))
  }

  // ── Mutation: Create Customer Order ───────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createCustomerOrder(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] })
      notify(`Order ${data.order_number} confirmed & inventory reserved!`)
      setTimeout(() => {
        navigate('/sales/orders')
      }, 1200)
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to book customer order', true)
    },
  })

  const handleSubmitOrder = () => {
    if (!customerId) {
      notify('Please select a customer for this order', true)
      return
    }
    if (lines.length === 0) {
      notify('Please add at least one line item to the order', true)
      return
    }
    if (deliveryType === 'courier' && !deliveryAddress.trim()) {
      notify('Courier delivery requires a destination address', true)
      return
    }

    const payload = {
      branch_id: activeBranchId,
      warehouse_id: activeWarehouseId || null,
      stock_location_id: activeLocationId || null,
      customer_id: customerId,
      order_date: new Date().toISOString().split('T')[0],
      pricing_tier: pricingTier,
      delivery_type: deliveryType,
      courier_name: deliveryType === 'courier' ? courierName : null,
      tracking_number: deliveryType === 'courier' ? trackingNumber : null,
      delivery_address: deliveryAddress,
      contact_phone: contactPhone,
      expected_delivery_date: expectedDeliveryDate || null,
      subtotal,
      discount_total: discountTotal,
      tax_total: 0,
      grand_total: grandTotal,
      advance_paid: advancePaid,
      payment_method: paymentMethod,
      balance_amount: balanceAmount,
      notes,
      items: lines.map((l) => ({
        product_variant_id: l.product_variant_id,
        ordered_quantity: l.ordered_quantity,
        unit_price: l.unit_price,
        discount_amount: l.discount_amount,
        tax_amount: 0,
        line_total: l.line_total,
      })),
    }

    createMutation.mutate(payload)
  }

  return (
    <div
      className="min-h-screen text-[#e2f1ef] p-6 space-y-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* ── TOAST NOTIFICATION ──────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 transition-all duration-300 ${
            toast.isError
              ? 'bg-[#1e0a0f] border-[#5e1624] text-[#f43f5e]'
              : 'bg-[#062320] border-[#164e48] text-[#38d4c5]'
          }`}
        >
          {toast.isError ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* ── TOP HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#164e48] pb-6">
        <div className="flex items-center gap-3">
          <Link
            to="/sales/orders"
            className="p-2.5 bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] rounded-xl text-[#a0c4c0] hover:text-white transition-colors"
            title="Back to Customer Orders List"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <Package className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                New Customer Order & Delivery Booking
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Advance Booking & Logistics
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Book customer advance orders with real-time credit check, pricing tiers, courier dispatch & stock reservation
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/sales/orders')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            All Customer Orders
          </button>

          <button
            onClick={() => navigate('/sales/pos')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            POS Terminal
          </button>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Items in Order */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Order Items</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5]">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              {lines.length} lines
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5">
            Total items to be reserved in inventory
          </div>
        </div>

        {/* 2. Net Grand Total */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Order Value</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-emerald-400 tracking-tight">
              LKR {formatCurrency(grandTotal)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5 flex justify-between">
            <span>Subtotal: {formatCurrency(subtotal)}</span>
            <span className="text-[#38d4c5]">Disc: -{formatCurrency(discountTotal)}</span>
          </div>
        </div>

        {/* 3. Advance Deposited */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Advance Deposit</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-blue-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-blue-300 tracking-tight">
              LKR {formatCurrency(advancePaid)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5 capitalize">
            Payment Method: <span className="text-white font-medium">{paymentMethod.replace('_', ' ')}</span>
          </div>
        </div>

        {/* 4. Balance upon Handover */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">COD Balance</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-amber-400">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-amber-300 tracking-tight">
              LKR {formatCurrency(balanceAmount)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5">
            Payable upon customer delivery handover
          </div>
        </div>
      </div>

      {/* ── MAIN TWO-COLUMN FORM LAYOUT ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT 2 COLUMNS: CUSTOMER, LOGISTICS & ITEMS */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Customer Selection & Credit Control */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-5 shadow-sm backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#164e48]">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-[#38d4c5]" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Customer & Commercial Credit Control
                </h2>
              </div>
              <span className="text-xs text-[#7aa5a0]">Live Ledger Verification</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">
                  Select Customer *
                </label>
                <select
                  value={customerId}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white font-medium focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="">-- Choose Registered Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.customer_code}) {c.credit_limit > 0 ? `• Limit: LKR ${formatCurrency(c.credit_limit)}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">
                  Pricing Tier
                </label>
                <select
                  value={pricingTier}
                  onChange={(e) => setPricingTier(e.target.value as PricingTier)}
                  className="w-full px-3.5 py-2.5 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white uppercase font-bold focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="retail">Retail Tier (Standard POS)</option>
                  <option value="wholesale">Wholesale Tier</option>
                  <option value="tier_1">Tier 1 (Distributor / Agent)</option>
                  <option value="tier_2">Tier 2 (Bulk Commercial)</option>
                  <option value="special">Special / Key Account</option>
                </select>
              </div>
            </div>

            {/* Credit Health Banner */}
            {customerId && creditStatus && !creditLoading && (
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
                  isCreditBlocked
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : isOverLimit
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                }`}
              >
                {isCreditBlocked ? (
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                ) : isOverLimit ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                )}

                <div className="space-y-1.5 w-full">
                  <div className="font-bold flex items-center justify-between">
                    <span className="uppercase tracking-wider">
                      {isCreditBlocked
                        ? 'CUSTOMER CREDIT BLOCKED'
                        : isOverLimit
                        ? 'CREDIT LIMIT WARNING (OVERDRAFT)'
                        : 'CUSTOMER IN GOOD CREDIT STANDING'}
                    </span>
                    <span className="font-mono">
                      Limit: LKR {formatCurrency(creditLimit)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-white/10 font-mono text-[11px]">
                    <div>
                      <span className="text-[#a0c4c0] block text-[10px] uppercase font-sans">Current Outstanding:</span>
                      LKR {formatCurrency(currentOutstanding)}
                    </div>
                    <div>
                      <span className="text-[#a0c4c0] block text-[10px] uppercase font-sans">Order Balance:</span>
                      LKR {formatCurrency(balanceAmount)}
                    </div>
                    <div>
                      <span className="text-[#a0c4c0] block text-[10px] uppercase font-sans">Projected Balance:</span>
                      LKR {formatCurrency(projectedBalance)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Delivery Booking & Courier Logistics */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-5 shadow-sm backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#164e48]">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-[#38d4c5]" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Delivery Logistics & Courier Booking
                </h2>
              </div>
              <span className="text-xs text-[#7aa5a0]">Dispatch Routing</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">
                  Fulfillment Mode *
                </label>
                <select
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value as DeliveryType)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="courier">Courier Parcel Delivery</option>
                  <option value="pickup">Store / Branch Pickup</option>
                  <option value="direct">Direct Company Vehicle</option>
                </select>
              </div>

              {deliveryType === 'courier' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">
                      Courier Partner
                    </label>
                    <select
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                    >
                      {POPULAR_COURIERS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">
                      Tracking / AWB #
                    </label>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="e.g. PRX-8849201"
                      className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#38d4c5]" />
                  Delivery Destination Address *
                </label>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Street, City, Postal Code for delivery..."
                  rows={2}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-[#38d4c5]" />
                    Recipient Phone Number
                  </label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="07X XXXXXXX"
                    className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#38d4c5]" />
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Line Items & Live Inventory Allocation */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-5 shadow-sm backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#164e48]">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#38d4c5]" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Order Line Items & Live Inventory
                </h2>
              </div>

              <span className="text-xs font-mono text-[#38d4c5]">
                {lines.length} items configured
              </span>
            </div>

            {/* Product Variant Picker Dropdown */}
            <div className="flex gap-2">
              <select
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                className="flex-1 px-3.5 py-2.5 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
              >
                <option value="">-- Choose Product Variant to Add --</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.product?.name} - {v.variant_name} ({v.sku}) • Available: {v.available_quantity ?? 50}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  if (selectedVariantId) {
                    handleAddLine(selectedVariantId)
                  } else {
                    notify('Please select a product variant from the list', true)
                  }
                }}
                className="px-4 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-[#00b4d8]/20"
              >
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>

            {/* Line Items Table */}
            {lines.length > 0 ? (
              <div className="border border-[#164e48] rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#082824] text-[#7aa5a0] border-b border-[#164e48] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="p-3">Product / SKU</th>
                      <th className="p-3 text-center">Available</th>
                      <th className="p-3 text-center">Order Qty</th>
                      <th className="p-3 text-right">Unit Price (LKR)</th>
                      <th className="p-3 text-right">Line Disc.</th>
                      <th className="p-3 text-right">Total (LKR)</th>
                      <th className="p-3 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#164e48]/50 text-white">
                    {lines.map((line, idx) => (
                      <tr key={line.product_variant_id} className="hover:bg-[#0a2e2a]/50 transition-colors">
                        <td className="p-3">
                          <div className="font-semibold text-white">{line.variant_name}</div>
                          <div className="font-mono text-[11px] text-[#7aa5a0]">{line.sku}</div>
                        </td>

                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              line.available_stock > 10
                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                : line.available_stock > 0
                                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                            }`}
                          >
                            {line.available_stock} in stock
                          </span>
                        </td>

                        <td className="p-3 text-center">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={line.ordered_quantity}
                            onChange={(e) =>
                              updateLine(idx, 'ordered_quantity', Math.max(1, parseFloat(e.target.value) || 1))
                            }
                            className="w-16 px-2 py-1 bg-[#0c2e2a] border border-[#164e48] rounded text-center font-bold text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                          />
                        </td>

                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) =>
                              updateLine(idx, 'unit_price', Math.max(0, parseFloat(e.target.value) || 0))
                            }
                            className="w-24 px-2 py-1 bg-[#0c2e2a] border border-[#164e48] rounded text-right font-mono font-medium text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                          />
                        </td>

                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.discount_amount}
                            onChange={(e) =>
                              updateLine(idx, 'discount_amount', Math.max(0, parseFloat(e.target.value) || 0))
                            }
                            className="w-20 px-2 py-1 bg-[#0c2e2a] border border-[#164e48] rounded text-right font-mono text-emerald-300 focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                          />
                        </td>

                        <td className="p-3 text-right font-mono font-bold text-[#38d4c5] text-sm">
                          {formatCurrency(line.line_total)}
                        </td>

                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="text-[#7aa5a0] hover:text-rose-400 p-1 rounded transition-colors"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed border-[#164e48] rounded-xl text-[#7aa5a0]">
                <Package className="w-10 h-10 mx-auto text-[#164e48] mb-2" />
                <p className="text-sm font-semibold text-white">No Items Added to Order Yet</p>
                <p className="text-xs mt-1">Select a product variant above to add to this customer booking.</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT 1 COLUMN: FULFILLMENT LOCATION & FINANCIAL SUMMARY */}
        <div className="space-y-6">
          {/* Card 4: Fulfillment Location */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-5 shadow-sm backdrop-blur-md space-y-3.5">
            <div className="flex items-center gap-2 pb-2.5 border-b border-[#164e48]">
              <Building className="w-4 h-4 text-[#38d4c5]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Fulfillment Location
              </h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">Dispatch Branch</label>
              <select
                value={branchId || activeBranchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">Warehouse</label>
                <select
                  value={warehouseId || activeWarehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full px-2.5 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  {whLocData?.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">Bin / Location</label>
                <select
                  value={locationId || activeLocationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full px-2.5 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  {whLocData?.locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Card 5: Financial Summary & Advance Payment */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-5 shadow-sm backdrop-blur-md space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-[#164e48]">
              <DollarSign className="w-4 h-4 text-[#38d4c5]" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Order Financial Summary
              </h3>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-[#a0c4c0]">
                <span>Gross Subtotal:</span>
                <span className="font-mono font-semibold text-white">LKR {formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-[#a0c4c0]">
                <span>Discount Allowance:</span>
                <span className="font-mono font-semibold text-[#38d4c5]">- LKR {formatCurrency(discountTotal)}</span>
              </div>
              <div className="flex justify-between text-[#a0c4c0]">
                <span>Estimated Sales Tax:</span>
                <span className="font-mono font-semibold text-white">LKR 0.00</span>
              </div>

              <div className="pt-2 border-t border-[#164e48] flex justify-between text-base font-bold text-white">
                <span>Grand Total:</span>
                <span className="font-mono text-emerald-400">LKR {formatCurrency(grandTotal)}</span>
              </div>
            </div>

            {/* Advance Deposit Section */}
            <div className="pt-3 border-t border-[#164e48] space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">
                  Advance Deposit Paid (LKR)
                </label>
                <input
                  type="number"
                  min="0"
                  max={grandTotal}
                  step="0.01"
                  value={advancePaid}
                  onChange={(e) => setAdvancePaid(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />

                {/* Quick Advance Presets */}
                <div className="flex items-center gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setAdvancePaid(0)}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0]"
                  >
                    Zero (Full COD)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvancePaid(Math.round(grandTotal * 0.25))}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5]"
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvancePaid(Math.round(grandTotal * 0.5))}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5]"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvancePaid(grandTotal)}
                    className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-emerald-300"
                  >
                    100% (Fully Paid)
                  </button>
                </div>
              </div>

              {/* Advance Payment Method */}
              {advancePaid > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">
                    Advance Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                  >
                    <option value="cash">Cash Tender</option>
                    <option value="card">Credit / Debit Card</option>
                    <option value="bank_transfer">Direct Bank Transfer</option>
                    <option value="cheque">Cheque Deposit</option>
                  </select>
                </div>
              )}

              {/* Handover Balance Breakdown */}
              <div className="p-3 bg-[#0a2724] border border-[#164e48] rounded-xl text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-[#a0c4c0]">
                  <span>Advance Received:</span>
                  <span className="font-bold text-[#38d4c5]">LKR {formatCurrency(advancePaid)}</span>
                </div>
                <div className="flex justify-between text-white font-bold pt-1 border-t border-[#164e48]">
                  <span>Balance on Delivery:</span>
                  <span className="text-amber-400">LKR {formatCurrency(balanceAmount)}</span>
                </div>
              </div>

              {/* General Order Notes */}
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1">
                  Order Memo / Customer Instructions
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Call customer before dispatch. Fragile packing requested."
                  rows={2}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              {/* Submit Button */}
              <button
                type="button"
                onClick={handleSubmitOrder}
                disabled={createMutation.isPending || lines.length === 0 || !customerId}
                className="w-full py-3.5 bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] rounded-xl font-bold text-sm shadow-lg shadow-[#00b4d8]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-5 h-5" />
                {createMutation.isPending ? 'Confirming Order...' : 'Confirm Order & Reserve Stock'}
              </button>

              <div className="text-[11px] text-[#7aa5a0] text-center">
                Inventory stock is immediately allocated and reserved upon confirmation.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
export default NewCustomerOrderPage
