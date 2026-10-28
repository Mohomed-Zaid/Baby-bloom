import React from 'react'

export interface ThermalReceiptItem {
  name: string
  variant?: string
  qty: number
  price: number
  discount?: number
  total: number
}

export interface ThermalReceiptData {
  number: string
  date: string
  cashier?: string
  storeName?: string
  addressLine1?: string
  addressLine2?: string
  phoneLine?: string
  customerName: string
  customerPhone?: string
  items: ThermalReceiptItem[]
  subtotal: number
  discount?: number
  grandTotal: number
  itemsQty?: number
  paymentMethodName?: string
  paid?: number
  tendered?: number
  change?: number
  balance?: number
  previousDue?: number
  outstandingDue?: number
  footerNote?: string
  softwareAttribution?: string
}

export const formatReceiptCurrency = (val: number | string | undefined): string => {
  const num = typeof val === 'string' ? parseFloat(val) || 0 : Number(val || 0)
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const formatReceiptQty = (qty: number | string | undefined): string => {
  const num = typeof qty === 'string' ? parseFloat(qty) || 0 : Number(qty || 0)
  return num % 1 !== 0 ? num.toFixed(3) : num.toFixed(2)
}

export const formatReceiptDateTime = (dateVal?: string | Date): string => {
  if (!dateVal) {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
    return `${y}/${m}/${day}  ${h}:${min} ${ampm}`
  }
  const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal
  if (isNaN(d.getTime())) return String(dateVal)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
  return `${y}/${m}/${day}  ${h}:${min} ${ampm}`
}

export interface ThermalReceiptDocketProps {
  receipt: ThermalReceiptData
  className?: string
}

export const ThermalReceiptDocket: React.FC<ThermalReceiptDocketProps> = ({ receipt, className = '' }) => {
  const totalItemsCount = receipt.itemsQty !== undefined
    ? receipt.itemsQty
    : receipt.items.reduce((s, it) => s + (it.qty || 1), 0)

  // Payment method label
  const methodLabel = receipt.paymentMethodName
    ? receipt.paymentMethodName.toUpperCase()
    : receipt.balance && receipt.balance > 0 && (!receipt.paid || receipt.paid === 0)
      ? 'CREDIT'
      : 'CASH'

  // Payment amount
  const paidOrTotal = (receipt.balance && receipt.balance > 0 && (!receipt.paid || receipt.paid === 0))
    ? receipt.grandTotal
    : (receipt.paid ?? receipt.grandTotal)

  const outstanding = receipt.outstandingDue !== undefined
    ? receipt.outstandingDue
    : (receipt.previousDue || 0) + (receipt.balance || 0)

  return (
    <div
      className={`thermal-receipt-docket bg-white text-black leading-tight select-all ${className}`}
      style={{
        width: '74mm',
        maxWidth: '74mm',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: '11px',
        padding: '3mm 2mm',
        color: '#000',
        backgroundColor: '#fff',
      }}
    >
      {/* ── 1. STORE HEADER ─────────────────────────────────────────────────── */}
      <div className="text-center space-y-0.5 mb-2">
        <div className="text-[14px] font-bold tracking-wide uppercase">
          {receipt.storeName || 'CHICKEN KING'}
        </div>
        <div className="text-[11px] font-normal leading-tight">
          {receipt.addressLine1 || 'No: 15, Station Road,'}
        </div>
        <div className="text-[11px] font-normal leading-tight">
          {receipt.addressLine2 || 'Gelioya.'}
        </div>
        <div className="text-[11px] font-normal leading-tight">
          {receipt.phoneLine || '0775040808 | 0755552222'}
        </div>
      </div>

      {/* Dashed line */}
      <div className="border-b border-dashed border-black my-2" />

      {/* ── 2. BILL / TRANSACTION META ───────────────────────────────────────── */}
      <div className="text-[11px] space-y-0.5 font-normal">
        <div className="flex">
          <span className="font-bold w-24">BILL NO :</span>
          <span className="font-bold text-[12px]">{receipt.number}</span>
        </div>
        <div className="flex">
          <span className="w-24">DateTime :</span>
          <span className="tabular-nums">{formatReceiptDateTime(receipt.date)}</span>
        </div>
        <div className="flex">
          <span className="w-24">Cashier :</span>
          <span className="uppercase">{receipt.cashier || 'POS'}</span>
        </div>
      </div>

      {/* ── 3. CUSTOMER INFORMATION ─────────────────────────────────────────── */}
      <div className="mt-2.5 text-[11px] space-y-0.5">
        <div className="font-bold uppercase tracking-wider text-[11px]">CUSTOMER INFORMATION</div>
        <div className="flex">
          <span className="w-20">Name :</span>
          <span className="uppercase font-semibold">{receipt.customerName || 'CASH CUSTOMER'}</span>
        </div>
        <div className="flex">
          <span className="w-20">Phone :</span>
          <span className="tabular-nums">{receipt.customerPhone || 'N/A'}</span>
        </div>
      </div>

      {/* Dashed line */}
      <div className="border-b border-dashed border-black my-2" />

      {/* ── 4. ITEMS TABLE HEADER ───────────────────────────────────────────── */}
      <div className="flex justify-between font-bold text-[11px] uppercase tracking-wider py-0.5">
        <span>DESCRIPTION</span>
        <span>TOTAL</span>
      </div>

      {/* Dashed line */}
      <div className="border-b border-dashed border-black mb-2" />

      {/* ── 5. ITEMS ROWS ───────────────────────────────────────────────────── */}
      <div className="space-y-2 mb-2">
        {receipt.items.map((it, idx) => (
          <div key={idx} className="text-[11px] leading-tight">
            <div className="font-normal text-black break-words">
              {it.name}{it.variant ? ` (${it.variant})` : ''}
            </div>
            <div className="flex justify-between items-baseline mt-0.5">
              <span className="tabular-nums text-[10.5px]">
                {formatReceiptQty(it.qty)} x ({formatReceiptCurrency(it.price)})
              </span>
              <span className="font-semibold tabular-nums text-[11px]">
                {formatReceiptCurrency(it.total)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Dashed line */}
      <div className="border-b border-dashed border-black my-2" />

      {/* ── 6. TOTALS BREAKDOWN ─────────────────────────────────────────────── */}
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>SubTotal :</span>
          <span className="tabular-nums">{formatReceiptCurrency(receipt.subtotal)}</span>
        </div>

        {receipt.discount !== undefined && receipt.discount > 0 && (
          <div className="flex justify-between">
            <span>Discount :</span>
            <span className="tabular-nums">-{formatReceiptCurrency(receipt.discount)}</span>
          </div>
        )}

        <div className="flex justify-between font-bold text-[12.5px] py-0.5">
          <span>Grand Total :</span>
          <span className="tabular-nums">{formatReceiptCurrency(receipt.grandTotal)}</span>
        </div>

        <div className="flex justify-between">
          <span>Items Qty :</span>
          <span className="tabular-nums">{formatReceiptQty(totalItemsCount)}</span>
        </div>

        <div className="flex justify-between uppercase">
          <span>{methodLabel} :</span>
          <span className="tabular-nums">{formatReceiptCurrency(paidOrTotal)}</span>
        </div>

        {receipt.change !== undefined && receipt.change > 0 && (
          <div className="flex justify-between">
            <span>CHANGE :</span>
            <span className="tabular-nums">{formatReceiptCurrency(receipt.change)}</span>
          </div>
        )}
      </div>

      {/* Dashed line */}
      <div className="border-b border-dashed border-black my-2" />

      {/* ── 7. CUSTOMER CREDIT DETAILS ──────────────────────────────────────── */}
      <div className="space-y-1 text-[11px]">
        <div className="font-bold uppercase tracking-wider">CUSTOMER CREDIT DETAILS :</div>
        <div className="flex justify-between">
          <span>Outstanding Due :</span>
          <span className="tabular-nums">{formatReceiptCurrency(outstanding)}</span>
        </div>

        <div className="text-center pt-1.5">
          <div className="text-[11px]">Previous Due</div>
          <div className="tabular-nums font-semibold text-[11px]">
            {formatReceiptCurrency(receipt.previousDue || 0)}
          </div>
        </div>
      </div>

      {/* ── 8. FOOTER & POLICIES ────────────────────────────────────────────── */}
      <div className="text-center mt-3 pt-1 text-[11px]">
        <div>{receipt.footerNote || 'Thank you. Please Visit Again.'}</div>
        <div className="border-b border-dashed border-black my-2" />
        <div className="text-[10px] text-black/80 font-normal tracking-wide">
          {receipt.softwareAttribution || 'Software By  AJ POS'}
        </div>
      </div>
    </div>
  )
}
