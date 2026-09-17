import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Printer, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/common/DataTable'
import { PageHeader } from '../components/common/PageHeader'
import { StatusBadge } from '../components/common/StatusBadge'
import { permissions } from '../config/permissions'
import { formatBusinessDate } from '../lib/dates'
import { getErrorMessage } from '../lib/errors'
import { getInvoice, invoiceAction, listInvoices } from '../services/sales'
import { listLookup } from '../services/masterData'
import { useAuthStore } from '../stores/authStore'
import type { SalesInvoiceRow } from '../types/sales'

const cash = (n: number | null) => n === null ? 'Restricted' : `Rs. ${Number(n).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`

export function SalesInvoicesPage() {
  const { id } = useParams(), qc = useQueryClient(), allowed = useAuthStore(s => s.user?.permissions) ?? []
  const [page, setPage] = useState(1), [search, setSearch] = useState(''), [status, setStatus] = useState(''), [payStatus, setPayStatus] = useState('')
  const [customer, setCustomer] = useState(''), [branch, setBranch] = useState(''), [kind, setKind] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [notice, setNotice] = useState('')
  const can = (k: string) => allowed.includes(k)
  const hasView = can(permissions.salesView)

  const customers = useQuery({ queryKey: ['lookup','customers'], queryFn: () => listLookup('customers','name'), enabled: hasView })
  const branches = useQuery({ queryKey: ['lookup','branches'], queryFn: () => listLookup('branches'), enabled: hasView })

  const list = useQuery({
    queryKey: ['sales','list',page,search,status,payStatus,customer,branch,kind,from,to],
    queryFn: () => listInvoices({ page, search, status, paymentStatus: payStatus, customerId: customer, branchId: branch, invoiceType: kind, dateFrom: from, dateTo: to }),
    enabled: hasView,
  })
  const detail = useQuery({ queryKey: ['sales','detail',id], queryFn: () => getInvoice(id!), enabled: !!id && hasView })

  const action = useMutation({
    mutationFn: ({ name, row }: { name: 'cancel' | 'reverse'; row: SalesInvoiceRow }) => {
      const reason = window.prompt(`${name} reason`) ?? ''
      if (!reason) throw new Error('A reason is required.')
      return invoiceAction(name, row.id, reason)
    },
    onSuccess: async r => {
      setNotice(`${r.document_number}: ${r.status}`)
      await qc.invalidateQueries({ queryKey: ['sales'] })
      await qc.invalidateQueries({ queryKey: ['current-stock'] })
    },
    onError: e => setNotice(getErrorMessage(e)),
  })

  const controls = (r: SalesInvoiceRow) => (
    <div className='row-actions'>
      {r.status === 'draft' && can(permissions.salesCancel) && <button className='table-action' title='Cancel' onClick={() => action.mutate({ name: 'cancel', row: r })}>X</button>}
      {r.status === 'posted' && can(permissions.salesReverse) && <button className='table-action' title='Reverse' onClick={() => action.mutate({ name: 'reverse', row: r })}><RotateCcw size={14} /></button>}
    </div>
  )

  const columns: DataTableColumn<SalesInvoiceRow>[] = [
    { key: 'no', header: 'Invoice', render: r => <Link className='link-button' to={`/sales/invoices/${r.id}`}>{r.invoice_number}<small className='table-subline'>{r.customer_name}</small></Link> },
    { key: 'date', header: 'Date', render: r => formatBusinessDate(r.invoice_date) },
    { key: 'customer', header: 'Customer', render: r => r.customer_name },
    { key: 'branch', header: 'Branch / Type', render: r => <span>{r.branch_name}<small className='table-subline'>{r.invoice_type}</small></span> },
    { key: 'total', header: 'Total', align: 'right', render: r => cash(r.grand_total) },
    { key: 'paid', header: 'Paid', align: 'right', render: r => cash(r.paid_amount) },
    { key: 'balance', header: 'Balance', align: 'right', render: r => cash(r.balance_amount) },
    { key: 'payment', header: 'Payment', render: r => <StatusBadge status={r.payment_status} /> },
    { key: 'status', header: 'Document', render: r => <StatusBadge status={r.status} /> },
    { key: 'user', header: 'Cashier', render: r => r.created_user || '-' },
    { key: 'actions', header: 'Actions', align: 'right', render: controls },
  ]

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────
  if (id) {
    const data = detail.data
    if (detail.isLoading) return <div className='panel-state'>Loading invoice…</div>
    if (!data) return <div className='inline-error'>{getErrorMessage(detail.error)}</div>
    const r = data.header
    return (
      <div className='page-stack print-document'>
        <PageHeader
          title={r.invoice_number}
          description={`${r.customer_name} — ${formatBusinessDate(r.invoice_date)}`}
          breadcrumbs={[{ label: 'Sales Invoices', path: '/sales/invoices' }, { label: r.invoice_number }]}
          actions={<>
            <Link className='button secondary no-print' to='/sales/invoices'><ArrowLeft size={15} />Back</Link>
            {can(permissions.salesPrint) && <button className='button secondary no-print' onClick={() => window.print()}><Printer size={15} />Print</button>}
          </>}
        />
        {notice && <div className='inline-notice'>{notice}</div>}
        <section className='content-panel document-sheet'>
          <div className='document-summary'>
            <div><small>Customer</small><strong>{r.customer_name}</strong></div>
            <div><small>Status</small><StatusBadge status={r.status} /></div>
            <div><small>Payment</small><StatusBadge status={r.payment_status} /></div>
            <div><small>Due date</small><strong>{formatBusinessDate(r.due_date)}</strong></div>
            <div><small>Type</small><strong>{r.invoice_type}</strong></div>
            <div><small>Location</small><strong>{r.warehouse_name} / {r.location_name}</strong></div>
            <div><small>Cashier</small><strong>{r.created_user || '-'}</strong></div>
            {r.posted_at && <div><small>Posted at</small><strong>{new Date(r.posted_at).toLocaleString('en-LK')}</strong></div>}
          </div>
          <DataTable rows={data.items} rowKey={x => x.id} columns={[
            { key: 'item', header: 'Item', render: x => <span>{x.product_code} — {x.product_name}<small className='table-subline'>{x.variant_name} / {x.sku}</small></span> },
            { key: 'qty', header: 'Qty', align: 'right', render: x => `${x.quantity}` },
            { key: 'price', header: 'Unit Price', align: 'right', render: x => cash(x.unit_price) },
            { key: 'disc', header: 'Discount', align: 'right', render: x => cash(x.discount_amount) },
            { key: 'tax', header: 'Tax', align: 'right', render: x => cash(x.tax_amount) },
            { key: 'total', header: 'Line Total', align: 'right', render: x => cash(x.line_total) },
          ]} />
          <div className='document-bottom'>
            <div>
              <h3>Payments</h3>
              {data.payments.length
                ? data.payments.map(x => <p key={x.id}>{x.payment_method} — {cash(x.amount)} — {x.status}</p>)
                : <p>No payments recorded.</p>}
            </div>
            <div className='document-money'>
              <span>Subtotal <b>{cash(r.subtotal)}</b></span>
              <span>Discount <b>{cash((r.item_discount_total ?? 0) + (r.bill_discount_amount ?? 0))}</b></span>
              <span>Tax <b>{cash(r.tax_total)}</b></span>
              <span className='grand'>Grand Total <b>{cash(r.grand_total)}</b></span>
              <span>Paid <b>{cash(r.paid_amount)}</b></span>
              {r.change_amount > 0 && <span>Change <b>{cash(r.change_amount)}</b></span>}
              <span>Balance <b>{cash(r.balance_amount)}</b></span>
              {r.returned_amount > 0 && <span>Returned <b>{cash(r.returned_amount)}</b></span>}
            </div>
          </div>
          <footer className='purchase-footer no-print'>
            <span>{r.notes || 'No notes'}</span>
            {controls(r)}
          </footer>
        </section>
      </div>
    )
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  return (
    <div className='page-stack'>
      <PageHeader
        title='Sales Invoices'
        description='View and manage posted customer invoices.'
        breadcrumbs={[{ label: 'Sales Invoices' }]}
        actions={<Link className='button primary' to='/sales/pos'>New Invoice</Link>}
      />
      {notice && <div className='inline-notice'>{notice}</div>}
      <section className='content-panel'>
        <div className='master-toolbar inventory-filters'>
          <input className='text-input purchase-search' placeholder='Invoice no. or customer…' value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          <select className='compact-select' value={status} onChange={e => setStatus(e.target.value)}>
            <option value=''>Document status</option>
            {['draft','held','posted','cancelled','reversed'].map(x => <option key={x}>{x}</option>)}
          </select>
          <select className='compact-select' value={payStatus} onChange={e => setPayStatus(e.target.value)}>
            <option value=''>Payment status</option>
            <option value='unpaid'>Unpaid</option>
            <option value='partial'>Partial</option>
            <option value='paid'>Paid</option>
          </select>
          <select className='compact-select' value={customer} onChange={e => setCustomer(e.target.value)}>
            <option value=''>All customers</option>
            {customers.data?.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
          <select className='compact-select' value={branch} onChange={e => setBranch(e.target.value)}>
            <option value=''>All branches</option>
            {branches.data?.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
          <select className='compact-select' value={kind} onChange={e => setKind(e.target.value)}>
            <option value=''>All types</option>
            <option value='cash'>Cash</option>
            <option value='credit'>Credit</option>
            <option value='mixed'>Mixed</option>
          </select>
          <input className='text-input date-filter' type='date' value={from} onChange={e => setFrom(e.target.value)} />
          <input className='text-input date-filter' type='date' value={to} onChange={e => setTo(e.target.value)} />
          <span className='record-count'>{list.data?.count ?? 0} records</span>
        </div>
        {list.isLoading
          ? <div className='panel-state'>Loading invoices…</div>
          : list.error
          ? <div className='inline-error'>{getErrorMessage(list.error)}</div>
          : <DataTable rows={list.data?.rows ?? []} columns={columns} rowKey={r => r.id} emptyTitle='No invoices found' emptyDescription='Post a sale from the POS terminal or change your filters.' />}
        <div className='pagination'>
          <button className='button secondary' disabled={page === 1} onClick={() => setPage(x => x - 1)}>Previous</button>
          <span>Page {page}</span>
          <button className='button secondary' disabled={(list.data?.rows.length ?? 0) < 20} onClick={() => setPage(x => x + 1)}>Next</button>
        </div>
      </section>
    </div>
  )
}
