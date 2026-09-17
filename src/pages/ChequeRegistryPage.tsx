import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Landmark, CreditCard, BookOpen, PlusCircle, ArrowRightLeft, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { listLookup } from '../services/masterData'
import {
  fetchChequeBooks,
  createChequeBook,
  fetchCheques,
  createCheque,
  transitionCheque,
  fetchBankCards,
  createBankCard,
} from '../services/bankingService'
import type { ChequeStatus } from '../types/admin'

export const ChequeRegistryPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'cheques' | 'books' | 'cards'>('cheques')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Modals
  const [showChequeModal, setShowChequeModal] = useState(false)
  const [showBookModal, setShowBookModal] = useState(false)
  const [showCardModal, setShowCardModal] = useState(false)
  const [returnModalChequeId, setReturnModalChequeId] = useState<string | null>(null)
  const [returnReason, setReturnReason] = useState('')

  // Form states
  const [chequeNo, setChequeNo] = useState('')
  const [payeePayor, setPayeePayor] = useState('')
  const [bankName, setBankName] = useState('')
  const [chequeAmount, setChequeAmount] = useState<number>(0)
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0])
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound')
  const [bankAccountId, setBankAccountId] = useState('')
  const [branchId, setBranchId] = useState('')

  // Cheque Book Form
  const [bookNo, setBookNo] = useState('')
  const [startNo, setStartNo] = useState('')
  const [endNo, setEndNo] = useState('')

  // Card Form
  const [cardHolder, setCardHolder] = useState('')
  const [last4, setLast4] = useState('')
  const [cardType, setCardType] = useState<'debit' | 'credit'>('debit')
  const [expMonth, setExpMonth] = useState<number>(12)
  const [expYear, setExpYear] = useState<number>(2026)

  // Lookups
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['lookup', 'bank_accounts'],
    queryFn: async () => (await listLookup('bank_accounts', 'account_name')) || [],
  })

  const { data: branches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: async () => (await listLookup('branches', 'name')) || [],
  })

  // Queries
  const { data: cheques = [], isLoading: loadingCheques } = useQuery({
    queryKey: ['cheques', directionFilter, statusFilter],
    queryFn: () =>
      fetchCheques({
        direction: directionFilter === 'all' ? undefined : directionFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      }),
  })

  const { data: books = [], isLoading: loadingBooks } = useQuery({
    queryKey: ['cheque-books'],
    queryFn: () => fetchChequeBooks(),
  })

  const { data: cards = [], isLoading: loadingCards } = useQuery({
    queryKey: ['bank-cards'],
    queryFn: () => fetchBankCards(),
  })

  // Mutations
  const createChequeMutation = useMutation({
    mutationFn: createCheque,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] })
      setShowChequeModal(false)
      resetChequeForm()
    },
  })

  const createBookMutation = useMutation({
    mutationFn: createChequeBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheque-books'] })
      setShowBookModal(false)
      resetBookForm()
    },
  })

  const createCardMutation = useMutation({
    mutationFn: createBankCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-cards'] })
      setShowCardModal(false)
      resetCardForm()
    },
  })

  const transitionMutation = useMutation({
    mutationFn: async ({ chequeId, newStatus, depositDate, clearDate, reason }: { chequeId: string; newStatus: ChequeStatus; depositDate?: string; clearDate?: string; reason?: string }) => {
      await transitionCheque(chequeId, newStatus, { depositDate, clearDate, returnReason: reason })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] })
      setReturnModalChequeId(null)
      setReturnReason('')
    },
  })

  function resetChequeForm() {
    setChequeNo('')
    setPayeePayor('')
    setBankName('')
    setChequeAmount(0)
  }

  function resetBookForm() {
    setBookNo('')
    setStartNo('')
    setEndNo('')
  }

  function resetCardForm() {
    setCardHolder('')
    setLast4('')
  }

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cheque & Bank Card Administration</h1>
            <p className="text-sm text-gray-500">Manage Cheque Books, Bank Debit/Credit Cards & Cheque Lifecycle (In-Hand, Deposited, Cleared, Returned)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'cheques' && (
            <button
              onClick={() => setShowChequeModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm rounded-lg shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> Issue / Receive Cheque
            </button>
          )}
          {activeTab === 'books' && (
            <button
              onClick={() => setShowBookModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm rounded-lg shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> Add Cheque Book
            </button>
          )}
          {activeTab === 'cards' && (
            <button
              onClick={() => setShowCardModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm rounded-lg shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> Register Bank Card
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('cheques')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'cheques' ? 'border-amber-600 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" /> Cheque Registry ({cheques.length})
        </button>
        <button
          onClick={() => setActiveTab('books')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'books' ? 'border-amber-600 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BookOpen className="w-4 h-4" /> Cheque Books ({books.length})
        </button>
        <button
          onClick={() => setActiveTab('cards')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'cards' ? 'border-amber-600 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <CreditCard className="w-4 h-4" /> Bank Cards ({cards.length})
        </button>
      </div>

      {/* TAB 1: CHEQUE REGISTRY */}
      {activeTab === 'cheques' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden space-y-4">
          {/* Filters */}
          <div className="p-4 bg-gray-50/60 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase">Direction:</span>
              <button
                onClick={() => setDirectionFilter('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-full ${
                  directionFilter === 'all' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setDirectionFilter('inbound')}
                className={`px-3 py-1 text-xs font-semibold rounded-full ${
                  directionFilter === 'inbound' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Inbound (Customer)
              </button>
              <button
                onClick={() => setDirectionFilter('outbound')}
                className={`px-3 py-1 text-xs font-semibold rounded-full ${
                  directionFilter === 'outbound' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                Outbound (Vendor)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase">Lifecycle Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-xs bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="in_hand">In-Hand</option>
                <option value="deposited">Deposited</option>
                <option value="cleared">Cleared</option>
                <option value="returned">Returned / Bounced</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {loadingCheques ? (
            <p className="p-6 text-sm text-gray-500">Loading cheque registry...</p>
          ) : cheques.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">No cheque records found matching criteria.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">Cheque No</th>
                    <th className="px-6 py-3">Direction</th>
                    <th className="px-6 py-3">Payee / Payor</th>
                    <th className="px-6 py-3">Bank Account</th>
                    <th className="px-6 py-3">Due Date</th>
                    <th className="px-6 py-3 text-right">Amount (LKR)</th>
                    <th className="px-6 py-3 text-center">Status</th>
                    <th className="px-6 py-3 text-right">Lifecycle Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cheques.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/80">
                      <td className="px-6 py-3 font-mono font-bold text-gray-900">{c.cheque_number}</td>
                      <td className="px-6 py-3">
                        {c.direction === 'inbound' ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded">
                            Inbound
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded">
                            Outbound
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 font-medium text-gray-800">{c.payee_payor_name}</td>
                      <td className="px-6 py-3 text-gray-500">{c.bank_account_name || c.bank_name || 'N/A'}</td>
                      <td className="px-6 py-3 text-gray-600 font-mono text-xs">{c.due_date}</td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-gray-900">
                        {c.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {c.status === 'in_hand' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                            <Clock className="w-3 h-3" /> In Hand
                          </span>
                        )}
                        {c.status === 'deposited' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                            Deposited
                          </span>
                        )}
                        {c.status === 'cleared' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Cleared
                          </span>
                        )}
                        {c.status === 'returned' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
                            <AlertCircle className="w-3 h-3" /> Bounced
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right space-x-2">
                        {c.status === 'in_hand' && (
                          <button
                            onClick={() =>
                              transitionMutation.mutate({
                                chequeId: c.id,
                                newStatus: 'deposited',
                                depositDate: new Date().toISOString().split('T')[0],
                              })
                            }
                            className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-xs font-semibold"
                          >
                            Deposit
                          </button>
                        )}
                        {(c.status === 'in_hand' || c.status === 'deposited') && (
                          <>
                            <button
                              onClick={() =>
                                transitionMutation.mutate({
                                  chequeId: c.id,
                                  newStatus: 'cleared',
                                  clearDate: new Date().toISOString().split('T')[0],
                                })
                              }
                              className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-xs font-semibold"
                            >
                              Clear
                            </button>
                            <button
                              onClick={() => setReturnModalChequeId(c.id)}
                              className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-xs font-semibold"
                            >
                              Bounce
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CHEQUE BOOKS */}
      {activeTab === 'books' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {loadingBooks ? (
            <p className="text-sm text-gray-500">Loading cheque books...</p>
          ) : books.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">No registered cheque books found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {books.map((b) => (
                <div key={b.id} className="p-5 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-base">Book #{b.book_number}</span>
                    <span className="text-xs px-2.5 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full capitalize">
                      {b.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">Bank Account: <span className="font-semibold text-gray-800">{b.bank_account_name || 'Main Account'}</span></div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t text-xs">
                    <div>
                      <div className="text-gray-400">Start</div>
                      <div className="font-mono font-bold text-gray-800">{b.start_number}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">Current</div>
                      <div className="font-mono font-bold text-amber-600">{b.current_number}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">End</div>
                      <div className="font-mono font-bold text-gray-800">{b.end_number}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BANK CARDS */}
      {activeTab === 'cards' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {loadingCards ? (
            <p className="text-sm text-gray-500">Loading bank cards...</p>
          ) : cards.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">No bank card registries found.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cards.map((card) => (
                <div key={card.id} className="p-5 rounded-xl border border-slate-700 bg-slate-900 text-white space-y-4 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{card.card_type} Card</span>
                    <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-bold rounded">
                      {card.status}
                    </span>
                  </div>
                  <div className="font-mono text-xl tracking-widest font-bold text-slate-200">
                    •••• •••• •••• {card.card_number_last4}
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300 pt-2 border-t border-slate-800">
                    <div>
                      <div className="text-slate-400 text-[10px]">HOLDER</div>
                      <div className="font-semibold">{card.card_holder}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400 text-[10px]">EXPIRES</div>
                      <div className="font-mono">{card.expiry_month}/{card.expiry_year}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CREATE CHEQUE MODAL */}
      {showChequeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Issue / Receive Cheque Instrument</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Direction:</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as 'inbound' | 'outbound')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="inbound">Inbound (Received from Customer)</option>
                  <option value="outbound">Outbound (Issued to Vendor)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cheque Number:</label>
                <input
                  type="text"
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  placeholder="CHQ-100201"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Payee / Payor Name:</label>
                <input
                  type="text"
                  value={payeePayor}
                  onChange={(e) => setPayeePayor(e.target.value)}
                  placeholder="Customer or Vendor entity name"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bank Name:</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Commercial Bank / HNB"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Amount (LKR):</label>
                <input
                  type="number"
                  step="0.01"
                  value={chequeAmount}
                  onChange={(e) => setChequeAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Issue Date:</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Due Date:</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Target Branch:</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Select Branch</option>
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bank Account:</label>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Select Account</option>
                  {bankAccounts.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setShowChequeModal(false)}
                className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createChequeMutation.mutate({
                    branch_id: branchId || branches[0]?.value || '00000000-0000-0000-0000-000000000000',
                    direction,
                    bank_account_id: bankAccountId || undefined,
                    cheque_number: chequeNo,
                    payee_payor_name: payeePayor,
                    bank_name: bankName,
                    amount: chequeAmount,
                    issue_date: issueDate,
                    due_date: dueDate,
                  })
                }
                disabled={createChequeMutation.isPending || !chequeNo || !payeePayor || chequeAmount <= 0}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold"
              >
                Register Cheque
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CHEQUE BOOK MODAL */}
      {showBookModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Add New Cheque Book</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Book Number:</label>
                <input
                  type="text"
                  value={bookNo}
                  onChange={(e) => setBookNo(e.target.value)}
                  placeholder="CB-2026-01"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Cheque Number:</label>
                <input
                  type="text"
                  value={startNo}
                  onChange={(e) => setStartNo(e.target.value)}
                  placeholder="000101"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End Cheque Number:</label>
                <input
                  type="text"
                  value={endNo}
                  onChange={(e) => setEndNo(e.target.value)}
                  placeholder="000150"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bank Account:</label>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="">Select Account</option>
                  {bankAccounts.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setShowBookModal(false)}
                className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createBookMutation.mutate({
                    branch_id: branchId || branches[0]?.value || '',
                    bank_account_id: bankAccountId || bankAccounts[0]?.value || '',
                    book_number: bookNo,
                    start_number: startNo,
                    end_number: endNo,
                  })
                }
                disabled={createBookMutation.isPending || !bookNo || !startNo || !endNo}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold"
              >
                Add Cheque Book
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE BANK CARD MODAL */}
      {showCardModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Register Bank Card</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Card Holder Name:</label>
                <input
                  type="text"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  placeholder="Manager / Corporate Card"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Last 4 Digits:</label>
                <input
                  type="text"
                  maxLength={4}
                  value={last4}
                  onChange={(e) => setLast4(e.target.value)}
                  placeholder="4321"
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Card Type:</label>
                  <select
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value as 'debit' | 'credit')}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Bank Account:</label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="">Select Account</option>
                    {bankAccounts.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Month:</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={expMonth}
                    onChange={(e) => setExpMonth(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Year:</label>
                  <input
                    type="number"
                    min={2024}
                    value={expYear}
                    onChange={(e) => setExpYear(parseInt(e.target.value) || 2026)}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setShowCardModal(false)}
                className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createCardMutation.mutate({
                    branch_id: branchId || branches[0]?.value || '',
                    bank_account_id: bankAccountId || bankAccounts[0]?.value || '',
                    card_holder: cardHolder,
                    card_number_last4: last4,
                    card_type: cardType,
                    expiry_month: expMonth,
                    expiry_year: expYear,
                  })
                }
                disabled={createCardMutation.isPending || !cardHolder || last4.length !== 4}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold"
              >
                Register Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOUNCE / RETURN MODAL */}
      {returnModalChequeId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Mark Cheque as Returned / Bounced
            </h3>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700">Reason for Return / Bounce:</label>
              <textarea
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. Insufficient funds, signature mismatch"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setReturnModalChequeId(null)}
                className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  transitionMutation.mutate({
                    chequeId: returnModalChequeId,
                    newStatus: 'returned',
                    reason: returnReason,
                  })
                }
                disabled={transitionMutation.isPending || !returnReason}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold"
              >
                Confirm Bounce
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
