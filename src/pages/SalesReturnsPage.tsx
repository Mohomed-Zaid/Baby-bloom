import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, Eye, Printer, RotateCcw, CheckCircle2,
  Calendar, FileText, X, ChevronLeft, ChevronRight
} from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { StatusBadge } from '../components/common/StatusBadge'
import { listSalesReturns, salesReturnAction, getSalesReturn } from '../services/sales'
import { listLookup } from '../services/masterData'
import { formatBusinessDate } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import type { SalesReturnRow, SalesReturnItemDetail, CustomerRefundRow } from '../types/sales'

const money = (n: number | null | undefined) =>
  `Rs. ${Number(n ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`

const settlementBadge = (type: string) => {
  switch (type) {
    case 'cash_refund':
      return <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(94,201,154,0.15)', color: '#5ec99a' }}>Cash Refund</span>
    case 'bank_refund':
      return <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(74,185,230,0.15)', color: '#5dade2' }}>Bank/Card Refund</span>
    case 'customer_credit':
    case 'reduce_receivable':
      return <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(235,160,60,0.15)', color: '#f5b041' }}>Credit Note</span>
    default:
      return <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(255,255,255,0.1)', color: '#cfded6' }}>{type}</span>
  }
}

export const SalesReturnsPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [settlementType, setSettlementType] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  // Modals & Notifications
  const [viewingReturnId, setViewingReturnId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Lookups
  const { data: branches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches', 'name'),
  })

  // Returns list
  const { data: returnsData, isLoading } = useQuery({
    queryKey: ['sales-returns', page, searchTerm, selectedBranch, settlementType, statusFilter, dateFrom, dateTo],
    queryFn: () => listSalesReturns({
      page,
      pageSize: 20,
      search: searchTerm || undefined,
      branchId: selectedBranch || undefined,
      settlementType: settlementType !== 'all' ? settlementType : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
  })

  // Detailed return query for modal
  const { data: returnDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['sales-return-detail', viewingReturnId],
    queryFn: () => getSalesReturn(viewingReturnId!),
    enabled: !!viewingReturnId,
  })

  // Post Return Mutation
  const postMutation = useMutation({
    mutationFn: (id: string) => salesReturnAction('post', id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sales-return-detail'] })
      setNotice(`Sales return ${res.document_number} successfully posted. Stock and accounts updated!`)
      setTimeout(() => setNotice(null), 4000)
    },
    onError: (err) => {
      setNotice(getErrorMessage(err))
    },
  })

  // Reverse Return Mutation
  const reverseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => salesReturnAction('reverse', id, reason),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sales-return-detail'] })
      setNotice(`Sales return ${res.document_number} reversed.`)
      setTimeout(() => setNotice(null), 4000)
    },
    onError: (err) => {
      setNotice(getErrorMessage(err))
    },
  })

  const handleReverse = (ret: SalesReturnRow) => {
    const reason = window.prompt(`Enter reason for reversing sales return ${ret.return_number}:`)
    if (!reason || !reason.trim()) return
    reverseMutation.mutate({ id: ret.id, reason: reason.trim() })
  }

  const printSlip = () => {
    window.print()
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Sales Returns"
        description="Return items with automatic stock restocking at historical cost, customer credit notes, and cash/card refund settlements."
        breadcrumbs={[{ label: 'Sales', path: '/sales/invoices' }, { label: 'Returns' }]}
        actions={
          <button className="button primary" onClick={() => navigate('/sales/new-return')}>
            <Plus size={16} /> New Return
          </button>
        }
      />

      {notice && <div className="inline-notice">{notice}</div>}

      {/* Filter Bar */}
      <div className="content-panel" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative', gridColumn: 'span 2' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#9abfad' }} />
            <input
              type="text"
              className="text-input"
              style={{ paddingLeft: '32px', height: '36px' }}
              placeholder="Search return #, customer, invoice #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="text-input"
            style={{ height: '36px' }}
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>

          <select
            className="text-input"
            style={{ height: '36px' }}
            value={settlementType}
            onChange={(e) => setSettlementType(e.target.value)}
          >
            <option value="all">All Settlement Types</option>
            <option value="cash_refund">Cash Refund</option>
            <option value="bank_refund">Bank/Card Refund</option>
            <option value="customer_credit">Credit Note</option>
          </select>

          <select
            className="text-input"
            style={{ height: '36px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="cancelled">Cancelled</option>
            <option value="reversed">Reversed</option>
          </select>

          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Calendar size={14} style={{ color: '#9abfad' }} />
            <input
              type="date"
              className="text-input"
              style={{ height: '36px', fontSize: '0.8rem' }}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From Date"
            />
            <span style={{ color: '#7a9f8d' }}>to</span>
            <input
              type="date"
              className="text-input"
              style={{ height: '36px', fontSize: '0.8rem' }}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="To Date"
            />
          </div>
        </div>
      </div>

      {/* Returns History Table */}
      <section className="content-panel">
        <div className="panel-heading" style={{ marginBottom: '12px' }}>
          <div>
            <span className="eyebrow">Transaction Records</span>
            <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} /> Sales Return History ({returnsData?.count ?? 0})
            </h2>
          </div>
        </div>

        {isLoading ? (
          <div className="panel-state">Loading sales returns...</div>
        ) : !returnsData?.rows.length ? (
          <div className="panel-state" style={{ padding: '36px 16px', textAlign: 'center' }}>
            <p style={{ color: '#9abfad', marginBottom: '12px' }}>No sales return records found.</p>
            <button className="button secondary" onClick={() => navigate('/sales/new-return')}>
              <Plus size={14} /> Process First Return
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Return No</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Date</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Original Invoice</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Customer</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Branch</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem', textAlign: 'right' }}>Grand Total</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Settlement</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {returnsData.rows.map((ret) => (
                  <tr key={ret.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#5ec99a' }}>
                      {ret.return_number}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cfded6' }}>
                      {formatBusinessDate(ret.return_date)}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#e8f0ec' }}>
                      {ret.invoice_number ? (
                        <span style={{ fontWeight: 500, color: '#5dade2' }}>{ret.invoice_number}</span>
                      ) : (
                        <span style={{ color: '#7a9f8d', fontSize: '0.8rem', fontStyle: 'italic' }}>Standalone Return</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#e8f0ec' }}>
                      <strong>{ret.customer_name}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#7a9f8d' }}>{ret.customer_code}</div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cfded6' }}>{ret.branch_name}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#5ec99a' }}>
                      {money(ret.grand_total)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {settlementBadge(ret.settlement_type)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <StatusBadge status={ret.status} />
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          className="table-action"
                          title="View Return Slip & Items"
                          onClick={() => setViewingReturnId(ret.id)}
                          style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Eye size={14} /> View
                        </button>

                        {ret.status === 'draft' && (
                          <button
                            className="table-action"
                            title="Post Return Atomically"
                            onClick={() => postMutation.mutate(ret.id)}
                            style={{
                              padding: '4px 8px',
                              background: 'rgba(94,201,154,0.15)',
                              color: '#5ec99a',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <CheckCircle2 size={14} /> Post
                          </button>
                        )}

                        {ret.status === 'posted' && (
                          <button
                            className="table-action"
                            title="Reverse Return"
                            onClick={() => handleReverse(ret)}
                            style={{ padding: '4px 8px', color: '#eb5757', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <RotateCcw size={14} /> Reverse
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {returnsData && returnsData.count > 20 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '0.8rem', color: '#9abfad' }}>
                  Showing {(page - 1) * 20 + 1} - {Math.min(page * 20, returnsData.count)} of {returnsData.count}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="button secondary"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    style={{ padding: '4px 8px', height: '28px' }}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    className="button secondary"
                    disabled={page * 20 >= returnsData.count}
                    onClick={() => setPage(page + 1)}
                    style={{ padding: '4px 8px', height: '28px' }}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Return Slip & Details Modal */}
      {viewingReturnId && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '680px' }}>
            <div className="modal-header">
              <h3>
                Sales Return Slip: {returnDetail?.header?.return_number || 'Loading...'}
              </h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button className="button secondary" onClick={printSlip} style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Printer size={14} /> Print Credit Note / Slip
                </button>
                <button className="modal-close" onClick={() => setViewingReturnId(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {loadingDetail || !returnDetail ? (
              <div className="panel-state">Loading return details...</div>
            ) : (
              <div className="slip-printable" style={{ color: '#e8f0ec' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#9abfad' }}>Customer Details</div>
                    <div style={{ fontWeight: 600, fontSize: '1rem', marginTop: '2px' }}>{returnDetail.header.customer_name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#7a9f8d' }}>Code: {returnDetail.header.customer_code}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: '#9abfad' }}>Return Date & Branch</div>
                    <div style={{ fontWeight: 600 }}>{formatBusinessDate(returnDetail.header.return_date)}</div>
                    <div style={{ fontSize: '0.8rem', color: '#7a9f8d' }}>{returnDetail.header.branch_name} ({returnDetail.header.location_name})</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: '#9abfad' }}>Original Sales Invoice</div>
                    <div style={{ fontWeight: 600, color: '#5dade2' }}>
                      {returnDetail.header.invoice_number || 'Standalone Return (No invoice link)'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: '#9abfad' }}>Settlement Payout / Credit</div>
                    <div>{settlementBadge(returnDetail.header.settlement_type)}</div>
                  </div>
                </div>

                {/* Return Items List */}
                <h4 style={{ fontSize: '0.9rem', color: '#9abfad', marginBottom: '8px' }}>Returned Line Items</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '16px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#9abfad' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center' }}>Condition</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Return Qty</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Unit Price</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right' }}>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnDetail.items.map((it: SalesReturnItemDetail) => (
                      <tr key={it.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '8px' }}>
                          <strong>{it.product_name}</strong>
                          {it.variant_name && <span style={{ color: '#9abfad', marginLeft: '4px' }}>({it.variant_name})</span>}
                          <div style={{ fontSize: '0.75rem', color: '#7a9f8d' }}>{it.sku || it.product_code}</div>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            background: it.restock_condition === 'good' ? 'rgba(94,201,154,0.2)' : 'rgba(235,87,87,0.2)',
                            color: it.restock_condition === 'good' ? '#5ec99a' : '#eb5757',
                          }}>
                            {it.restock_condition === 'good' ? 'Good (Restocked)' : it.restock_condition === 'damaged' ? 'Damaged Stock' : 'Write-Off'}
                          </span>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{it.quantity}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>{money(it.unit_price)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600, color: '#5ec99a' }}>
                          {money(it.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Subledger Refund Record if any */}
                {returnDetail.refunds && returnDetail.refunds.length > 0 && (
                  <div style={{ padding: '10px 14px', background: 'rgba(74, 185, 230, 0.08)', borderRadius: '6px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#5dade2', marginBottom: '4px' }}>
                      Customer Refund Disbursement Record
                    </div>
                    {returnDetail.refunds.map((rf: CustomerRefundRow) => (
                      <div key={rf.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <span>Paid via {rf.payment_method.toUpperCase()} {rf.bank_account_name ? `(${rf.bank_account_name})` : ''} on {formatBusinessDate(rf.refund_date)}</span>
                        <strong>{money(rf.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary panel */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '12px' }}>
                  <div style={{ maxWidth: '300px' }}>
                    <div style={{ fontSize: '0.8rem', color: '#9abfad' }}>Reason:</div>
                    <div style={{ fontSize: '0.85rem' }}>{returnDetail.header.reason}</div>
                    {returnDetail.header.notes && (
                      <div style={{ fontSize: '0.8rem', color: '#7a9f8d', marginTop: '4px' }}>Note: {returnDetail.header.notes}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', color: '#9abfad' }}>Return Subtotal: {money(returnDetail.header.subtotal)}</div>
                    {Number(returnDetail.header.tax_total) > 0 && (
                      <div style={{ fontSize: '0.85rem', color: '#9abfad' }}>Tax Total: {money(returnDetail.header.tax_total)}</div>
                    )}
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#5ec99a', marginTop: '4px' }}>
                      Total Refund / Credit: {money(returnDetail.header.grand_total)}
                    </div>
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
                  {returnDetail.header.status === 'draft' && (
                    <button
                      className="button primary"
                      disabled={postMutation.isPending}
                      onClick={() => postMutation.mutate(returnDetail.header.id)}
                    >
                      <CheckCircle2 size={15} /> {postMutation.isPending ? 'Posting...' : 'Post Return Now'}
                    </button>
                  )}
                  <button className="button secondary" onClick={() => setViewingReturnId(null)}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
