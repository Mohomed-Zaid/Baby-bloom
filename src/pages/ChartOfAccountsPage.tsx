import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FolderTree,
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Lock,
  X,
  FileSpreadsheet,
} from 'lucide-react'
import {
  fetchChartOfAccounts,
  createChartAccount,
} from '../services/financeService'
import type {
  ChartOfAccount,
  AccountType,
  AccountSubtype,
} from '../types/finance'

export function ChartOfAccountsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  // Add Account form state
  const [accountCode, setAccountCode] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('expense')
  const [accountSubtype, setAccountSubtype] = useState<AccountSubtype>('operating_expense')
  const [normalBalance, setNormalBalance] = useState<'debit' | 'credit'>('debit')
  const [parentId, setParentId] = useState<string>('')

  // Query flat list for parent lookups and tree for display
  const { data: flatAccounts, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['chart-of-accounts', 'flat'],
    queryFn: () => fetchChartOfAccounts(false),
  })

  const { data: accountTree } = useQuery({
    queryKey: ['chart-of-accounts', 'tree'],
    queryFn: () => fetchChartOfAccounts(true),
  })

  const addMutation = useMutation({
    mutationFn: createChartAccount,
    onSuccess: (newAcc) => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] })
      setIsAddModalOpen(false)
      setAccountCode('')
      setAccountName('')
      alert(`Account ${newAcc.account_code} - ${newAcc.account_name} created successfully!`)
    },
    onError: (err: Error) => alert('Failed to create account: ' + err.message),
  })

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Group accounts by main type
  const groupedByType: Record<AccountType, ChartOfAccount[]> = {
    asset: [],
    liability: [],
    equity: [],
    income: [],
    expense: [],
  }

  if (accountTree) {
    accountTree.forEach((acc) => {
      if (groupedByType[acc.account_type]) {
        groupedByType[acc.account_type].push(acc)
      }
    })
  }

  const renderAccountItem = (acc: ChartOfAccount, depth = 0) => {
    const isMatchesSearch =
      search.trim() === '' ||
      acc.account_name.toLowerCase().includes(search.toLowerCase()) ||
      acc.account_code.includes(search)

    const hasChildren = acc.children && acc.children.length > 0
    const isCollapsed = collapsedGroups[acc.id]

    if (!isMatchesSearch && (!acc.children || acc.children.length === 0)) {
      return null
    }

    return (
      <div key={acc.id} className="space-y-1">
        <div
          className={`flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50/80 transition-colors text-xs ${
            depth === 0 ? 'bg-gray-50/50 font-semibold text-gray-900 border border-gray-100' : 'text-gray-700'
          }`}
          style={{ paddingLeft: `${Math.max(10, depth * 22 + 10)}px` }}
        >
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <button
                type="button"
                className="p-1 text-gray-400 hover:text-gray-700 rounded"
                onClick={() => toggleGroup(acc.id)}
              >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : (
              <span className="w-5" />
            )}

            <span className="font-mono text-emerald-800 font-bold w-16">{acc.account_code}</span>
            <span className="font-medium text-gray-900">{acc.account_name}</span>

            {acc.is_system_account && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-normal">
                <Lock size={9} /> System
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {acc.subtype && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium uppercase">
                {acc.subtype.replace(/_/g, ' ')}
              </span>
            )}
            <span
              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                acc.normal_balance === 'debit'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-purple-50 text-purple-700'
              }`}
            >
              {acc.normal_balance}
            </span>
          </div>
        </div>

        {hasChildren && !isCollapsed && (
          <div className="space-y-1">
            {acc.children?.map((child) => renderAccountItem(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <FolderTree className="text-emerald-700" size={28} />
            Chart of Accounts (COA Architecture)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Standard enterprise double-entry accounting hierarchy: Assets, Liabilities, Equity, Incomes & Expenses.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
            disabled={isRefetching}
            onClick={() => refetch()}
          >
            <RefreshCw size={15} className={isRefetching ? 'animate-spin text-emerald-700' : ''} />
            Refresh COA
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
            onClick={() => setIsAddModalOpen(true)}
          >
            <Plus size={16} />
            Add Account
          </button>
        </div>
      </div>

      {/* ── Search Bar ───────────────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            placeholder="Search account by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="text-xs text-gray-500 hidden sm:block">
          Total Registered Accounts: <span className="font-bold text-gray-900">{flatAccounts?.length ?? 0}</span>
        </div>
      </div>

      {/* ── COA Classification Sections ──────────────────────────────────── */}
      {isLoading ? (
        <div className="p-12 text-center text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 shadow-sm">
          Loading chart of accounts tree...
        </div>
      ) : (
        <div className="space-y-6">
          {(
            [
              { type: 'asset', label: '1000 - Assets', badge: 'Debit Balance', color: 'text-blue-700' },
              { type: 'liability', label: '2000 - Liabilities', badge: 'Credit Balance', color: 'text-amber-700' },
              { type: 'equity', label: '3000 - Equity & Retained Earnings', badge: 'Credit Balance', color: 'text-purple-700' },
              { type: 'income', label: '4000 - Incomes & Operating Revenues', badge: 'Credit Balance', color: 'text-emerald-700' },
              { type: 'expense', label: '5000 / 6000 - Expenses & Overheads', badge: 'Debit Balance', color: 'text-rose-700' },
            ] as const
          ).map((section) => {
            const list = groupedByType[section.type] || []
            const isGroupCollapsed = collapsedGroups[section.type]

            return (
              <div
                key={section.type}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-4 bg-gray-50/70 border-b border-gray-100 text-left hover:bg-gray-100/50 transition-colors"
                  onClick={() => toggleGroup(section.type)}
                >
                  <div className="flex items-center gap-2.5">
                    {isGroupCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    <span className={`font-bold text-sm ${section.color}`}>{section.label}</span>
                    <span className="text-xs text-gray-400">({list.length} accounts)</span>
                  </div>

                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 font-medium">
                    Normal: {section.badge}
                  </span>
                </button>

                {!isGroupCollapsed && (
                  <div className="p-4 space-y-1.5">
                    {list.length > 0 ? (
                      list.map((acc) => renderAccountItem(acc, 0))
                    ) : (
                      <div className="text-xs text-gray-400 p-3 italic">No accounts in this category</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── MODAL: Add New Account ───────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden text-gray-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-700">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Add General Ledger Account</h3>
                  <p className="text-xs text-gray-500">Create a new subaccount in the Chart of Accounts</p>
                </div>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
                onClick={() => setIsAddModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Account Code *</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 font-mono focus:ring-2 focus:ring-emerald-600"
                    placeholder="e.g. 5040"
                    value={accountCode}
                    onChange={(e) => setAccountCode(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Account Type *</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800 focus:ring-2 focus:ring-emerald-600"
                    value={accountType}
                    onChange={(e) => {
                      const val = e.target.value as AccountType
                      setAccountType(val)
                      setNormalBalance(val === 'asset' || val === 'expense' ? 'debit' : 'credit')
                    }}
                  >
                    <option value="asset">Asset (1000)</option>
                    <option value="liability">Liability (2000)</option>
                    <option value="equity">Equity (3000)</option>
                    <option value="income">Income (4000)</option>
                    <option value="expense">Expense (5000/6000)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Account Name *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white text-gray-900 focus:ring-2 focus:ring-emerald-600"
                  placeholder="e.g. Marketing & Advertising Expense"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Subtype</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800"
                    value={accountSubtype}
                    onChange={(e) => setAccountSubtype(e.target.value as AccountSubtype)}
                  >
                    <option value="operating_expense">Operating Expense</option>
                    <option value="admin_expense">Admin Expense</option>
                    <option value="direct_income">Direct Income</option>
                    <option value="indirect_income">Indirect Income</option>
                    <option value="cash">Cash Account</option>
                    <option value="bank">Bank Account</option>
                    <option value="accounts_receivable">Accounts Receivable</option>
                    <option value="accounts_payable">Accounts Payable</option>
                    <option value="inventory">Inventory Asset</option>
                    <option value="retained_earnings">Retained Earnings</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Normal Balance</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800 uppercase font-semibold"
                    value={normalBalance}
                    onChange={(e) => setNormalBalance(e.target.value as 'debit' | 'credit')}
                  >
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Parent Account (Optional)</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white text-gray-800"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">-- No Parent (Root Category) --</option>
                  {flatAccounts
                    ?.filter((a) => a.account_type === accountType)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.account_code} - {a.account_name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                onClick={() => setIsAddModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                disabled={addMutation.isPending || !accountCode.trim() || !accountName.trim()}
                onClick={() =>
                  addMutation.mutate({
                    account_code: accountCode.trim(),
                    account_name: accountName.trim(),
                    account_type: accountType,
                    subtype: accountSubtype,
                    normal_balance: normalBalance,
                    parent_account_id: parentId || null,
                  })
                }
              >
                {addMutation.isPending ? 'Saving...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
