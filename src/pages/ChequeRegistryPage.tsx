import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Landmark,
  CreditCard,
  BookOpen,
  PlusCircle,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  Eye,
  X,
  Search,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Download,
  Ban,
  Radio,
} from 'lucide-react'
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
import type { Cheque, ChequeStatus } from '../types/admin'

// Currency formatter
const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0)
}

// Convert numbers to Sri Lankan English words for cheque leaf preview
function numberToWords(num: number): string {
  if (num === 0) return 'Zero Rupees Only'
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ]
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  const inWords = (n: number): string => {
    if (n < 20) return a[n] || ''
    if (n < 100) return (b[Math.floor(n / 10)] || '') + (n % 10 !== 0 ? ' ' + (a[n % 10] || '') : '')
    if (n < 1000) return (a[Math.floor(n / 100)] || '') + ' Hundred' + (n % 100 !== 0 ? ' and ' + inWords(n % 100) : '')
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '')
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '')
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '')
  }

  const integerPart = Math.floor(num)
  const cents = Math.round((num - integerPart) * 100)
  const rupeesStr = inWords(integerPart) + ' Rupees'
  const centsStr = cents > 0 ? ` and ${cents}/100 Cents` : ''
  return `${rupeesStr}${centsStr} Only`
}

const COMMON_BOUNCE_REASONS = [
  'Insufficient Funds / Refer to Drawer (NSF)',
  'Drawer Signature Differs / Incomplete',
  'Payment Stopped by Drawer / Customer Countermand',
  'Post-Dated / Stale Cheque (Exceeded 6 Months)',
  'Amounts in Words and Figures Differ',
  'Account Closed / Blocked by Financial Institution',
  'Material Alteration without Drawer Confirmation',
]

export const ChequeRegistryPage: React.FC = () => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // ── Global Toast ──────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Active Tabs & Filters ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'cheques' | 'books' | 'cards'>('cheques')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState<string>('all')

  // ── Modals State ──────────────────────────────────────────────────────────
  const [showChequeModal, setShowChequeModal] = useState(false)
  const [showBookModal, setShowBookModal] = useState(false)
  const [showCardModal, setShowCardModal] = useState(false)
  const [returnModalCheque, setReturnModalCheque] = useState<Cheque | null>(null)
  const [returnReason, setReturnReason] = useState('')
  const [previewCheque, setPreviewCheque] = useState<Cheque | null>(null)

  // ── Form States: Cheque Issue/Receive ─────────────────────────────────────
  const [chequeNo, setChequeNo] = useState('')
  const [payeePayor, setPayeePayor] = useState('')
  const [bankName, setBankName] = useState('')
  const [chequeAmount, setChequeAmount] = useState<string>('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0])
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound')
  const [bankAccountId, setBankAccountId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [chequeNotes, setChequeNotes] = useState('')

  // ── Form States: Cheque Book ──────────────────────────────────────────────
  const [bookNo, setBookNo] = useState('')
  const [startNo, setStartNo] = useState('')
  const [endNo, setEndNo] = useState('')
  const [bookBankAccountId, setBookBankAccountId] = useState('')
  const [bookBranchId, setBookBranchId] = useState('')

  // ── Form States: Bank Card ────────────────────────────────────────────────
  const [cardHolder, setCardHolder] = useState('')
  const [last4, setLast4] = useState('')
  const [cardType, setCardType] = useState<'debit' | 'credit'>('debit')
  const [expMonth, setExpMonth] = useState<number>(12)
  const [expYear, setExpYear] = useState<number>(new Date().getFullYear() + 3)
  const [cardBankAccountId, setCardBankAccountId] = useState('')
  const [cardBranchId, setCardBranchId] = useState('')

  // ── Lookups ───────────────────────────────────────────────────────────────
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['lookup', 'bank_accounts'],
    queryFn: async () => (await listLookup('bank_accounts', 'account_name')) || [],
  })

  const { data: branches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: async () => (await listLookup('branches', 'name')) || [],
  })

  // ── Queries ───────────────────────────────────────────────────────────────
  const {
    data: cheques = [],
    isLoading: loadingCheques,
    isFetching: fetchingCheques,
    refetch: refetchCheques,
  } = useQuery({
    queryKey: ['cheques', directionFilter, statusFilter, branchFilter],
    queryFn: () =>
      fetchCheques({
        branchId: branchFilter === 'all' ? undefined : branchFilter,
        direction: directionFilter === 'all' ? undefined : directionFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
      }),
  })

  const {
    data: books = [],
    isLoading: loadingBooks,
    isFetching: fetchingBooks,
    refetch: refetchBooks,
  } = useQuery({
    queryKey: ['cheque-books'],
    queryFn: () => fetchChequeBooks(),
  })

  const {
    data: cards = [],
    isLoading: loadingCards,
    isFetching: fetchingCards,
    refetch: refetchCards,
  } = useQuery({
    queryKey: ['bank-cards'],
    queryFn: () => fetchBankCards(),
  })

  // ── KPI Summary Calculations ──────────────────────────────────────────────
  const kpis = useMemo(() => {
    const inHandCheques = cheques.filter((c) => c.status === 'in_hand')
    const inHandTotal = inHandCheques.reduce((sum, c) => sum + (c.amount || 0), 0)
    const inHandInbound = inHandCheques.filter((c) => c.direction === 'inbound').length
    const inHandOutbound = inHandCheques.filter((c) => c.direction === 'outbound').length

    const depositedCheques = cheques.filter((c) => c.status === 'deposited')
    const depositedTotal = depositedCheques.reduce((sum, c) => sum + (c.amount || 0), 0)

    const clearedCheques = cheques.filter((c) => c.status === 'cleared')
    const clearedTotal = clearedCheques.reduce((sum, c) => sum + (c.amount || 0), 0)

    const returnedCheques = cheques.filter((c) => c.status === 'returned')
    const returnedTotal = returnedCheques.reduce((sum, c) => sum + (c.amount || 0), 0)

    const activeBooks = books.filter((b) => b.status === 'active').length
    const activeCards = cards.filter((c) => c.status === 'active').length

    return {
      inHandCount: inHandCheques.length,
      inHandTotal,
      inHandInbound,
      inHandOutbound,
      depositedCount: depositedCheques.length,
      depositedTotal,
      clearedCount: clearedCheques.length,
      clearedTotal,
      returnedCount: returnedCheques.length,
      returnedTotal,
      activeBooks,
      activeCards,
    }
  }, [cheques, books, cards])

  // Filtered Cheques list (client-side text search)
  const filteredCheques = useMemo(() => {
    if (!search.trim()) return cheques
    const q = search.toLowerCase()
    return cheques.filter(
      (c) =>
        c.cheque_number.toLowerCase().includes(q) ||
        c.payee_payor_name.toLowerCase().includes(q) ||
        (c.bank_name && c.bank_name.toLowerCase().includes(q)) ||
        (c.bank_account_name && c.bank_account_name.toLowerCase().includes(q))
    )
  }, [cheques, search])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createChequeMutation = useMutation({
    mutationFn: createCheque,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] })
      setShowChequeModal(false)
      resetChequeForm()
      notify('Cheque instrument registered successfully!')
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to register cheque', true)
    },
  })

  const createBookMutation = useMutation({
    mutationFn: createChequeBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheque-books'] })
      setShowBookModal(false)
      resetBookForm()
      notify('Cheque book registered successfully!')
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to add cheque book', true)
    },
  })

  const createCardMutation = useMutation({
    mutationFn: createBankCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-cards'] })
      setShowCardModal(false)
      resetCardForm()
      notify('Corporate bank card registered successfully!')
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to register card', true)
    },
  })

  const transitionMutation = useMutation({
    mutationFn: async ({
      chequeId,
      newStatus,
      depositDate,
      clearDate,
      reason,
    }: {
      chequeId: string
      newStatus: ChequeStatus
      depositDate?: string
      clearDate?: string
      reason?: string
    }) => {
      await transitionCheque(chequeId, newStatus, { depositDate, clearDate, returnReason: reason })
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] })
      setReturnModalCheque(null)
      setReturnReason('')
      if (variables.newStatus === 'deposited') notify('Cheque marked as Deposited!')
      if (variables.newStatus === 'cleared') notify('Cheque marked as Cleared & Realized!')
      if (variables.newStatus === 'returned') notify('Cheque marked as Returned / Bounced.', true)
      if (variables.newStatus === 'cancelled') notify('Cheque marked as Cancelled.')
    },
    onError: (err: Error) => {
      notify(err.message || 'Failed to update cheque status', true)
    },
  })

  function resetChequeForm() {
    setChequeNo('')
    setPayeePayor('')
    setBankName('')
    setChequeAmount('')
    setChequeNotes('')
  }

  function resetBookForm() {
    setBookNo('')
    setStartNo('')
    setEndNo('')
  }

  function resetCardForm() {
    setCardHolder('')
    setLast4('')
    setExpMonth(12)
    setExpYear(new Date().getFullYear() + 3)
  }

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredCheques.length === 0) {
      notify('No cheque records to export', true)
      return
    }
    const headers = [
      'Cheque Number',
      'Direction',
      'Payee / Payor',
      'Bank / Account',
      'Amount (LKR)',
      'Issue Date',
      'Due Date',
      'Status',
      'Deposit Date',
      'Clear Date',
      'Return Reason',
    ]
    const rows = filteredCheques.map((c) => [
      `"${c.cheque_number}"`,
      `"${c.direction}"`,
      `"${c.payee_payor_name.replace(/"/g, '""')}"`,
      `"${(c.bank_account_name || c.bank_name || '').replace(/"/g, '""')}"`,
      c.amount.toFixed(2),
      c.issue_date,
      c.due_date,
      c.status,
      c.deposit_date || '',
      c.clear_date || '',
      `"${(c.return_reason || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `cheque_registry_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    notify('Cheque registry exported to CSV')
  }

  // Calculate leaves count for book modal
  const totalLeavesEstimate = useMemo(() => {
    const s = parseInt(startNo, 10)
    const e = parseInt(endNo, 10)
    if (!isNaN(s) && !isNaN(e) && e >= s) {
      return e - s + 1
    }
    return 0
  }, [startNo, endNo])

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
          <div className="p-3 bg-[#0a2f2b] border border-[#164e48] rounded-xl text-[#38d4c5] shadow-inner">
            <Landmark className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Cheque & Bank Card Administration
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#113e3a] text-[#38d4c5] border border-[#164e48]">
                Banking & Instruments
              </span>
            </div>
            <p className="text-sm text-[#7aa5a0] mt-0.5">
              Manage Cheque Books, Corporate Bank Cards & Lifecycle Transitions (In-Hand, Deposited, Cleared, Bounced)
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              refetchCheques()
              refetchBooks()
              refetchCards()
            }}
            disabled={fetchingCheques || fetchingBooks || fetchingCards}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] transition-colors"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                fetchingCheques || fetchingBooks || fetchingCards ? 'animate-spin text-[#38d4c5]' : ''
              }`}
            />
            Refresh
          </button>

          <button
            onClick={() => navigate('/finance/bank-reconciliation')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Bank Reconciliation
          </button>

          <button
            onClick={() => navigate('/finance/bank-book')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#38d4c5] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Bank Book
          </button>

          {activeTab === 'cheques' && (
            <button
              onClick={() => setShowChequeModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] transition-all shadow-md shadow-[#00b4d8]/20"
            >
              <PlusCircle className="w-4 h-4" />
              Issue / Receive Cheque
            </button>
          )}

          {activeTab === 'books' && (
            <button
              onClick={() => setShowBookModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] transition-all shadow-md shadow-[#00b4d8]/20"
            >
              <PlusCircle className="w-4 h-4" />
              Add Cheque Book
            </button>
          )}

          {activeTab === 'cards' && (
            <button
              onClick={() => setShowCardModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] transition-all shadow-md shadow-[#00b4d8]/20"
            >
              <PlusCircle className="w-4 h-4" />
              Register Bank Card
            </button>
          )}
        </div>
      </div>

      {/* ── KPI METRICS CARDS ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. In Hand Portfolio */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">In-Hand Instruments</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              LKR {formatCurrency(kpis.inHandTotal)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#7aa5a0] mt-1.5">
            <span>{kpis.inHandCount} cheques in vault</span>
            <span className="text-amber-400/90 font-mono">
              {kpis.inHandInbound} In / {kpis.inHandOutbound} Out
            </span>
          </div>
        </div>

        {/* 2. In Clearing / Deposited */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Deposited / Clearing</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-blue-400">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              LKR {formatCurrency(kpis.depositedTotal)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5">
            {kpis.depositedCount} instruments lodged with bank
          </div>
        </div>

        {/* 3. Cleared & Realized */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Cleared & Realized</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-white tracking-tight">
              LKR {formatCurrency(kpis.clearedTotal)}
            </span>
          </div>
          <div className="text-xs text-[#7aa5a0] mt-1.5">
            {kpis.clearedCount} instruments cleared in ledger
          </div>
        </div>

        {/* 4. Returned / Operational Tools */}
        <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#7aa5a0]">Bounced & Instruments</span>
            <div className="p-2 rounded-lg bg-[#0a2f2b] text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-mono font-bold text-rose-400 tracking-tight">
              {kpis.returnedCount} Bounced
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-[#7aa5a0] mt-1.5">
            <span>LKR {formatCurrency(kpis.returnedTotal)}</span>
            <span className="text-[#38d4c5]">{kpis.activeBooks} Books • {kpis.activeCards} Cards</span>
          </div>
        </div>
      </div>

      {/* ── TABS NAVIGATION ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-[#164e48] pb-1">
        <button
          onClick={() => setActiveTab('cheques')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'cheques'
              ? 'border-[#38d4c5] text-[#38d4c5] bg-[#0c2e2a]/50'
              : 'border-transparent text-[#7aa5a0] hover:text-white'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Cheque Lifecycle Registry
          <span className="px-2 py-0.5 text-xs rounded-full bg-[#113e3a] text-[#38d4c5] font-mono">
            {cheques.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('books')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'books'
              ? 'border-[#38d4c5] text-[#38d4c5] bg-[#0c2e2a]/50'
              : 'border-transparent text-[#7aa5a0] hover:text-white'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Cheque Books
          <span className="px-2 py-0.5 text-xs rounded-full bg-[#113e3a] text-[#38d4c5] font-mono">
            {books.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('cards')}
          className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'cards'
              ? 'border-[#38d4c5] text-[#38d4c5] bg-[#0c2e2a]/50'
              : 'border-transparent text-[#7aa5a0] hover:text-white'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Bank Cards
          <span className="px-2 py-0.5 text-xs rounded-full bg-[#113e3a] text-[#38d4c5] font-mono">
            {cards.length}
          </span>
        </button>
      </div>

      {/* ── TAB 1: CHEQUE REGISTRY ───────────────────────────────────────────── */}
      {activeTab === 'cheques' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
            {/* Search */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#7aa5a0]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Cheque #, Payee, Drawer, or Bank..."
                className="w-full pl-9 pr-4 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white placeholder-[#7aa5a0] focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
              />
            </div>

            {/* Direction Filter Toggle */}
            <div className="flex items-center gap-1 bg-[#0a2724] p-1 rounded-lg border border-[#164e48]">
              <button
                onClick={() => setDirectionFilter('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  directionFilter === 'all'
                    ? 'bg-[#164e48] text-[#38d4c5] shadow-sm'
                    : 'text-[#7aa5a0] hover:text-white'
                }`}
              >
                All Directions
              </button>
              <button
                onClick={() => setDirectionFilter('inbound')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  directionFilter === 'inbound'
                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                    : 'text-[#7aa5a0] hover:text-white'
                }`}
              >
                Inbound (Customer)
              </button>
              <button
                onClick={() => setDirectionFilter('outbound')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  directionFilter === 'outbound'
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                    : 'text-[#7aa5a0] hover:text-white'
                }`}
              >
                Outbound (Vendor)
              </button>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
              >
                <option value="all">All Lifecycle States</option>
                <option value="in_hand">In-Hand (In Vault)</option>
                <option value="deposited">Deposited (Lodged)</option>
                <option value="cleared">Cleared (Realized)</option>
                <option value="returned">Returned / Bounced</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Branch Filter */}
            {branches.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#7aa5a0] uppercase tracking-wider">Branch:</span>
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="all">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* CSV Export */}
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-[#a0c4c0] transition-colors"
              title="Export filtered records to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>

          {/* Table Container */}
          <div className="bg-[#061e1c]/80 border border-[#164e48] rounded-xl overflow-hidden shadow-sm backdrop-blur-md">
            {loadingCheques ? (
              <div className="p-12 text-center text-[#7aa5a0]">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#38d4c5] mb-2" />
                <p className="text-sm">Loading cheque lifecycle records...</p>
              </div>
            ) : filteredCheques.length === 0 ? (
              <div className="p-12 text-center text-[#7aa5a0]">
                <ArrowRightLeft className="w-10 h-10 mx-auto text-[#164e48] mb-3" />
                <p className="text-base font-semibold text-white">No Cheque Instruments Found</p>
                <p className="text-xs text-[#7aa5a0] mt-1">
                  {search ? 'Try adjusting your search criteria.' : 'Click "Issue / Receive Cheque" to register an instrument.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead className="bg-[#082824] text-[#7aa5a0] text-xs uppercase tracking-wider font-semibold border-b border-[#164e48]">
                    <tr>
                      <th className="px-5 py-3">Cheque No</th>
                      <th className="px-5 py-3">Flow</th>
                      <th className="px-5 py-3">Payee / Payor</th>
                      <th className="px-5 py-3">Bank / Account</th>
                      <th className="px-5 py-3">Issue Date</th>
                      <th className="px-5 py-3">Due Date</th>
                      <th className="px-5 py-3 text-right">Amount (LKR)</th>
                      <th className="px-5 py-3 text-center">Lifecycle Status</th>
                      <th className="px-5 py-3 text-right">Lifecycle Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#164e48]/50 text-[#e2f1ef]">
                    {filteredCheques.map((c) => (
                      <tr key={c.id} className="hover:bg-[#0a2e2a]/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => setPreviewCheque(c)}
                            className="font-mono font-bold text-[#38d4c5] hover:underline flex items-center gap-1.5"
                            title="Click to view authentic cheque leaf slip"
                          >
                            <Eye className="w-3.5 h-3.5 opacity-70" />
                            {c.cheque_number}
                          </button>
                        </td>
                        <td className="px-5 py-3.5">
                          {c.direction === 'inbound' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Inbound
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                              Outbound
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-white max-w-[200px] truncate" title={c.payee_payor_name}>
                          {c.payee_payor_name}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-[#a0c4c0]">
                          <div>{c.bank_account_name || 'No GL Account'}</div>
                          {c.bank_name && (
                            <div className="text-[11px] text-[#7aa5a0]">{c.bank_name}</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-[#7aa5a0] whitespace-nowrap">
                          {c.issue_date}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-white whitespace-nowrap">
                          {c.due_date}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-white whitespace-nowrap">
                          {formatCurrency(c.amount)}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {c.status === 'in_hand' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/30">
                              <Clock className="w-3 h-3 text-amber-400" /> In Hand
                            </span>
                          )}
                          {c.status === 'deposited' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/30">
                              <Send className="w-3 h-3 text-blue-400" /> Deposited
                            </span>
                          )}
                          {c.status === 'cleared' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Cleared
                            </span>
                          )}
                          {c.status === 'returned' && (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-300 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/30 cursor-pointer"
                              title={c.return_reason || 'Bounced / Returned'}
                            >
                              <AlertCircle className="w-3 h-3 text-rose-400" /> Bounced
                            </span>
                          )}
                          {c.status === 'cancelled' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 bg-slate-500/10 px-2.5 py-1 rounded-full border border-slate-500/30">
                              <Ban className="w-3 h-3 text-slate-400" /> Cancelled
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* In-Hand Actions: Deposit, Clear, Bounce */}
                            {c.status === 'in_hand' && (
                              <>
                                <button
                                  onClick={() =>
                                    transitionMutation.mutate({
                                      chequeId: c.id,
                                      newStatus: 'deposited',
                                      depositDate: new Date().toISOString().split('T')[0],
                                    })
                                  }
                                  disabled={transitionMutation.isPending}
                                  className="px-2.5 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded text-xs font-semibold transition-colors"
                                  title="Mark as deposited into bank account"
                                >
                                  Deposit
                                </button>
                                <button
                                  onClick={() =>
                                    transitionMutation.mutate({
                                      chequeId: c.id,
                                      newStatus: 'cleared',
                                      clearDate: new Date().toISOString().split('T')[0],
                                    })
                                  }
                                  disabled={transitionMutation.isPending}
                                  className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded text-xs font-semibold transition-colors"
                                  title="Directly clear cheque"
                                >
                                  Clear
                                </button>
                                <button
                                  onClick={() => setReturnModalCheque(c)}
                                  className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded text-xs font-semibold transition-colors"
                                  title="Record cheque bounce / return"
                                >
                                  Bounce
                                </button>
                              </>
                            )}

                            {/* Deposited Actions: Clear, Bounce */}
                            {c.status === 'deposited' && (
                              <>
                                <button
                                  onClick={() =>
                                    transitionMutation.mutate({
                                      chequeId: c.id,
                                      newStatus: 'cleared',
                                      clearDate: new Date().toISOString().split('T')[0],
                                    })
                                  }
                                  disabled={transitionMutation.isPending}
                                  className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded text-xs font-semibold transition-colors"
                                  title="Confirm cheque has cleared at bank"
                                >
                                  Clear
                                </button>
                                <button
                                  onClick={() => setReturnModalCheque(c)}
                                  className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded text-xs font-semibold transition-colors"
                                  title="Record cheque bounce / return"
                                >
                                  Bounce
                                </button>
                              </>
                            )}

                            {/* View Slip / Preview */}
                            <button
                              onClick={() => setPreviewCheque(c)}
                              className="p-1 text-[#7aa5a0] hover:text-[#38d4c5] hover:bg-[#0c2e2a] rounded transition-colors"
                              title="View Slip"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: CHEQUE BOOKS ──────────────────────────────────────────────── */}
      {activeTab === 'books' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#7aa5a0]">
              Registered cheque books issued by financial institutions for corporate bank accounts.
            </p>
            <button
              onClick={() => setShowBookModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] transition-all shadow-md shadow-[#00b4d8]/20"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Add Cheque Book
            </button>
          </div>

          {loadingBooks ? (
            <div className="p-12 text-center text-[#7aa5a0]">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#38d4c5] mb-2" />
              <p className="text-sm">Loading cheque books...</p>
            </div>
          ) : books.length === 0 ? (
            <div className="p-12 text-center text-[#7aa5a0] bg-[#061e1c]/80 border border-[#164e48] rounded-xl">
              <BookOpen className="w-10 h-10 mx-auto text-[#164e48] mb-3" />
              <p className="text-base font-semibold text-white">No Cheque Books Registered</p>
              <p className="text-xs text-[#7aa5a0] mt-1">
                Register a cheque book to automate cheque leaf sequence tracking.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {books.map((b) => {
                const start = parseInt(b.start_number, 10) || 0
                const current = parseInt(b.current_number, 10) || start
                const end = parseInt(b.end_number, 10) || 0
                const totalLeaves = end >= start ? end - start + 1 : 1
                const usedLeaves = current >= start ? current - start : 0
                const percentUsed = Math.min(100, Math.max(0, Math.round((usedLeaves / totalLeaves) * 100)))

                return (
                  <div
                    key={b.id}
                    className="bg-[#061e1c]/90 border border-[#164e48] rounded-xl p-5 space-y-4 shadow-sm backdrop-blur-md hover:border-[#38d4c5]/40 transition-all relative overflow-hidden"
                  >
                    {/* Decorative leaf spine indicator */}
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#00b4d8]" />

                    <div className="flex items-center justify-between pl-2">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-[#38d4c5]" />
                        <span className="font-bold text-white text-base">Book #{b.book_number}</span>
                      </div>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          b.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : b.status === 'exhausted'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>

                    <div className="pl-2 space-y-1">
                      <div className="text-xs text-[#7aa5a0]">Bank Account</div>
                      <div className="text-sm font-semibold text-white">
                        {b.bank_account_name || 'Main Account'}
                      </div>
                    </div>

                    {/* Leaf numbers grid */}
                    <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-lg bg-[#0a2724] border border-[#164e48]/60 text-xs">
                      <div>
                        <div className="text-[10px] text-[#7aa5a0] uppercase">Start Leaf</div>
                        <div className="font-mono font-bold text-white mt-0.5">{b.start_number}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#7aa5a0] uppercase">Next Leaf</div>
                        <div className="font-mono font-bold text-[#38d4c5] mt-0.5">{b.current_number}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#7aa5a0] uppercase">End Leaf</div>
                        <div className="font-mono font-bold text-white mt-0.5">{b.end_number}</div>
                      </div>
                    </div>

                    {/* Progress Bar of Leaves Used */}
                    <div className="pl-2 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-[#7aa5a0]">
                        <span>Leaves Consumed</span>
                        <span className="font-mono text-white">
                          {usedLeaves} / {totalLeaves} ({percentUsed}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#0a2724] rounded-full overflow-hidden border border-[#164e48]">
                        <div
                          className="h-full bg-gradient-to-r from-[#00b4d8] to-[#38d4c5] rounded-full transition-all"
                          style={{ width: `${percentUsed}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: BANK CARDS ────────────────────────────────────────────────── */}
      {activeTab === 'cards' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#7aa5a0]">
              Authorized corporate debit & credit cards assigned to company personnel and operational branches.
            </p>
            <button
              onClick={() => setShowCardModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] transition-all shadow-md shadow-[#00b4d8]/20"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Register Bank Card
            </button>
          </div>

          {loadingCards ? (
            <div className="p-12 text-center text-[#7aa5a0]">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-[#38d4c5] mb-2" />
              <p className="text-sm">Loading corporate bank cards...</p>
            </div>
          ) : cards.length === 0 ? (
            <div className="p-12 text-center text-[#7aa5a0] bg-[#061e1c]/80 border border-[#164e48] rounded-xl">
              <CreditCard className="w-10 h-10 mx-auto text-[#164e48] mb-3" />
              <p className="text-base font-semibold text-white">No Bank Cards Registered</p>
              <p className="text-xs text-[#7aa5a0] mt-1">
                Register corporate cards for direct POS terminal and fuel payment reconciliations.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cards.map((card) => {
                const isCredit = card.card_type === 'credit'
                return (
                  <div
                    key={card.id}
                    className={`rounded-2xl p-6 relative overflow-hidden shadow-xl border flex flex-col justify-between h-[210px] transition-all hover:scale-[1.02] ${
                      isCredit
                        ? 'bg-gradient-to-br from-[#1b1c2b] via-[#101935] to-[#080d1e] border-indigo-500/30'
                        : 'bg-gradient-to-br from-[#0c2f2b] via-[#09221f] to-[#041211] border-[#164e48]'
                    }`}
                  >
                    {/* Metallic glow shine */}
                    <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-white/5 blur-2xl pointer-events-none" />

                    {/* Top Row: Chip & Type */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* EMV Chip representation */}
                        <div className="w-10 h-7 rounded bg-gradient-to-tr from-amber-400 to-amber-200 border border-amber-500/50 shadow-inner flex items-center justify-center">
                          <div className="w-7 h-4 border border-amber-600/40 rounded-sm grid grid-cols-2 gap-0.5 p-0.5">
                            <div className="border border-amber-700/30 rounded-xs" />
                            <div className="border border-amber-700/30 rounded-xs" />
                          </div>
                        </div>
                        <Radio className="w-4 h-4 text-white/40 rotate-90" />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/10 text-white border border-white/20">
                          {card.card_type}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            card.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {card.status}
                        </span>
                      </div>
                    </div>

                    {/* Middle: Masked Card Number */}
                    <div className="font-mono text-xl tracking-[0.25em] font-semibold text-white/90 drop-shadow-sm my-auto">
                      •••• •••• •••• {card.card_number_last4}
                    </div>

                    {/* Bottom Row: Holder & Expiry */}
                    <div className="flex items-end justify-between pt-2 border-t border-white/10">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-[#7aa5a0]">CARD HOLDER</div>
                        <div className="font-semibold text-xs text-white tracking-wide uppercase">
                          {card.card_holder}
                        </div>
                        <div className="text-[10px] text-[#38d4c5] truncate max-w-[160px]">
                          {card.bank_account_name || 'Bank Account'}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-wider text-[#7aa5a0]">EXPIRES</div>
                        <div className="font-mono text-xs font-semibold text-white">
                          {String(card.expiry_month).padStart(2, '0')}/{String(card.expiry_year).slice(-2)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: ISSUE / RECEIVE CHEQUE ────────────────────────────────────── */}
      {showChequeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#082321] border border-[#164e48] rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl text-[#e2f1ef] my-8">
            <div className="flex items-center justify-between border-b border-[#164e48] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5] border border-[#164e48]">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Issue / Receive Cheque Instrument</h3>
                  <p className="text-xs text-[#7aa5a0]">Record a physical cheque instrument into the company vault</p>
                </div>
              </div>
              <button
                onClick={() => setShowChequeModal(false)}
                className="p-1 rounded-lg text-[#7aa5a0] hover:text-white hover:bg-[#0c2e2a]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Direction */}
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Instrument Direction *</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as 'inbound' | 'outbound')}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="inbound">Inbound (Received from Customer)</option>
                  <option value="outbound">Outbound (Issued to Vendor / Payee)</option>
                </select>
              </div>

              {/* Cheque Number */}
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Cheque Number *</label>
                <input
                  type="text"
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  placeholder="e.g. 100452"
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              {/* Payee / Payor Name */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">
                  {direction === 'inbound' ? 'Drawer / Customer Name *' : 'Payee / Beneficiary Name *'}
                </label>
                <input
                  type="text"
                  value={payeePayor}
                  onChange={(e) => setPayeePayor(e.target.value)}
                  placeholder="e.g. Zenith Global Trading Ltd / John Silva"
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              {/* Bank Name */}
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Drawer / Drawee Bank</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. Commercial Bank / HNB / Sampath"
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Amount (LKR) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={chequeAmount}
                  onChange={(e) => setChequeAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              {/* Issue Date */}
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Issue Date *</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Due Date (Post-Date) *</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              {/* Bank Account */}
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Target Bank Account</label>
                <select
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="">Select Account (Optional)</option>
                  {bankAccounts.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch */}
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Operating Branch</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="">Default Branch</option>
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Reference Notes / Bill Reference</label>
                <input
                  type="text"
                  value={chequeNotes}
                  onChange={(e) => setChequeNotes(e.target.value)}
                  placeholder="e.g. In payment of Invoice #INV-2026-088"
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#164e48]">
              <button
                onClick={() => setShowChequeModal(false)}
                className="px-4 py-2 border border-[#164e48] rounded-lg text-sm font-medium text-[#7aa5a0] hover:bg-[#0c2e2a] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const numAmount = parseFloat(chequeAmount)
                  if (!chequeNo.trim() || !payeePayor.trim() || isNaN(numAmount) || numAmount <= 0) {
                    notify('Please provide valid Cheque Number, Payee/Payor, and positive Amount', true)
                    return
                  }
                  createChequeMutation.mutate({
                    branch_id: branchId || branches[0]?.value || '00000000-0000-0000-0000-000000000000',
                    direction,
                    bank_account_id: bankAccountId || undefined,
                    cheque_number: chequeNo.trim(),
                    payee_payor_name: payeePayor.trim(),
                    bank_name: bankName.trim() || undefined,
                    amount: numAmount,
                    issue_date: issueDate,
                    due_date: dueDate,
                    notes: chequeNotes.trim() || undefined,
                  })
                }}
                disabled={createChequeMutation.isPending}
                className="px-5 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] rounded-lg text-sm font-bold shadow-md shadow-[#00b4d8]/20 disabled:opacity-50"
              >
                {createChequeMutation.isPending ? 'Registering...' : 'Register Cheque'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD CHEQUE BOOK ───────────────────────────────────────────── */}
      {showBookModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#082321] border border-[#164e48] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl text-[#e2f1ef]">
            <div className="flex items-center justify-between border-b border-[#164e48] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5] border border-[#164e48]">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Add New Cheque Book</h3>
                  <p className="text-xs text-[#7aa5a0]">Register a sequence of cheque leaves for a bank account</p>
                </div>
              </div>
              <button
                onClick={() => setShowBookModal(false)}
                className="p-1 rounded-lg text-[#7aa5a0] hover:text-white hover:bg-[#0c2e2a]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Book Number / Series *</label>
                <input
                  type="text"
                  value={bookNo}
                  onChange={(e) => setBookNo(e.target.value)}
                  placeholder="e.g. CB-2026-01 or CB-COMM-01"
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Start Cheque # *</label>
                  <input
                    type="text"
                    value={startNo}
                    onChange={(e) => setStartNo(e.target.value)}
                    placeholder="000101"
                    className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">End Cheque # *</label>
                  <input
                    type="text"
                    value={endNo}
                    onChange={(e) => setEndNo(e.target.value)}
                    placeholder="000150"
                    className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                  />
                </div>
              </div>

              {totalLeavesEstimate > 0 && (
                <div className="p-2.5 rounded-lg bg-[#0a2724] border border-[#164e48] text-xs text-[#38d4c5] flex items-center justify-between">
                  <span>Calculated Leaves:</span>
                  <span className="font-mono font-bold">{totalLeavesEstimate} leaves</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Bank Account *</label>
                <select
                  value={bookBankAccountId}
                  onChange={(e) => setBookBankAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="">Select Account</option>
                  {bankAccounts.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Branch</label>
                <select
                  value={bookBranchId}
                  onChange={(e) => setBookBranchId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="">Default Branch</option>
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#164e48]">
              <button
                onClick={() => setShowBookModal(false)}
                className="px-4 py-2 border border-[#164e48] rounded-lg text-sm font-medium text-[#7aa5a0] hover:bg-[#0c2e2a] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const targetBankId = bookBankAccountId || bankAccounts[0]?.value
                  const targetBranchId = bookBranchId || branches[0]?.value || '00000000-0000-0000-0000-000000000000'
                  if (!bookNo.trim() || !startNo.trim() || !endNo.trim() || !targetBankId) {
                    notify('Please fill in Book #, Start #, End # and select a Bank Account', true)
                    return
                  }
                  createBookMutation.mutate({
                    branch_id: targetBranchId,
                    bank_account_id: targetBankId,
                    book_number: bookNo.trim(),
                    start_number: startNo.trim(),
                    end_number: endNo.trim(),
                  })
                }}
                disabled={createBookMutation.isPending}
                className="px-5 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] rounded-lg text-sm font-bold shadow-md shadow-[#00b4d8]/20 disabled:opacity-50"
              >
                {createBookMutation.isPending ? 'Adding...' : 'Add Cheque Book'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTER BANK CARD ────────────────────────────────────────── */}
      {showCardModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#082321] border border-[#164e48] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl text-[#e2f1ef]">
            <div className="flex items-center justify-between border-b border-[#164e48] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#0a2f2b] text-[#38d4c5] border border-[#164e48]">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Register Corporate Bank Card</h3>
                  <p className="text-xs text-[#7aa5a0]">Link a company debit or credit card to a ledger account</p>
                </div>
              </div>
              <button
                onClick={() => setShowCardModal(false)}
                className="p-1 rounded-lg text-[#7aa5a0] hover:text-white hover:bg-[#0c2e2a]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Card Holder Name *</label>
                <input
                  type="text"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  placeholder="e.g. Managing Director / Operations Card"
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Last 4 Digits *</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={last4}
                    onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))}
                    placeholder="4321"
                    className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Card Type *</label>
                  <select
                    value={cardType}
                    onChange={(e) => setCardType(e.target.value as 'debit' | 'credit')}
                    className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                  >
                    <option value="debit">Debit Card</option>
                    <option value="credit">Credit Card</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Linked Bank Account *</label>
                <select
                  value={cardBankAccountId}
                  onChange={(e) => setCardBankAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="">Select Account</option>
                  {bankAccounts.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Operating Branch</label>
                <select
                  value={cardBranchId}
                  onChange={(e) => setCardBranchId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                >
                  <option value="">Default Branch</option>
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Expiry Month *</label>
                  <select
                    value={expMonth}
                    onChange={(e) => setExpMonth(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#a0c4c0] mb-1.5">Expiry Year *</label>
                  <input
                    type="number"
                    min={2024}
                    max={2040}
                    value={expYear}
                    onChange={(e) => setExpYear(parseInt(e.target.value, 10) || 2026)}
                    className="w-full px-3 py-2 bg-[#0c2e2a] border border-[#164e48] rounded-lg text-sm font-mono text-white focus:outline-none focus:ring-1 focus:ring-[#38d4c5]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#164e48]">
              <button
                onClick={() => setShowCardModal(false)}
                className="px-4 py-2 border border-[#164e48] rounded-lg text-sm font-medium text-[#7aa5a0] hover:bg-[#0c2e2a] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const targetBankId = cardBankAccountId || bankAccounts[0]?.value
                  const targetBranchId = cardBranchId || branches[0]?.value || '00000000-0000-0000-0000-000000000000'
                  if (!cardHolder.trim() || last4.length !== 4 || !targetBankId) {
                    notify('Please provide card holder name, 4-digit last number, and select bank account', true)
                    return
                  }
                  createCardMutation.mutate({
                    branch_id: targetBranchId,
                    bank_account_id: targetBankId,
                    card_holder: cardHolder.trim(),
                    card_number_last4: last4,
                    card_type: cardType,
                    expiry_month: expMonth,
                    expiry_year: expYear,
                  })
                }}
                disabled={createCardMutation.isPending}
                className="px-5 py-2 bg-[#00b4d8] hover:bg-[#0096c7] text-[#031413] rounded-lg text-sm font-bold shadow-md shadow-[#00b4d8]/20 disabled:opacity-50"
              >
                {createCardMutation.isPending ? 'Registering...' : 'Register Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: BOUNCE / RETURN CHEQUE ────────────────────────────────────── */}
      {returnModalCheque && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e0a0f] border border-[#5e1624] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-[#fecdd3]">
            <div className="flex items-center justify-between border-b border-[#5e1624] pb-4">
              <div className="flex items-center gap-2.5 text-[#f43f5e]">
                <AlertCircle className="w-6 h-6" />
                <h3 className="text-lg font-bold text-white">Record Returned / Bounced Cheque</h3>
              </div>
              <button
                onClick={() => setReturnModalCheque(null)}
                className="p-1 rounded-lg text-[#fecdd3]/70 hover:text-white hover:bg-[#341118]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cheque Summary */}
            <div className="p-3 bg-[#2a0e14] border border-[#5e1624] rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-[#fecdd3]/70">Cheque Number:</span>
                <span className="font-mono font-bold text-white">{returnModalCheque.cheque_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#fecdd3]/70">Payee / Payor:</span>
                <span className="font-semibold text-white">{returnModalCheque.payee_payor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#fecdd3]/70">Instrument Value:</span>
                <span className="font-mono font-bold text-[#f43f5e]">
                  LKR {formatCurrency(returnModalCheque.amount)}
                </span>
              </div>
            </div>

            {/* Reason selector / input */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#fecdd3]">
                Reason for Bank Return / Dishonour *
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {COMMON_BOUNCE_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReturnReason(r)}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors border ${
                      returnReason === r
                        ? 'bg-[#5e1624] border-[#f43f5e] text-white font-medium'
                        : 'bg-[#2a0e14] border-[#5e1624]/60 text-[#fecdd3]/80 hover:bg-[#3d131c]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <textarea
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Or specify custom bank return memo..."
                className="w-full px-3 py-2 bg-[#2a0e14] border border-[#5e1624] rounded-lg text-sm text-white placeholder-[#fecdd3]/40 focus:outline-none focus:ring-1 focus:ring-[#f43f5e]"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#5e1624]">
              <button
                onClick={() => setReturnModalCheque(null)}
                className="px-4 py-2 border border-[#5e1624] rounded-lg text-sm font-medium text-[#fecdd3] hover:bg-[#341118]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!returnReason.trim()) {
                    notify('Please select or specify a reason for bounce', true)
                    return
                  }
                  transitionMutation.mutate({
                    chequeId: returnModalCheque.id,
                    newStatus: 'returned',
                    reason: returnReason.trim(),
                  })
                }}
                disabled={transitionMutation.isPending}
                className="px-5 py-2 bg-[#f43f5e] hover:bg-[#e11d48] text-white rounded-lg text-sm font-bold shadow-md shadow-[#f43f5e]/20 disabled:opacity-50"
              >
                {transitionMutation.isPending ? 'Confirming...' : 'Confirm Cheque Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CHEQUE LEAF / SLIP PREVIEW ─────────────────────────────────── */}
      {previewCheque && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#082321] border border-[#164e48] rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl text-[#e2f1ef] my-8">
            <div className="flex items-center justify-between border-b border-[#164e48] pb-3">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-[#38d4c5]" />
                <h3 className="text-lg font-bold text-white">Cheque Instrument Preview</h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#113e3a] text-[#38d4c5]">
                  #{previewCheque.cheque_number}
                </span>
              </div>
              <button
                onClick={() => setPreviewCheque(null)}
                className="p-1 rounded-lg text-[#7aa5a0] hover:text-white hover:bg-[#0c2e2a]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Realistic Physical Cheque Leaf Graphic */}
            <div className="bg-[#fcfbf7] text-[#1c2725] rounded-xl p-6 border-2 border-[#d5cfbe] shadow-inner font-serif relative overflow-hidden">
              {/* Security watermark pattern */}
              <div className="absolute inset-0 bg-[radial-gradient(#e0dacf_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />

              {/* Crossing Lines Top-Left */}
              <div className="absolute top-2 left-6 text-center select-none pointer-events-none">
                <div className="border-t-2 border-b-2 border-slate-700/60 py-0.5 px-3 transform -rotate-12">
                  <span className="text-[10px] font-sans font-bold tracking-widest uppercase text-slate-800">
                    A/C PAYEE ONLY
                  </span>
                </div>
              </div>

              {/* Header: Bank & Date */}
              <div className="flex items-start justify-between relative z-10 mb-4 pl-24">
                <div>
                  <h4 className="text-base font-bold font-sans tracking-wide uppercase text-[#0d3b36]">
                    {previewCheque.bank_name || previewCheque.bank_account_name || 'Commercial Bank of Ceylon'}
                  </h4>
                  <p className="text-[10px] font-sans text-slate-500 uppercase tracking-widest">
                    Corporate Banking Instrument • Sri Lanka
                  </p>
                </div>

                {/* Date boxes */}
                <div className="border border-slate-400 bg-white px-3 py-1 rounded text-right shadow-xs">
                  <div className="text-[9px] font-sans text-slate-400 uppercase tracking-wider">DATE / DUE</div>
                  <div className="font-mono text-sm font-bold text-slate-800 tracking-wider">
                    {previewCheque.due_date}
                  </div>
                </div>
              </div>

              {/* Body: Pay To */}
              <div className="space-y-3 relative z-10 mb-4">
                <div className="flex items-baseline gap-2 border-b border-dashed border-slate-400 pb-1">
                  <span className="font-sans text-xs font-bold uppercase tracking-wider text-slate-600 shrink-0">
                    PAY TO THE ORDER OF:
                  </span>
                  <span className="font-bold text-sm text-slate-900 font-sans tracking-wide flex-1">
                    {previewCheque.payee_payor_name}
                  </span>
                  <span className="font-sans text-xs text-slate-500">OR BEARER</span>
                </div>

                {/* Amount in Words & Amount in Numbers Box */}
                <div className="flex items-center gap-4 border-b border-dashed border-slate-400 pb-1">
                  <div className="flex-1">
                    <span className="font-sans text-[10px] font-bold uppercase text-slate-500 block">
                      RUPEES IN WORDS:
                    </span>
                    <span className="font-bold text-xs text-slate-800 italic">
                      {numberToWords(previewCheque.amount)}
                    </span>
                  </div>

                  <div className="border-2 border-slate-800 bg-white px-3 py-1.5 rounded shadow-sm text-right shrink-0">
                    <span className="font-sans text-[9px] font-bold text-slate-500 block uppercase">LKR</span>
                    <span className="font-mono font-bold text-base text-slate-900 tracking-wider">
                      **{formatCurrency(previewCheque.amount)}**
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom: Signature line & MICR band */}
              <div className="flex items-end justify-between relative z-10 pt-4">
                <div className="text-[10px] font-sans text-slate-500 space-y-0.5">
                  <div>Direction: <span className="font-semibold text-slate-800 uppercase">{previewCheque.direction}</span></div>
                  <div>Issue Date: <span className="font-mono text-slate-700">{previewCheque.issue_date}</span></div>
                </div>

                <div className="text-center">
                  <div className="w-40 border-b border-slate-700 mb-1" />
                  <span className="font-sans text-[10px] text-slate-600 uppercase tracking-wider">
                    AUTHORISED SIGNATORY
                  </span>
                </div>
              </div>

              {/* Simulated MICR Band at bottom of physical leaf */}
              <div className="mt-4 pt-2 border-t border-slate-300 font-mono text-[11px] text-slate-700 tracking-[0.3em] text-center select-none">
                ⑈{previewCheque.cheque_number}⑈ 7010⑆ 0123456789⑈ 01
              </div>
            </div>

            {/* Audit Status Information */}
            <div className="p-3.5 bg-[#0a2724] border border-[#164e48] rounded-xl text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#7aa5a0]">Current Lifecycle Status:</span>
                <span className="font-bold text-white uppercase">{previewCheque.status}</span>
              </div>
              {previewCheque.deposit_date && (
                <div className="flex items-center justify-between">
                  <span className="text-[#7aa5a0]">Lodged / Deposit Date:</span>
                  <span className="font-mono text-white">{previewCheque.deposit_date}</span>
                </div>
              )}
              {previewCheque.clear_date && (
                <div className="flex items-center justify-between">
                  <span className="text-[#7aa5a0]">Cleared / Realized Date:</span>
                  <span className="font-mono text-emerald-400">{previewCheque.clear_date}</span>
                </div>
              )}
              {previewCheque.return_reason && (
                <div className="flex items-center justify-between">
                  <span className="text-rose-300 font-semibold">Dishonour / Return Reason:</span>
                  <span className="text-rose-400 font-medium">{previewCheque.return_reason}</span>
                </div>
              )}
              {previewCheque.notes && (
                <div className="text-[#7aa5a0] pt-1 border-t border-[#164e48]">
                  Note: <span className="text-white">{previewCheque.notes}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setPreviewCheque(null)}
                className="px-4 py-2 bg-[#0c2e2a] hover:bg-[#12423c] border border-[#164e48] text-white rounded-lg text-sm font-semibold"
              >
                Close Slip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export default ChequeRegistryPage
