import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpenCheck, PlusCircle, CheckCircle2, Trash2, ArrowRightLeft, FileSpreadsheet } from 'lucide-react'
import { listLookup } from '../services/masterData'
import {
  fetchJournalEntries,
  createJournalEntry,
  postJournalEntryService,
  fetchDebitCreditNotes,
  createDebitCreditNote,
} from '../services/accountingService'

interface DraftLine {
  account_id: string
  description: string
  debit: number
  credit: number
}

export const JournalEntriesPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'journals' | 'notes'>('journals')
  const [showJournalModal, setShowJournalModal] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)

  // Journal form states
  const [branchId, setBranchId] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
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
  const { data: journals = [], isLoading: loadingJournals } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: () => fetchJournalEntries(),
  })

  const { data: notes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ['debit-credit-notes'],
    queryFn: () => fetchDebitCreditNotes(),
  })

  // Mutations
  const createJournalMutation = useMutation({
    mutationFn: createJournalEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
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
    },
  })

  const createNoteMutation = useMutation({
    mutationFn: createDebitCreditNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debit-credit-notes'] })
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
    <div className="page-stack">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <BookOpenCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">General Ledger & Adjustment Notes</h1>
            <p className="text-sm text-gray-500">Post balanced double-entry manual journal vouchers & Debit/Credit adjustment notes</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'journals' ? (
            <button
              onClick={() => setShowJournalModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm rounded-lg shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> New Journal Entry
            </button>
          ) : (
            <button
              onClick={() => setShowNoteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm rounded-lg shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> Issue Adjustment Note
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('journals')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'journals' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" /> Journal Entries ({journals.length})
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'notes' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" /> Debit / Credit Notes ({notes.length})
        </button>
      </div>

      {/* TAB 1: JOURNALS */}
      {activeTab === 'journals' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loadingJournals ? (
            <p className="p-6 text-sm text-gray-500">Loading journal entries...</p>
          ) : journals.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No manual journal entries posted yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {journals.map((j) => (
                <div key={j.id} className="p-6 space-y-4 hover:bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-gray-900 text-base">{j.entry_number}</span>
                      <span className="text-xs text-gray-500 font-mono">{j.entry_date}</span>
                      <span className="text-xs px-2.5 py-0.5 bg-gray-100 text-gray-700 rounded-full font-semibold capitalize">
                        {j.reference_type || 'Manual'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {j.status === 'draft' ? (
                        <>
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold rounded-full">
                            Draft
                          </span>
                          <button
                            onClick={() => postJournalMutation.mutate(j.id)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Post Entry
                          </button>
                        </>
                      ) : (
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-full">
                          Posted
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm font-medium text-gray-800">{j.description}</p>

                  {/* Lines Table */}
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 text-left uppercase border-b border-gray-200">
                          <th className="pb-2">Account Code & Name</th>
                          <th className="pb-2">Line Particulars</th>
                          <th className="pb-2 text-right">Debit (LKR)</th>
                          <th className="pb-2 text-right">Credit (LKR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200/50">
                        {j.lines?.map((line, idx) => (
                          <tr key={idx} className="text-gray-700">
                            <td className="py-2 font-medium">
                              <span className="font-mono text-purple-600">{line.account_code || 'ACC'}</span> - {line.account_name || 'Account'}
                            </td>
                            <td className="py-2 text-gray-500">{line.description || '-'}</td>
                            <td className="py-2 text-right font-mono font-semibold text-gray-900">
                              {line.debit > 0 ? line.debit.toFixed(2) : '-'}
                            </td>
                            <td className="py-2 text-right font-mono font-semibold text-gray-900">
                              {line.credit > 0 ? line.credit.toFixed(2) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-300 font-bold text-gray-900">
                          <td colSpan={2} className="pt-2 text-right">Totals:</td>
                          <td className="pt-2 text-right font-mono">{j.total_debit.toFixed(2)}</td>
                          <td className="pt-2 text-right font-mono">{j.total_credit.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: NOTES */}
      {activeTab === 'notes' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loadingNotes ? (
            <p className="p-6 text-sm text-gray-500">Loading debit & credit notes...</p>
          ) : notes.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No adjustment notes issued yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Note No</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Entity Type</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Reason</th>
                    <th className="px-6 py-3 text-right">Amount (LKR)</th>
                    <th className="px-6 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {notes.map((n) => (
                    <tr key={n.id} className="hover:bg-gray-50/80">
                      <td className="px-6 py-3.5 font-mono font-bold text-gray-900">{n.note_number}</td>
                      <td className="px-6 py-3.5">
                        {n.note_type === 'debit_note' ? (
                          <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded">
                            Debit Note
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 bg-purple-50 text-purple-700 text-xs font-bold rounded">
                            Credit Note
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 capitalize text-gray-700 font-medium">{n.entity_type}</td>
                      <td className="px-6 py-3.5 font-mono text-xs text-gray-500">{n.note_date}</td>
                      <td className="px-6 py-3.5 text-gray-800">{n.reason}</td>
                      <td className="px-6 py-3.5 text-right font-mono font-bold text-gray-900">{n.amount.toFixed(2)}</td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full capitalize">
                          {n.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CREATE JOURNAL MODAL */}
      {showJournalModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900">New Double-Entry Manual Journal Voucher</h3>

            {errorNotice && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg">
                {errorNotice}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Branch:</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="">Select Branch</option>
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Entry Date:</label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Journal Description / Particulars:</label>
                <input
                  type="text"
                  value={journalDescription}
                  onChange={(e) => setJournalDescription(e.target.value)}
                  placeholder="e.g. Month-end depreciation adjustment"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>

            {/* Lines Editor */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Journal Lines (Debits & Credits)</h4>
                <button
                  onClick={handleAddLine}
                  className="text-xs text-purple-600 hover:text-purple-800 font-bold flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> Add Line
                </button>
              </div>

              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
                    <select
                      value={line.account_id}
                      onChange={(e) => updateLine(idx, 'account_id', e.target.value)}
                      className="flex-1 px-2.5 py-1.5 border rounded text-xs bg-white"
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
                      className="w-40 px-2.5 py-1.5 border rounded text-xs bg-white"
                    />

                    <input
                      type="number"
                      step="0.01"
                      value={line.debit || ''}
                      onChange={(e) => updateLine(idx, 'debit', parseFloat(e.target.value) || 0)}
                      placeholder="Debit"
                      className="w-28 px-2.5 py-1.5 border rounded text-xs bg-white font-mono text-right"
                    />

                    <input
                      type="number"
                      step="0.01"
                      value={line.credit || ''}
                      onChange={(e) => updateLine(idx, 'credit', parseFloat(e.target.value) || 0)}
                      placeholder="Credit"
                      className="w-28 px-2.5 py-1.5 border rounded text-xs bg-white font-mono text-right"
                    />

                    <button
                      onClick={() => handleRemoveLine(idx)}
                      disabled={lines.length <= 2}
                      className="p-1 text-gray-400 hover:text-rose-600 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Totals Balance Indicator */}
              <div className={`p-3 rounded-lg border flex items-center justify-between text-xs font-bold ${
                isBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                <span>
                  {isBalanced ? '✓ Entry Balanced!' : `Unbalanced! Difference: LKR ${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
                </span>
                <div className="space-x-4 font-mono">
                  <span>Debits: {totalDebit.toFixed(2)}</span>
                  <span>Credits: {totalCredit.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setShowJournalModal(false)}
                className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
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
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold disabled:opacity-50"
              >
                Save Draft Journal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NOTE MODAL */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Issue Debit / Credit Adjustment Note</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Note Type:</label>
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value as 'debit_note' | 'credit_note')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="debit_note">Debit Note (Increase Receivable / Payables)</option>
                  <option value="credit_note">Credit Note (Decrease Receivable / Payables)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Entity:</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value as 'customer' | 'vendor')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="customer">Customer</option>
                  <option value="vendor">Vendor / Supplier</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Select Entity:</label>
                <select
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
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
                <label className="block text-xs font-medium text-gray-700 mb-1">Amount (LKR):</label>
                <input
                  type="number"
                  step="0.01"
                  value={noteAmount}
                  onChange={(e) => setNoteAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Adjustment Reason:</label>
                <input
                  type="text"
                  value={noteReason}
                  onChange={(e) => setNoteReason(e.target.value)}
                  placeholder="e.g. Price difference / damaged item credit"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setShowNoteModal(false)}
                className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
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
                    note_date: new Date().toISOString().split('T')[0],
                    amount: noteAmount,
                    reason: noteReason,
                  })
                }
                disabled={createNoteMutation.isPending || noteAmount <= 0 || !noteReason}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold"
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
