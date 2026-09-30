import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpenCheck,
  PlusCircle,
  CheckCircle2,
  Trash2,
  ArrowRightLeft,
  FileSpreadsheet,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  X,
  ExternalLink,
} from 'lucide-react'
import { listLookup } from '../services/masterData'
import {
  fetchJournalEntries,
  createJournalEntry,
  postJournalEntryService,
  fetchDebitCreditNotes,
  createDebitCreditNote,
} from '../services/accountingService'

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0)
}

interface DraftLine {
  account_id: string
  description: string
  debit: number
  credit: number
}

export const JournalEntriesPage: React.FC = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'journals' | 'notes'>('journals')
  const [showJournalModal, setShowJournalModal] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)

  // Journal form states
  const [branchId, setBranchId] = useState('')
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [journalDescription, setJournalDescription] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([
    { account_id: '', description: '', debit: 0, credit: 0 },
    { account_id: '', description: '', debit: 0, credit: 0 },
  ])
  const [errorNotice, setErrorNotice] = useState<string | null>(null)

  // Note form states
  const [noteType, setNoteType] = useState<'debit_note' | 'credit_note'>('debit_note')
  const [entityType, setEntityType] = useState<'customer' | 'vendor'>('customer')
  const [entityId, setEntityId] = useState('')
  const [noteAmount, setNoteAmount] = useState<number>(0)
  const [noteReason, setNoteReason] = useState('')

  // Lookups
  const { data: accounts = [] } = useQuery({
    queryKey: ['lookup', 'chart_of_accounts'],
    queryFn: async () => (await listLookup('chart_of_accounts', 'account_name')) || [],
  })

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

  // Queries
  const { data: journals = [], isLoading: loadingJournals, refetch: refetchJournals, isFetching: fetchingJournals } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => fetchJournalEntries(),
  })

  const { data: notes = [], refetch: refetchNotes } = useQuery({
    queryKey: ['debit-credit-notes'],
    queryFn: () => fetchDebitCreditNotes(),
  })

  // KPIs
  const kpis = useMemo(() => {
    const totalJournals = journals.length
    const totalDebit = journals
      .filter((j) => j.status === 'posted')
      .reduce((sum, j) => sum + (j.total_debit || 0), 0)
    const totalCredit = journals
      .filter((j) => j.status === 'posted')
      .reduce((sum, j) => sum + (j.total_credit || 0), 0)
    const pendingDrafts = journals.filter((j) => j.status === 'draft').length

    return { totalJournals, totalDebit, totalCredit, pendingDrafts }
  }, [journals])

  // Mutations
  const createJournalMutation = useMutation({
    mutationFn: createJournalEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      queryClient.invalidateQueries({ queryKey: ['general-ledger-report'] })
      setShowJournalModal(false)
      resetJournalForm()
    },
    onError: (err: Error) => {
      setErrorNotice(err.message || 'Failed to create journal entry')
    },
  })

  const postJournalMutation = useMutation({
    mutationFn: async (id: string) => {
      const defaultUserId = '00000000-0000-0000-0000-000000000000'
      await postJournalEntryService(id, defaultUserId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      queryClient.invalidateQueries({ queryKey: ['general-ledger-report'] })
    },
  })

  const createNoteMutation = useMutation({
    mutationFn: createDebitCreditNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debit-credit-notes'] })
      queryClient.invalidateQueries({ queryKey: ['adjustment-notes-list'] })
      setShowNoteModal(false)
      resetNoteForm()
    },
  })

  function handleAddLine() {
    setLines([...lines, { account_id: '', description: '', debit: 0, credit: 0 }])
  }

  function handleRemoveLine(index: number) {
    if (lines.length <= 2) return
    setLines(lines.filter((_, i) => i !== index))
  }

  function updateLine(index: number, field: keyof DraftLine, val: string | number) {
    const updated = [...lines]
    const numVal = Number(val) || 0
    const cur = { ...updated[index]!, [field]: val }
    if (field === 'debit' && numVal > 0) cur.credit = 0
    if (field === 'credit' && numVal > 0) cur.debit = 0
    updated[index] = cur
    setLines(updated)
  }

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0

  function resetJournalForm() {
    setJournalDescription('')
    setLines([
      { account_id: '', description: '', debit: 0, credit: 0 },
      { account_id: '', description: '', debit: 0, credit: 0 },
    ])
    setErrorNotice(null)
  }

  function resetNoteForm() {
    setNoteAmount(0)
    setNoteReason('')
  }

  return (
    <div
      className="min-h-screen text-[#e2f1ef] p-6 space-y-6"
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
      }}
    >
      {/* ── TOP HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-[#164e48] pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <BookOpenCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Journal Entries & Adjustments
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Double-Entry Fiscal Engine
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Post balanced double-entry manual journal vouchers (JV) & audit adjustment records
            </p>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              refetchJournals()
              refetchNotes()
            }}
            disabled={fetchingJournals}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${fetchingJournals ? 'animate-spin text-[#38d4c5]' : ''}`} />
            Refresh
          </button>

          {/* Quick Jump to General Ledger */}
          <button
            onClick={() => navigate('/finance/general-ledger')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            General Ledger
          </button>

          {/* Quick Jump to Adjustment Notes */}
          <button
            onClick={() => navigate('/finance/adjustment-notes')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Adjustment Notes
          </button>

          {activeTab === 'journals' ? (
            <button
              onClick={() => setShowJournalModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] transition-all shadow-md shadow-[#00b4d8]/20"
            >
              <PlusCircle className="w-4 h-4" />
              New Journal Entry
            </button>
          ) : (
            <button
              onClick={() => setShowNoteModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] transition-all shadow-md shadow-[#00b4d8]/20"
            >
              <PlusCircle className="w-4 h-4" />
              Issue Adjustment Note
            </button>
          )}
        </div>
      </div>

      {/* ── KPI METRICS CARDS ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Journals */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Journal Vouchers</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5]">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              {kpis.totalJournals}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1">
            Total manual journal vouchers
          </div>
        </div>

        {/* 2. Total Debit Turnover */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Total Posted Debits</span>
            <div className="p-2 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-emerald-400 tracking-tight">
              LKR {formatCurrency(kpis.totalDebit)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1">
            Posted debit transactions
          </div>
        </div>

        {/* 3. Total Credit Turnover */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Total Posted Credits</span>
            <div className="p-2 rounded-lg bg-rose-950/80 text-rose-400 border border-rose-800/40">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-rose-400 tracking-tight">
              LKR {formatCurrency(kpis.totalCredit)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1">
            Posted credit transactions
          </div>
        </div>

        {/* 4. Pending Drafts */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Draft Journals</span>
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
            Unposted vouchers in draft status
          </div>
        </div>
      </div>

      {/* ── TABS ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-b border-[#164e48]">
        <button
          onClick={() => setActiveTab('journals')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'journals'
              ? 'border-[#38d4c5] text-[#38d4c5]'
              : 'border-transparent text-[#7aa5a0] hover:text-white'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Journal Entries ({journals.length})
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'notes'
              ? 'border-[#38d4c5] text-[#38d4c5]'
              : 'border-transparent text-[#7aa5a0] hover:text-white'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Debit / Credit Notes ({notes.length})
        </button>
      </div>

      {/* ── TAB 1: JOURNALS LIST ─────────────────────────────────────────────── */}
      {activeTab === 'journals' && (
        <div className="space-y-4">
          {loadingJournals ? (
            <div className="bg-[#061e1c]/90 border border-[#164e48] rounded-xl p-12 text-center text-[#7aa5a0]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#38d4c5] mb-2" />
              Loading journal entries...
            </div>
          ) : journals.length === 0 ? (
            <div className="bg-[#061e1c]/90 border border-[#164e48] rounded-xl p-12 text-center text-[#7aa5a0]">
              <BookOpenCheck className="w-10 h-10 mx-auto text-[#164e48] mb-3" />
              <p className="text-base font-semibold text-white">No manual journal entries posted yet.</p>
              <p className="text-xs text-[#7aa5a0] mt-1">
                Click "+ New Journal Entry" above to post a balanced double-entry voucher.
              </p>
            </div>
          ) : (
            journals.map((j) => (
              <div
                key={j.id}
                className="bg-[#061e1c]/90 border border-[#164e48] rounded-xl p-5 space-y-4 shadow-md hover:border-[#1a5b54] transition-all"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#164e48]/70 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-base text-[#00b4d8]">
                      {j.entry_number}
                    </span>
                    <span className="text-xs text-[#7aa5a0] font-mono">
                      {j.entry_date}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 bg-[#113e3a] text-[#38d4c5] border border-[#164e48] rounded-full font-semibold capitalize">
                      {j.reference_type || 'Manual'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {j.status === 'draft' ? (
                      <>
                        <span className="px-2.5 py-0.5 bg-amber-950 text-amber-300 border border-amber-800/60 text-xs font-bold rounded-full">
                          Draft
                        </span>
                        <button
                          onClick={() => postJournalMutation.mutate(j.id)}
                          disabled={postJournalMutation.isPending}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Post Entry
                        </button>
                      </>
                    ) : (
                      <span className="px-2.5 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800/60 text-xs font-bold rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Posted
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-sm font-medium text-white">{j.description}</p>

                {/* Lines Table */}
                <div className="bg-[#041615] rounded-lg border border-[#164e48]/80 overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#0a2f2b] text-[#7aa5a0] uppercase border-b border-[#164e48]">
                      <tr>
                        <th className="py-2 px-3">Account Code & Name</th>
                        <th className="py-2 px-3">Line Particulars</th>
                        <th className="py-2 px-3 text-right">Debit (LKR)</th>
                        <th className="py-2 px-3 text-right">Credit (LKR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#164e48]/50">
                      {j.lines?.map((line, idx) => (
                        <tr key={idx} className="hover:bg-[#0c2e2a]/40">
                          <td className="py-2 px-3 font-medium text-white">
                            <span className="font-mono text-[#38d4c5] mr-1.5 font-bold">
                              {line.account_code || 'ACC'}
                            </span>
                            - {line.account_name || 'Account'}
                          </td>
                          <td className="py-2 px-3 text-[#a0c4c0]">{line.description || '-'}</td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-400">
                            {line.debit > 0 ? `LKR ${formatCurrency(line.debit)}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-rose-400">
                            {line.credit > 0 ? `LKR ${formatCurrency(line.credit)}` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-[#164e48] bg-[#0a2f2b]/60 font-bold text-white">
                      <tr>
                        <td colSpan={2} className="py-2 px-3 text-right text-[#7aa5a0]">
                          Balanced Totals:
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-400">
                          LKR {formatCurrency(j.total_debit)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-rose-400">
                          LKR {formatCurrency(j.total_credit)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── TAB 2: NOTES SUMMARY ─────────────────────────────────────────────── */}
      {activeTab === 'notes' && (
        <div className="bg-[#061e1c]/90 border border-[#164e48] rounded-xl overflow-hidden shadow-lg">
          <div className="p-4 border-b border-[#164e48] flex items-center justify-between">
            <span className="text-xs text-[#7aa5a0]">
              Showing Debit & Credit Notes records. For full workspace, visit{' '}
              <button
                onClick={() => navigate('/finance/adjustment-notes')}
                className="text-[#38d4c5] underline font-semibold hover:text-white"
              >
                Adjustment Notes Workspace
              </button>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0a2f2b] text-xs text-[#7aa5a0] uppercase font-semibold border-b border-[#164e48]">
                <tr>
                  <th className="px-4 py-3">Note No</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Entity Type</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3 text-right">Amount (LKR)</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#164e48]/50">
                {notes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-[#7aa5a0]">
                      No adjustment notes issued yet.
                    </td>
                  </tr>
                ) : (
                  notes.map((n) => (
                    <tr key={n.id} className="hover:bg-[#0c2e2a]/60">
                      <td className="px-4 py-3 font-mono font-bold text-[#00b4d8]">{n.note_number}</td>
                      <td className="px-4 py-3">
                        {n.note_type === 'debit_note' ? (
                          <span className="px-2 py-0.5 bg-cyan-950 text-cyan-300 text-xs font-semibold rounded border border-cyan-800">
                            Debit Note
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-950 text-rose-300 text-xs font-semibold rounded border border-rose-800">
                            Credit Note
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-white font-medium">{n.entity_type}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#a0c4c0]">{n.note_date}</td>
                      <td className="px-4 py-3 text-white max-w-xs truncate">{n.reason}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-white">
                        LKR {formatCurrency(n.amount)}
                      </td>
                      <td className="px-4 py-3 text-center capitalize">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                          {n.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CREATE JOURNAL MODAL ────────────────────────────────────────────── */}
      {showJournalModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#082321] border border-[#164e48] rounded-xl max-w-3xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto text-left">
            <div className="flex items-center justify-between border-b border-[#164e48] pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpenCheck className="w-5 h-5 text-[#38d4c5]" />
                New Double-Entry Manual Journal Voucher
              </h3>
              <button
                onClick={() => setShowJournalModal(false)}
                className="text-[#7aa5a0] hover:text-white p-1 rounded-lg hover:bg-[#113e3a]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorNotice && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-200 text-xs font-medium rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorNotice}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#7aa5a0] mb-1">Target Branch:</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="">Select Branch</option>
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#7aa5a0] mb-1">Entry Date:</label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-[#7aa5a0] mb-1">
                  Journal Description / Particulars:
                </label>
                <input
                  type="text"
                  value={journalDescription}
                  onChange={(e) => setJournalDescription(e.target.value)}
                  placeholder="e.g. Month-end depreciation adjustment, asset reclassification..."
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>
            </div>

            {/* Lines Editor */}
            <div className="space-y-2 pt-2 border-t border-[#164e48]">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#7aa5a0] uppercase tracking-wider">
                  Journal Lines (Debits & Credits)
                </h4>
                <button
                  onClick={handleAddLine}
                  className="text-xs text-[#38d4c5] hover:text-white font-bold flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> Add Line
                </button>
              </div>

              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-[#051817] p-2.5 rounded-lg border border-[#164e48]"
                  >
                    <select
                      value={line.account_id}
                      onChange={(e) => updateLine(idx, 'account_id', e.target.value)}
                      className="flex-1 px-2.5 py-1.5 bg-[#0c2e2a] border border-[#164e48] text-white rounded text-xs focus:outline-none"
                    >
                      <option value="">-- Account --</option>
                      {accounts.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                      placeholder="Line remark..."
                      className="w-40 px-2.5 py-1.5 bg-[#0c2e2a] border border-[#164e48] text-white rounded text-xs focus:outline-none"
                    />

                    <input
                      type="number"
                      step="0.01"
                      value={line.debit || ''}
                      onChange={(e) => updateLine(idx, 'debit', parseFloat(e.target.value) || 0)}
                      placeholder="Debit"
                      className="w-28 px-2.5 py-1.5 bg-[#0c2e2a] border border-[#164e48] text-emerald-400 font-mono text-right rounded text-xs focus:outline-none font-semibold"
                    />

                    <input
                      type="number"
                      step="0.01"
                      value={line.credit || ''}
                      onChange={(e) => updateLine(idx, 'credit', parseFloat(e.target.value) || 0)}
                      placeholder="Credit"
                      className="w-28 px-2.5 py-1.5 bg-[#0c2e2a] border border-[#164e48] text-rose-400 font-mono text-right rounded text-xs focus:outline-none font-semibold"
                    />

                    <button
                      onClick={() => handleRemoveLine(idx)}
                      disabled={lines.length <= 2}
                      className="p-1 text-[#7aa5a0] hover:text-rose-400 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Totals Balance Indicator */}
              <div
                className={`p-3 rounded-lg border flex items-center justify-between text-xs font-bold ${
                  isBalanced
                    ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/80 border-rose-800 text-rose-300'
                }`}
              >
                <span>
                  {isBalanced
                    ? '✓ Entry Balanced!'
                    : `Unbalanced! Difference: LKR ${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
                </span>
                <div className="space-x-4 font-mono">
                  <span>Debits: LKR {formatCurrency(totalDebit)}</span>
                  <span>Credits: LKR {formatCurrency(totalCredit)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#164e48]">
              <button
                onClick={() => setShowJournalModal(false)}
                className="px-4 py-2 border border-[#164e48] rounded-lg text-xs font-medium text-[#7aa5a0] hover:bg-[#0c2e2a]"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createJournalMutation.mutate({
                    branch_id: branchId || branches[0]?.value || '00000000-0000-0000-0000-000000000000',
                    entry_date: entryDate,
                    description: journalDescription,
                    lines: lines.map((l) => ({
                      account_id: l.account_id,
                      description: l.description,
                      debit: l.debit,
                      credit: l.credit,
                    })),
                  })
                }
                disabled={createJournalMutation.isPending || !isBalanced || !journalDescription}
                className="px-4 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] rounded-lg text-xs font-bold disabled:opacity-50 transition-colors shadow-md shadow-[#00b4d8]/20"
              >
                Save Draft Journal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE NOTE MODAL ────────────────────────────────────────────────── */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#082321] border border-[#164e48] rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-[#164e48] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-[#38d4c5]" />
                Issue Debit / Credit Adjustment Note
              </h3>
              <button
                onClick={() => setShowNoteModal(false)}
                className="text-[#7aa5a0] hover:text-white p-1 rounded-lg hover:bg-[#113e3a]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#7aa5a0] mb-1 font-medium">Note Type:</label>
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value as 'debit_note' | 'credit_note')}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] text-white rounded-lg focus:outline-none"
                >
                  <option value="debit_note">Debit Note (Reduce Payables / Charge Customer)</option>
                  <option value="credit_note">Credit Note (Reduce Receivables / Vendor Allowance)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#7aa5a0] mb-1 font-medium">Target Entity:</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value as 'customer' | 'vendor')}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] text-white rounded-lg focus:outline-none"
                >
                  <option value="customer">Customer</option>
                  <option value="vendor">Vendor / Supplier</option>
                </select>
              </div>

              <div>
                <label className="block text-[#7aa5a0] mb-1 font-medium">Select Entity:</label>
                <select
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] text-white rounded-lg focus:outline-none"
                >
                  <option value="">-- Choose {entityType} --</option>
                  {(entityType === 'customer' ? customers : vendors).map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#7aa5a0] mb-1 font-medium">Amount (LKR):</label>
                <input
                  type="number"
                  step="0.01"
                  value={noteAmount || ''}
                  onChange={(e) => setNoteAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] text-white rounded-lg font-mono focus:outline-none font-semibold"
                />
              </div>

              <div>
                <label className="block text-[#7aa5a0] mb-1 font-medium">Adjustment Reason:</label>
                <input
                  type="text"
                  value={noteReason}
                  onChange={(e) => setNoteReason(e.target.value)}
                  placeholder="e.g. Price difference, damaged item credit, rebate..."
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] text-white rounded-lg focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#164e48]">
              <button
                onClick={() => setShowNoteModal(false)}
                className="px-4 py-2 border border-[#164e48] rounded-lg text-xs font-medium text-[#7aa5a0] hover:bg-[#0c2e2a]"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createNoteMutation.mutate({
                    branch_id: branchId || branches[0]?.value || '00000000-0000-0000-0000-000000000000',
                    note_type: noteType,
                    entity_type: entityType,
                    entity_id: entityId || (entityType === 'customer' ? customers[0]?.value : vendors[0]?.value) || '00000000-0000-0000-0000-000000000000',
                    note_date: new Date().toISOString().slice(0, 10),
                    amount: noteAmount,
                    reason: noteReason,
                  })
                }
                disabled={createNoteMutation.isPending || noteAmount <= 0 || !noteReason}
                className="px-4 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] rounded-lg text-xs font-bold transition-colors shadow-md shadow-[#00b4d8]/20"
              >
                Issue Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
