import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  Plus,
  Search,
  RefreshCw,
  Printer,
  CheckCircle2,
  FileSpreadsheet,
  AlertTriangle,
  User,
  Truck,
  X,
  Send,
  Ban,
  DollarSign,
} from 'lucide-react'
import { listLookup } from '../services/masterData'
import {
  fetchAdjustmentNotes,
  createAdjustmentNote,
  postAdjustmentNote,
  cancelAdjustmentNote,
  fetchPartyOutstandingBalance,
  type AdjustmentNote,
  type NoteType,
  type EntityType,
} from '../services/adjustmentNotes'

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0)
}

const QUICK_REASONS = [
  'Price Discrepancy / Overcharge',
  'Damaged / Defective Goods Allowance',
  'Trade Rebate / Settlement Discount',
  'Short Delivery / Missing Items',
  'Tax / VAT Calculation Correction',
  'Freight & Handling Adjustment',
]

export const AdjustmentNotesPage: React.FC = () => {
  const queryClient = useQueryClient()

  // ── Global Toast ──────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Navigation & Tabs ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'registry' | 'create'>('registry')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'posted' | 'cancelled'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'credit_note' | 'debit_note'>('all')
  const [entityFilter, setEntityFilter] = useState<'all' | 'customer' | 'vendor'>('all')
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  // ── Modals State ──────────────────────────────────────────────────────────
  const [voucherModalNote, setVoucherModalNote] = useState<AdjustmentNote | null>(null)
  const [cancelModalNote, setCancelModalNote] = useState<AdjustmentNote | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')

  // ── Create Form State ─────────────────────────────────────────────────────
  const [formBranchId, setFormBranchId] = useState('')
  const [formNoteType, setFormNoteType] = useState<NoteType>('credit_note')
  const [formEntityType, setFormEntityType] = useState<EntityType>('customer')
  const [formEntityId, setFormEntityId] = useState('')
  const [formDate, setFormDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [formAmount, setFormAmount] = useState<string>('')
  const [formReason, setFormReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // ── Lookups ───────────────────────────────────────────────────────────────
  const { data: branches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: async () => (await listLookup('branches', 'name')) || [],
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['lookup', 'customers'],
    queryFn: async () => (await listLookup('customers', 'name')) || [],
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['lookup', 'vendors'],
    queryFn: async () => (await listLookup('vendors', 'name')) || [],
  })

  // Auto-select first branch
  React.useEffect(() => {
    if (!formBranchId && branches.length > 0) {
      const first = branches[0] as any
      setFormBranchId(first.value || first.id || '')
    }
  }, [branches, formBranchId])

  // Live entity balance query
  const { data: partyBalance = 0 } = useQuery({
    queryKey: ['party-balance', formEntityType, formEntityId],
    queryFn: () => fetchPartyOutstandingBalance(formEntityType, formEntityId),
    enabled: !!formEntityId,
  })

  // ── Notes List Query ──────────────────────────────────────────────────────
  const {
    data: notes = [],
    isLoading: loadingNotes,
    refetch: refetchNotes,
    isFetching: fetchingNotes,
  } = useQuery({
    queryKey: ['adjustment-notes-list', typeFilter, entityFilter, statusFilter, branchFilter, search],
    queryFn: () =>
      fetchAdjustmentNotes({
        noteType: typeFilter,
        entityType: entityFilter,
        status: statusFilter,
        branchId: branchFilter,
        search,
      }),
  })

  // ── KPI Calculations ──────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalCount = notes.length
    const creditNotesTotal = notes
      .filter((n) => n.note_type === 'credit_note' && n.status === 'posted')
      .reduce((sum, n) => sum + n.amount, 0)
    const debitNotesTotal = notes
      .filter((n) => n.note_type === 'debit_note' && n.status === 'posted')
      .reduce((sum, n) => sum + n.amount, 0)
    const pendingDrafts = notes.filter((n) => n.status === 'draft').length

    return {
      totalCount,
      creditNotesTotal,
      debitNotesTotal,
      pendingDrafts,
    }
  }, [notes])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: createAdjustmentNote,
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ['adjustment-notes-list'] })
      queryClient.invalidateQueries({ queryKey: ['general-ledger-report'] })
      notify(`Adjustment Note ${newNote.note_number} generated successfully!`)
      setActiveTab('registry')
      resetForm()
    },
    onError: (err: Error) => {
      setFormError(err.message || 'Failed to issue adjustment note')
    },
  })

  const postMutation = useMutation({
    mutationFn: postAdjustmentNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustment-notes-list'] })
      queryClient.invalidateQueries({ queryKey: ['general-ledger-report'] })
      notify('Adjustment Note successfully posted and committed to general ledger!')
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to post adjustment note', true)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: ({ noteId, reason }: { noteId: string; reason: string }) =>
      cancelAdjustmentNote(noteId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjustment-notes-list'] })
      setCancelModalNote(null)
      setCancellationReason('')
      notify('Adjustment Note has been marked cancelled.')
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to cancel note', true)
    },
  })

  // ── Form Handlers ─────────────────────────────────────────────────────────
  const resetForm = () => {
    setFormAmount('')
    setFormReason('')
    setFormEntityId('')
    setFormError(null)
  }

  const handleSave = (autoPost = false) => {
    setFormError(null)
    const numAmount = parseFloat(formAmount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid positive adjustment amount.')
      return
    }
    if (!formBranchId) {
      setFormError('Please select a branch.')
      return
    }
    if (!formEntityId) {
      setFormError(`Please select a ${formEntityType === 'customer' ? 'customer' : 'supplier'}.`)
      return
    }
    if (!formReason.trim()) {
      setFormError('Please provide a reason or select a quick reason chip.')
      return
    }

    createMutation.mutate({
      branch_id: formBranchId,
      note_type: formNoteType,
      entity_type: formEntityType,
      entity_id: formEntityId,
      note_date: formDate,
      amount: numAmount,
      reason: formReason.trim(),
      auto_post: autoPost,
    })
  }

  // ── Render Status Badges ──────────────────────────────────────────────────
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'posted':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/60 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Posted
          </span>
        )
      case 'draft':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950 text-amber-300 border border-amber-800/60">
            Draft
          </span>
        )
      case 'cancelled':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-300 border border-rose-800/60">
            Cancelled
          </span>
        )
      default:
        return <span className="px-2 py-0.5 rounded text-xs text-gray-400">{status}</span>
    }
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
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-xl border text-sm flex items-center gap-2 ${
            toast.isError
              ? 'bg-rose-950 text-rose-200 border-rose-800'
              : 'bg-emerald-950 text-emerald-200 border-emerald-800'
          }`}
        >
          {toast.isError ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ── TOP HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#164e48] pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <ArrowRightLeft className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">Adjustment Notes</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Debit & Credit Notes
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Issue and audit trade credit notes (CN) and debit notes (DN) for customer receivables & supplier payables
            </p>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => refetchNotes()}
            disabled={fetchingNotes}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${fetchingNotes ? 'animate-spin text-[#38d4c5]' : ''}`} />
            Refresh
          </button>

          {activeTab === 'registry' ? (
            <button
              onClick={() => setActiveTab('create')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] transition-all shadow-md shadow-[#00b4d8]/20"
            >
              <Plus className="w-4 h-4" />
              Issue Adjustment Note
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('registry')}
              className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-white transition-colors"
            >
              View Notes Registry
            </button>
          )}
        </div>
      </div>

      {/* ── KPI METRICS ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Notes Generated */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Total Adjustment Notes</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5]">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              {kpis.totalCount}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1">
            Total records in database
          </div>
        </div>

        {/* 2. Customer Credit Notes Total */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Customer Credit Notes (CN)</span>
            <div className="p-2 rounded-lg bg-rose-950/80 text-rose-400 border border-rose-800/40">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-rose-400 tracking-tight">
              LKR {formatCurrency(kpis.creditNotesTotal)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1">
            Receivable balances reduced
          </div>
        </div>

        {/* 3. Vendor Debit Notes Total */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Supplier Debit Notes (DN)</span>
            <div className="p-2 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-emerald-400 tracking-tight">
              LKR {formatCurrency(kpis.debitNotesTotal)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1">
            Trade payables reduced
          </div>
        </div>

        {/* 4. Pending Drafts */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Draft Notes</span>
            <div className="p-2 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-800/40">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-amber-400 tracking-tight">
              {kpis.pendingDrafts}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1">
            Awaiting supervisor review & posting
          </div>
        </div>
      </div>

      {/* ── TAB 1: REGISTRY & AUDIT LIST ─────────────────────────────────────── */}
      {activeTab === 'registry' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-[#061e1c]/90 border border-[#164e48] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Type Filter */}
              <div className="flex items-center bg-[#0c2e2a] border border-[#164e48] rounded-lg p-0.5">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    typeFilter === 'all' ? 'bg-[#38d4c5] text-[#031413]' : 'text-[#a0c4c0] hover:text-white'
                  }`}
                >
                  All Types
                </button>
                <button
                  onClick={() => setTypeFilter('credit_note')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    typeFilter === 'credit_note' ? 'bg-[#38d4c5] text-[#031413]' : 'text-[#a0c4c0] hover:text-white'
                  }`}
                >
                  Credit Notes (CN)
                </button>
                <button
                  onClick={() => setTypeFilter('debit_note')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    typeFilter === 'debit_note' ? 'bg-[#38d4c5] text-[#031413]' : 'text-[#a0c4c0] hover:text-white'
                  }`}
                >
                  Debit Notes (DN)
                </button>
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[#0c2e2a] border border-[#164e48] text-white text-xs rounded-lg px-3 py-2 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="posted">Posted Only</option>
                <option value="draft">Draft Only</option>
                <option value="cancelled">Cancelled Only</option>
              </select>

              {/* Entity Filter */}
              <select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value as any)}
                className="bg-[#0c2e2a] border border-[#164e48] text-white text-xs rounded-lg px-3 py-2 focus:outline-none"
              >
                <option value="all">All Parties</option>
                <option value="customer">Customers</option>
                <option value="vendor">Suppliers / Vendors</option>
              </select>

              {/* Branch Filter */}
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="bg-[#0c2e2a] border border-[#164e48] text-white text-xs rounded-lg px-3 py-2 focus:outline-none"
              >
                <option value="all">All Branches</option>
                {branches.map((b: any) => (
                  <option key={b.value || b.id} value={b.value || b.id}>
                    {b.label || b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#7aa5a0]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Note #, Party, Reason..."
                className="w-full bg-[#0c2e2a] border border-[#164e48] text-white text-xs rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-[#061e1c]/90 border border-[#164e48] rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#0a2f2b] text-[#7aa5a0] text-xs uppercase tracking-wider border-b border-[#164e48]">
                  <tr>
                    <th className="py-3 px-4">Note Number</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Party / Entity</th>
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4">Reason</th>
                    <th className="py-3 px-4 text-right">Amount (LKR)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#164e48]/50">
                  {loadingNotes ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[#7aa5a0]">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#38d4c5] mb-2" />
                        Loading adjustment notes...
                      </td>
                    </tr>
                  ) : notes.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[#7aa5a0]">
                        No adjustment notes found matching the filters.
                      </td>
                    </tr>
                  ) : (
                    notes.map((note) => (
                      <tr key={note.id} className="hover:bg-[#0c2e2a]/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-[#00b4d8] whitespace-nowrap">
                          {note.note_number}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-[#a0c4c0] whitespace-nowrap">
                          {note.note_date}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {note.note_type === 'credit_note' ? (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-950/80 text-rose-300 border border-rose-800/60">
                              Credit Note
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                              Debit Note
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {note.entity_type === 'customer' ? (
                              <User className="w-3.5 h-3.5 text-amber-400" />
                            ) : (
                              <Truck className="w-3.5 h-3.5 text-blue-400" />
                            )}
                            <span className="font-medium text-white">{note.entity_name}</span>
                          </div>
                          {note.entity_code && (
                            <span className="text-[10px] text-[#7aa5a0] font-mono">
                              Code: {note.entity_code}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#7aa5a0] whitespace-nowrap">
                          {note.branch_name}
                        </td>
                        <td className="py-3 px-4 text-xs text-white max-w-xs truncate" title={note.reason}>
                          {note.reason}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white whitespace-nowrap">
                          LKR {formatCurrency(note.amount)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {renderStatusBadge(note.status)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* View / Print Voucher */}
                            <button
                              onClick={() => setVoucherModalNote(note)}
                              className="p-1.5 hover:bg-[#12423c] rounded text-[#7aa5a0] hover:text-[#38d4c5] transition-colors"
                              title="Print / View Note Voucher"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            {/* Post Note (for drafts) */}
                            {note.status === 'draft' && (
                              <button
                                onClick={() => postMutation.mutate(note.id)}
                                disabled={postMutation.isPending}
                                className="p-1.5 hover:bg-emerald-950 rounded text-emerald-400 hover:text-emerald-300 transition-colors"
                                title="Approve & Post to Ledger"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}

                            {/* Cancel Note */}
                            {note.status !== 'cancelled' && (
                              <button
                                onClick={() => setCancelModalNote(note)}
                                className="p-1.5 hover:bg-rose-950 rounded text-rose-400 hover:text-rose-300 transition-colors"
                                title="Cancel Note"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: NEW ADJUSTMENT NOTE CREATOR ───────────────────────────────── */}
      {activeTab === 'create' && (
        <div className="bg-[#061e1c]/90 border border-[#164e48] rounded-xl p-6 max-w-3xl mx-auto space-y-6 shadow-xl text-left">
          <div className="flex items-center justify-between border-b border-[#164e48] pb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Create New Adjustment Note</h2>
              <p className="text-xs text-[#7aa5a0] mt-0.5">
                Issue a Credit Note or Debit Note to adjust receivables or payables with full GL auditing
              </p>
            </div>
            <button
              onClick={() => setActiveTab('registry')}
              className="text-[#7aa5a0] hover:text-white p-1 rounded-lg hover:bg-[#113e3a]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {formError && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-200 text-xs rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* 1. Note Type Selector */}
            <div>
              <label className="block text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider mb-2">
                1. Select Note Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormNoteType('credit_note')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    formNoteType === 'credit_note'
                      ? 'bg-rose-950/40 border-rose-600 ring-1 ring-rose-500 shadow-md'
                      : 'bg-[#0c2e2a] border-[#164e48] hover:border-[#1a5b54]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">Credit Note (CN)</span>
                    <span className="text-xs px-2 py-0.5 rounded font-mono bg-rose-950 text-rose-300 border border-rose-800">
                      Credit
                    </span>
                  </div>
                  <p className="text-xs text-[#7aa5a0] mt-1.5">
                    {formEntityType === 'customer'
                      ? 'Reduces customer balance (Customer returns, allowances, discounts)'
                      : 'Records vendor allowance or rebate credit note'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormNoteType('debit_note')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    formNoteType === 'debit_note'
                      ? 'bg-cyan-950/40 border-cyan-600 ring-1 ring-cyan-500 shadow-md'
                      : 'bg-[#0c2e2a] border-[#164e48] hover:border-[#1a5b54]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">Debit Note (DN)</span>
                    <span className="text-xs px-2 py-0.5 rounded font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                      Debit
                    </span>
                  </div>
                  <p className="text-xs text-[#7aa5a0] mt-1.5">
                    {formEntityType === 'vendor'
                      ? 'Reduces vendor payable (Purchase returns, price adjustments)'
                      : 'Charges customer additional fee or corrected underbilling'}
                  </p>
                </button>
              </div>
            </div>

            {/* 2. Entity Party Selector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider mb-2">
                  2. Party Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormEntityType('customer')
                      setFormEntityId('')
                    }}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                      formEntityType === 'customer'
                        ? 'bg-[#38d4c5] text-[#031413] border-[#38d4c5]'
                        : 'bg-[#0c2e2a] text-[#a0c4c0] border-[#164e48] hover:bg-[#12423c]'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" /> Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormEntityType('vendor')
                      setFormEntityId('')
                    }}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                      formEntityType === 'vendor'
                        ? 'bg-[#38d4c5] text-[#031413] border-[#38d4c5]'
                        : 'bg-[#0c2e2a] text-[#a0c4c0] border-[#164e48] hover:bg-[#12423c]'
                    }`}
                  >
                    <Truck className="w-3.5 h-3.5" /> Supplier / Vendor
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider mb-2">
                  Operating Branch
                </label>
                <select
                  value={formBranchId}
                  onChange={(e) => setFormBranchId(e.target.value)}
                  className="w-full bg-[#0c2e2a] border border-[#164e48] text-white text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  {branches.map((b: any) => (
                    <option key={b.value || b.id} value={b.value || b.id}>
                      {b.label || b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3. Specific Entity Select & Live Balance */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider">
                  Select {formEntityType === 'customer' ? 'Customer' : 'Supplier'}
                </label>
                {formEntityId && (
                  <span className="text-xs text-[#7aa5a0] flex items-center gap-1">
                    Current Outstanding:{' '}
                    <span className="font-mono font-bold text-[#38d4c5]">
                      LKR {formatCurrency(partyBalance)}
                    </span>
                  </span>
                )}
              </div>
              <select
                value={formEntityId}
                onChange={(e) => setFormEntityId(e.target.value)}
                className="w-full bg-[#0c2e2a] border border-[#164e48] text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
              >
                <option value="">-- Choose {formEntityType === 'customer' ? 'Customer' : 'Supplier'} --</option>
                {formEntityType === 'customer'
                  ? customers.map((c: any) => (
                      <option key={c.value || c.id} value={c.value || c.id}>
                        {c.label || c.name} {c.code ? `(${c.code})` : ''}
                      </option>
                    ))
                  : vendors.map((v: any) => (
                      <option key={v.value || v.id} value={v.value || v.id}>
                        {v.label || v.name} {v.code ? `(${v.code})` : ''}
                      </option>
                    ))}
              </select>
            </div>

            {/* 4. Date & Amount */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider mb-2">
                  Note Date
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-[#0c2e2a] border border-[#164e48] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider mb-2">
                  Adjustment Amount (LKR)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-mono text-[#7aa5a0]">LKR</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#0c2e2a] border border-[#164e48] text-white font-mono text-base font-semibold rounded-lg pl-12 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                  />
                </div>
              </div>
            </div>

            {/* 5. Quick Reason Chips */}
            <div>
              <label className="block text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider mb-2">
                Quick Reason Templates
              </label>
              <div className="flex flex-wrap gap-2">
                {QUICK_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setFormReason(reason)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      formReason === reason
                        ? 'bg-[#38d4c5] text-[#031413] font-semibold border-[#38d4c5]'
                        : 'bg-[#0c2e2a] text-[#a0c4c0] border-[#164e48] hover:bg-[#12423c]'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            {/* 6. Reason Description */}
            <div>
              <label className="block text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider mb-1.5">
                Adjustment Reason & Internal Notes
              </label>
              <textarea
                rows={3}
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Provide detailed explanation, referenced invoice number, or justification..."
                className="w-full bg-[#0c2e2a] border border-[#164e48] text-white text-xs rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#164e48]">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-xs font-medium text-[#7aa5a0] hover:text-white"
            >
              Reset Form
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={createMutation.isPending}
                className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-white transition-colors"
              >
                Save as Draft
              </button>

              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={createMutation.isPending}
                className="px-5 py-2.5 text-xs font-bold rounded-lg bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] transition-all shadow-md shadow-[#00b4d8]/20 flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Approve & Post to Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRINTABLE VOUCHER MODAL ─────────────────────────────────────────── */}
      {voucherModalNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white text-gray-900 rounded-xl max-w-2xl w-full p-8 space-y-6 shadow-2xl relative text-left print:p-0 print:shadow-none">
            {/* Close button (hidden on print) */}
            <button
              onClick={() => setVoucherModalNote(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-900 p-1.5 rounded-lg hover:bg-gray-100 no-print"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Voucher Header */}
            <div className="border-b-2 border-gray-900 pb-4 flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-black tracking-wider text-gray-900">BABY BLOOM</h1>
                <p className="text-xs text-gray-600 mt-0.5">Premier Baby Products & Retail Management</p>
                <p className="text-xs text-gray-500">Branch: {voucherModalNote.branch_name}</p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-block px-3 py-1 text-sm font-extrabold rounded uppercase tracking-wider ${
                    voucherModalNote.note_type === 'credit_note'
                      ? 'bg-red-100 text-red-800 border border-red-300'
                      : 'bg-blue-100 text-blue-800 border border-blue-300'
                  }`}
                >
                  {voucherModalNote.note_type === 'credit_note' ? 'CREDIT NOTE' : 'DEBIT NOTE'}
                </span>
                <p className="font-mono text-base font-bold text-gray-900 mt-1">
                  {voucherModalNote.note_number}
                </p>
                <p className="text-xs text-gray-500">Date: {voucherModalNote.note_date}</p>
              </div>
            </div>

            {/* Party Details */}
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200 text-xs">
              <div>
                <span className="text-gray-500 font-semibold uppercase">Party Details:</span>
                <p className="font-bold text-gray-900 text-sm mt-0.5">{voucherModalNote.entity_name}</p>
                {voucherModalNote.entity_code && (
                  <p className="text-gray-600 font-mono">Code: {voucherModalNote.entity_code}</p>
                )}
                {voucherModalNote.entity_phone && (
                  <p className="text-gray-600">Phone: {voucherModalNote.entity_phone}</p>
                )}
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-mono font-bold bg-gray-200 text-gray-700">
                  {voucherModalNote.entity_type}
                </span>
              </div>
              <div className="text-right">
                <span className="text-gray-500 font-semibold uppercase">Document Status:</span>
                <p className="font-bold text-gray-900 text-sm uppercase mt-0.5">{voucherModalNote.status}</p>
                {voucherModalNote.journal_entry_id && (
                  <p className="text-emerald-700 text-xs font-medium mt-1">
                    ✓ Linked to General Ledger
                  </p>
                )}
              </div>
            </div>

            {/* Note Body */}
            <div className="space-y-3">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Reason & Particulars:
              </span>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-800">
                {voucherModalNote.reason}
              </div>
            </div>

            {/* Amount Box */}
            <div className="p-4 rounded-lg bg-gray-100 border border-gray-300 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase text-gray-600">Total Adjustment Amount:</span>
                <p className="text-xs text-gray-500">Sri Lankan Rupees (LKR)</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-mono font-extrabold text-gray-900">
                  LKR {formatCurrency(voucherModalNote.amount)}
                </span>
              </div>
            </div>

            {/* Signature Blocks */}
            <div className="grid grid-cols-3 gap-6 pt-12 text-center text-xs text-gray-600 border-t border-gray-200">
              <div className="border-t border-gray-400 pt-2">
                <span>Prepared By</span>
              </div>
              <div className="border-t border-gray-400 pt-2">
                <span>Authorized Approver</span>
              </div>
              <div className="border-t border-gray-400 pt-2">
                <span>Received By / Customer</span>
              </div>
            </div>

            {/* Modal Bottom Controls */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 no-print">
              <button
                onClick={() => setVoucherModalNote(null)}
                className="px-4 py-2 text-xs font-semibold rounded bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-bold rounded bg-gray-900 hover:bg-gray-800 text-white flex items-center gap-1.5 shadow"
              >
                <Printer className="w-4 h-4" /> Print Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CANCELLATION MODAL ───────────────────────────────────────────────── */}
      {cancelModalNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#082321] border border-[#164e48] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl text-left">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-950 border border-rose-800 rounded-lg text-rose-400">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Cancel Adjustment Note</h3>
                <p className="text-xs text-[#7aa5a0]">Note #{cancelModalNote.note_number}</p>
              </div>
            </div>

            <p className="text-xs text-[#a0c4c0]">
              Are you sure you want to cancel this adjustment note? Please provide a reason for the audit trail:
            </p>

            <textarea
              rows={3}
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="e.g. Issued in error, duplicate note, customer declined..."
              className="w-full bg-[#0c2e2a] border border-[#164e48] text-white text-xs rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setCancelModalNote(null)
                  setCancellationReason('')
                }}
                className="px-4 py-2 text-xs rounded bg-[#0c2e2a] text-[#a0c4c0] hover:text-white border border-[#164e48]"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (!cancellationReason.trim()) return
                  cancelMutation.mutate({
                    noteId: cancelModalNote.id,
                    reason: cancellationReason.trim(),
                  })
                }}
                disabled={!cancellationReason.trim() || cancelMutation.isPending}
                className="px-4 py-2 text-xs font-bold rounded bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
