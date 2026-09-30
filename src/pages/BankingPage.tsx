import React, { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Building2,
  CreditCard,
  GitBranch,
  Star,
  RefreshCw,
  X,
  AlertTriangle,
} from 'lucide-react'
import {
  listBanksPaginated,
  createBank,
  updateBank,
  deleteBank,
  toggleBankStatus,
  listBankBranchesPaginated,
  createBankBranch,
  updateBankBranch,
  deleteBankBranch,
  toggleBankBranchStatus,
  listBankAccountsPaginated,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  toggleBankAccountStatus,
  setDefaultBankAccount,
  listBanks,
  listBankBranches,
  listBranchesForBanking,
  type BankRow,
  type BankBranchRow,
  type BankAccountRow,
  type BankingBranchOption,
  type CreateBankInput,
  type CreateBankBranchInput,
  type CreateBankAccountInput,
} from '../services/banks'
import { listChartOfAccounts } from '../services/chartOfAccounts'
import type { Bank, BankBranch, ChartOfAccount } from '../types/domain'
import { getErrorMessage } from '../lib/errors'

type BankingTab = 'accounts' | 'banks' | 'branches'

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0)
}

export const BankingPage: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── Tab Management ──────────────────────────────────────────────────────────
  const activeTab: BankingTab = useMemo(() => {
    if (location.pathname.startsWith('/banks')) return 'banks'
    if (location.pathname.startsWith('/bank-branches')) return 'branches'
    return 'accounts'
  }, [location.pathname])

  const handleTabChange = (tab: BankingTab) => {
    if (tab === 'banks') navigate('/banks')
    else if (tab === 'branches') navigate('/bank-branches')
    else navigate('/bank-accounts')
  }

  // ── Global Toast ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Common Filter States ───────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [selectedBankFilter, setSelectedBankFilter] = useState<string>('')
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const pageSize = 12

  // Reset page & filters when switching tabs
  useEffect(() => {
    setSearchTerm('')
    setAppliedSearch('')
    setPage(1)
  }, [activeTab])

  // ── Lookups for dropdowns ──────────────────────────────────────────────────
  const { data: allBanks = [] } = useQuery<Bank[]>({
    queryKey: ['lookup-all-banks'],
    queryFn: () => listBanks(false),
  })

  const { data: storeBranches = [] } = useQuery<BankingBranchOption[]>({
    queryKey: ['lookup-store-branches'],
    queryFn: () => listBranchesForBanking(),
  })

  const { data: chartOfAccountsList = [] } = useQuery<ChartOfAccount[]>({
    queryKey: ['lookup-chart-of-accounts'],
    queryFn: () => listChartOfAccounts(),
  })

  // ── TAB 1: BANK ACCOUNTS ───────────────────────────────────────────────────
  const accountsQuery = useQuery({
    queryKey: [
      'bank-accounts-paginated',
      appliedSearch,
      statusFilter,
      selectedBankFilter,
      selectedBranchFilter,
      page,
    ],
    queryFn: () =>
      listBankAccountsPaginated({
        search: appliedSearch || undefined,
        status: statusFilter,
        bankId: selectedBankFilter || undefined,
        branchId: selectedBranchFilter || undefined,
        page,
        pageSize,
      }),
    enabled: activeTab === 'accounts',
  })

  // ── TAB 2: BANKS MASTER ────────────────────────────────────────────────────
  const banksQuery = useQuery({
    queryKey: ['banks-paginated', appliedSearch, statusFilter, page],
    queryFn: () =>
      listBanksPaginated({
        search: appliedSearch || undefined,
        status: statusFilter,
        page,
        pageSize,
      }),
    enabled: activeTab === 'banks',
  })

  // ── TAB 3: BANK BRANCHES ───────────────────────────────────────────────────
  const branchesQuery = useQuery({
    queryKey: ['bank-branches-paginated', appliedSearch, statusFilter, selectedBankFilter, page],
    queryFn: () =>
      listBankBranchesPaginated({
        search: appliedSearch || undefined,
        status: statusFilter,
        bankId: selectedBankFilter || undefined,
        page,
        pageSize,
      }),
    enabled: activeTab === 'branches',
  })

  // ── Modal States ───────────────────────────────────────────────────────────
  // Bank Account Modal
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccountRow | null>(null)
  const [accountFormData, setAccountFormData] = useState<CreateBankAccountInput>({
    branch_id: '',
    bank_id: '',
    bank_branch_id: '',
    account_name: '',
    account_number: '',
    account_kind: 'Current',
    opening_balance: 0,
    ledger_account_id: '',
    is_default: false,
    is_active: true,
  })

  // Cascading bank branches for modal
  const { data: modalBankBranches = [] } = useQuery<BankBranch[]>({
    queryKey: ['modal-bank-branches', accountFormData.bank_id],
    queryFn: () => (accountFormData.bank_id ? listBankBranches(accountFormData.bank_id, false) : []),
    enabled: Boolean(accountFormData.bank_id),
  })

  // Bank Modal
  const [bankModalOpen, setBankModalOpen] = useState(false)
  const [editingBank, setEditingBank] = useState<BankRow | null>(null)
  const [bankFormData, setBankFormData] = useState<CreateBankInput>({
    bank_code: '',
    name: '',
    is_active: true,
  })

  // Bank Branch Modal
  const [branchModalOpen, setBranchModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<BankBranchRow | null>(null)
  const [branchFormData, setBranchFormData] = useState<CreateBankBranchInput>({
    bank_id: '',
    branch_code: '',
    name: '',
    address: '',
    phone: '',
    is_active: true,
  })

  const [modalError, setModalError] = useState<string | null>(null)

  // ── Bank Account Mutations ─────────────────────────────────────────────────
  const saveAccountMutation = useMutation({
    mutationFn: async () => {
      if (!accountFormData.branch_id) throw new Error('Please select a business store branch.')
      if (!accountFormData.bank_id) throw new Error('Please select a bank.')
      if (!accountFormData.account_name.trim()) throw new Error('Account name is required.')
      if (!accountFormData.account_number.trim()) throw new Error('Account number is required.')

      if (editingAccount) {
        return updateBankAccount(editingAccount.id, accountFormData)
      } else {
        return createBankAccount(accountFormData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts-paginated'] })
      queryClient.invalidateQueries({ queryKey: ['lookup', 'bank-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['lookup-all-banks'] })
      notify(editingAccount ? 'Bank account updated successfully!' : 'Bank account created successfully!')
      setAccountModalOpen(false)
      setEditingAccount(null)
    },
    onError: (err) => {
      setModalError(getErrorMessage(err))
    },
  })

  const toggleAccountMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      toggleBankAccountStatus(id, is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts-paginated'] })
      notify('Account status toggled.')
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  const setDefaultAccountMutation = useMutation({
    mutationFn: ({ id, branch_id }: { id: string; branch_id: string }) =>
      setDefaultBankAccount(id, branch_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts-paginated'] })
      notify('Default POS settlement account updated.')
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  const deleteAccountMutation = useMutation({
    mutationFn: (id: string) => deleteBankAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-accounts-paginated'] })
      notify('Bank account removed.')
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  // ── Bank Master Mutations ──────────────────────────────────────────────────
  const saveBankMutation = useMutation({
    mutationFn: async () => {
      if (!bankFormData.bank_code.trim()) throw new Error('Bank Code is required (e.g. COMB).')
      if (!bankFormData.name.trim()) throw new Error('Bank Name is required.')

      if (editingBank) {
        return updateBank(editingBank.id, bankFormData)
      } else {
        return createBank(bankFormData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks-paginated'] })
      queryClient.invalidateQueries({ queryKey: ['lookup-all-banks'] })
      notify(editingBank ? 'Bank details updated!' : 'New bank registered!')
      setBankModalOpen(false)
      setEditingBank(null)
    },
    onError: (err) => {
      setModalError(getErrorMessage(err))
    },
  })

  const toggleBankMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      toggleBankStatus(id, is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks-paginated'] })
      queryClient.invalidateQueries({ queryKey: ['lookup-all-banks'] })
      notify('Bank status updated.')
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  const deleteBankMutation = useMutation({
    mutationFn: (id: string) => deleteBank(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banks-paginated'] })
      queryClient.invalidateQueries({ queryKey: ['lookup-all-banks'] })
      notify('Bank deleted successfully.')
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  // ── Bank Branch Mutations ──────────────────────────────────────────────────
  const saveBranchMutation = useMutation({
    mutationFn: async () => {
      if (!branchFormData.bank_id) throw new Error('Please select a bank.')
      if (!branchFormData.branch_code.trim()) throw new Error('Branch code is required (e.g. COL-01).')
      if (!branchFormData.name.trim()) throw new Error('Branch name is required.')

      if (editingBranch) {
        return updateBankBranch(editingBranch.id, branchFormData)
      } else {
        return createBankBranch(branchFormData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-branches-paginated'] })
      queryClient.invalidateQueries({ queryKey: ['modal-bank-branches'] })
      notify(editingBranch ? 'Branch updated successfully!' : 'New branch created!')
      setBranchModalOpen(false)
      setEditingBranch(null)
    },
    onError: (err) => {
      setModalError(getErrorMessage(err))
    },
  })

  const toggleBranchMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      toggleBankBranchStatus(id, is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-branches-paginated'] })
      notify('Branch status updated.')
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  const deleteBranchMutation = useMutation({
    mutationFn: (id: string) => deleteBankBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-branches-paginated'] })
      notify('Bank branch removed.')
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  // ── Handlers to Open Modals ────────────────────────────────────────────────
  const openCreateAccountModal = () => {
    setEditingAccount(null)
    setModalError(null)
    setAccountFormData({
      branch_id: storeBranches[0]?.id || '',
      bank_id: allBanks[0]?.id || '',
      bank_branch_id: '',
      account_name: '',
      account_number: '',
      account_kind: 'Current',
      opening_balance: 0,
      ledger_account_id: '',
      is_default: false,
      is_active: true,
    })
    setAccountModalOpen(true)
  }

  const openEditAccountModal = (account: BankAccountRow) => {
    setEditingAccount(account)
    setModalError(null)
    setAccountFormData({
      branch_id: account.branch_id || '',
      bank_id: account.bank_id || '',
      bank_branch_id: account.bank_branch_id || '',
      account_name: account.account_name || '',
      account_number: account.account_number || '',
      account_kind: account.account_kind || 'Current',
      opening_balance: Number(account.opening_balance || 0),
      ledger_account_id: account.ledger_account_id || '',
      is_default: Boolean(account.is_default),
      is_active: account.is_active !== false,
    })
    setAccountModalOpen(true)
  }

  const openCreateBankModal = () => {
    setEditingBank(null)
    setModalError(null)
    setBankFormData({
      bank_code: '',
      name: '',
      is_active: true,
    })
    setBankModalOpen(true)
  }

  const openEditBankModal = (bank: BankRow) => {
    setEditingBank(bank)
    setModalError(null)
    setBankFormData({
      bank_code: bank.bank_code || '',
      name: bank.name || '',
      is_active: bank.is_active !== false,
    })
    setBankModalOpen(true)
  }

  const openCreateBranchModal = () => {
    setEditingBranch(null)
    setModalError(null)
    setBranchFormData({
      bank_id: selectedBankFilter || allBanks[0]?.id || '',
      branch_code: '',
      name: '',
      address: '',
      phone: '',
      is_active: true,
    })
    setBranchModalOpen(true)
  }

  const openEditBranchModal = (branch: BankBranchRow) => {
    setEditingBranch(branch)
    setModalError(null)
    setBranchFormData({
      bank_id: branch.bank_id || '',
      branch_code: branch.branch_code || '',
      name: branch.name || '',
      address: branch.address || '',
      phone: branch.phone || '',
      is_active: branch.is_active !== false,
    })
    setBranchModalOpen(true)
  }

  // ── Calculation of Quick KPIs ──────────────────────────────────────────────
  const accountsTotalCount = accountsQuery.data?.count ?? 0
  const banksTotalCount = banksQuery.data?.count ?? 0
  const branchesTotalCount = branchesQuery.data?.count ?? 0

  const activeAccountsCount = useMemo(
    () => (accountsQuery.data?.rows ?? []).filter((a) => a.is_active).length,
    [accountsQuery.data?.rows]
  )
  const defaultAccountsCount = useMemo(
    () => (accountsQuery.data?.rows ?? []).filter((a) => a.is_default).length,
    [accountsQuery.data?.rows]
  )
  const totalOpeningDeposit = useMemo(
    () => (accountsQuery.data?.rows ?? []).reduce((sum, a) => sum + Number(a.opening_balance || 0), 0),
    [accountsQuery.data?.rows]
  )

  return (
    <div
      style={{
        background: 'radial-gradient(circle at 50% 20%, #0e3b37 0%, #082321 55%, #031413 100%)',
        minHeight: 'calc(100vh - 80px)',
        color: '#e2e8f0',
        padding: '20px 24px',
        borderRadius: '8px',
        boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* ── Top Header & Tab Switcher ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 800,
              letterSpacing: '-0.01em',
              color: '#ffffff',
            }}
          >
            Banking Details
          </h2>
          <div style={{ marginTop: '12px' }}>
            {activeTab === 'accounts' && (
              <button
                type="button"
                onClick={openCreateAccountModal}
                style={{
                  backgroundColor: '#00b4d8',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 22px',
                  fontSize: '12px',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
              >
                ADD BANK ACCOUNT
              </button>
            )}
            {activeTab === 'banks' && (
              <button
                type="button"
                onClick={openCreateBankModal}
                style={{
                  backgroundColor: '#00b4d8',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 22px',
                  fontSize: '12px',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
              >
                ADD BANK
              </button>
            )}
            {activeTab === 'branches' && (
              <button
                type="button"
                onClick={openCreateBranchModal}
                style={{
                  backgroundColor: '#00b4d8',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 22px',
                  fontSize: '12px',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
              >
                ADD BANK BRANCH
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid #144743',
          paddingBottom: '12px',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          onClick={() => handleTabChange('accounts')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeTab === 'accounts' ? '1px solid #38d4c5' : '1px solid transparent',
            backgroundColor: activeTab === 'accounts' ? '#0b3531' : '#041c19',
            color: activeTab === 'accounts' ? '#38d4c5' : '#94a3b8',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <CreditCard size={16} />
          <span>Bank Accounts</span>
          {activeTab === 'accounts' && (
            <span
              style={{
                backgroundColor: '#144743',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '11px',
              }}
            >
              {accountsTotalCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('banks')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeTab === 'banks' ? '1px solid #38d4c5' : '1px solid transparent',
            backgroundColor: activeTab === 'banks' ? '#0b3531' : '#041c19',
            color: activeTab === 'banks' ? '#38d4c5' : '#94a3b8',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Building2 size={16} />
          <span>Banks Master</span>
          {activeTab === 'banks' && (
            <span
              style={{
                backgroundColor: '#144743',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '11px',
              }}
            >
              {banksTotalCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('branches')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeTab === 'branches' ? '1px solid #38d4c5' : '1px solid transparent',
            backgroundColor: activeTab === 'branches' ? '#0b3531' : '#041c19',
            color: activeTab === 'branches' ? '#38d4c5' : '#94a3b8',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <GitBranch size={16} />
          <span>Bank Branches</span>
          {activeTab === 'branches' && (
            <span
              style={{
                backgroundColor: '#144743',
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '11px',
              }}
            >
              {branchesTotalCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Top Metric KPI Cards ────────────────────────────────────────────── */}
      {activeTab === 'accounts' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '6px',
              padding: '14px 18px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>
              TOTAL BANK ACCOUNTS
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
              {accountsTotalCount}
            </div>
            <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
              {activeAccountsCount} Active accounts in use
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '6px',
              padding: '14px 18px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>
              DEFAULT POS SETTLEMENT
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
              {defaultAccountsCount}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              Primary card/online POS accounts
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '6px',
              padding: '14px 18px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>
              TOTAL OPENING BALANCES
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#38d4c5', marginTop: '4px' }}>
              Rs. {formatCurrency(totalOpeningDeposit)}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              Cumulative recorded opening capital
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '6px',
              padding: '14px 18px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>
              REGISTERED BANKS
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#00d2ff', marginTop: '4px' }}>
              {allBanks.length}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              Supported clearing banks
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Banner ────────────────────────────────────────────────────── */}
      {toast && (
        <div
          style={{
            backgroundColor: toast.isError ? '#7f1d1d' : '#064e3b',
            border: `1px solid ${toast.isError ? '#ef4444' : '#10b981'}`,
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Toolbar: Search & Filters ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          backgroundColor: '#041c19',
          border: '1px solid #144743',
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', flex: 1 }}>
          {/* Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              overflow: 'hidden',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <input
              type="text"
              placeholder={
                activeTab === 'accounts'
                  ? 'Search account name or number...'
                  : activeTab === 'banks'
                  ? 'Search bank code or name...'
                  : 'Search branch code, name, phone...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setAppliedSearch(searchTerm)
                  setPage(1)
                }
              }}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#ffffff',
                padding: '8px 14px',
                fontSize: '13px',
                width: '260px',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => {
                setAppliedSearch(searchTerm)
                setPage(1)
              }}
              style={{
                backgroundColor: '#13443e',
                border: 'none',
                color: '#94a3b8',
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Search size={15} />
            </button>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              color: '#ffffff',
              border: '1px solid #164e48',
              borderRadius: '4px',
              padding: '8px 14px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="active" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Active Only</option>
            <option value="all" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Statuses</option>
            <option value="inactive" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Inactive Only</option>
          </select>

          {/* Bank Filter (for Accounts & Branches) */}
          {(activeTab === 'accounts' || activeTab === 'branches') && (
            <select
              value={selectedBankFilter}
              onChange={(e) => {
                setSelectedBankFilter(e.target.value)
                setPage(1)
              }}
              style={{
                backgroundColor: '#0c2e2a',
                color: '#ffffff',
                border: '1px solid #164e48',
                borderRadius: '4px',
                padding: '8px 14px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
            >
              <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Banks</option>
              {allBanks.map((b) => (
                <option key={b.id} value={b.id} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                  {b.bank_code} - {b.name}
                </option>
              ))}
            </select>
          )}

          {/* Store Branch Filter (for Accounts) */}
          {activeTab === 'accounts' && (
            <select
              value={selectedBranchFilter}
              onChange={(e) => {
                setSelectedBranchFilter(e.target.value)
                setPage(1)
              }}
              style={{
                backgroundColor: '#0c2e2a',
                color: '#ffffff',
                border: '1px solid #164e48',
                borderRadius: '4px',
                padding: '8px 14px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
            >
              <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Store Outlets</option>
              {storeBranches.map((br) => (
                <option key={br.id} value={br.id} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                  {br.name} {br.is_head_office ? '(HQ)' : ''}
                </option>
              ))}
            </select>
          )}

          {/* Clear Filters */}
          {(appliedSearch || statusFilter !== 'active' || selectedBankFilter || selectedBranchFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('')
                setAppliedSearch('')
                setStatusFilter('active')
                setSelectedBankFilter('')
                setSelectedBranchFilter('')
                setPage(1)
              }}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #144743',
                color: '#94a3b8',
                borderRadius: '4px',
                padding: '7px 12px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => {
            if (activeTab === 'accounts') accountsQuery.refetch()
            else if (activeTab === 'banks') banksQuery.refetch()
            else branchesQuery.refetch()
          }}
          title="Refresh table"
          style={{
            backgroundColor: '#031413',
            border: '1px solid #144743',
            color: '#94a3b8',
            borderRadius: '4px',
            padding: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* ── TAB 1 CONTENT: BANK ACCOUNTS TABLE ────────────────────────────────── */}
      {activeTab === 'accounts' && (
        <div
          style={{
            border: '1px solid #144743',
            borderRadius: '6px',
            overflow: 'hidden',
            backgroundColor: '#041c19',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid #144743',
                  backgroundColor: '#031413',
                  color: '#38d4c5',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  fontSize: '11px',
                }}
              >
                <th style={{ padding: '12px 14px' }}>ACCOUNT NAME / TYPE</th>
                <th style={{ padding: '12px 14px' }}>ACCOUNT NUMBER</th>
                <th style={{ padding: '12px 14px' }}>BANK & BRANCH</th>
                <th style={{ padding: '12px 14px' }}>STORE OUTLET</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>OPENING BALANCE</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '130px' }}>POS DEFAULT</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '90px' }}>STATUS</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '120px' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {accountsQuery.isLoading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    Loading bank accounts...
                  </td>
                </tr>
              ) : (accountsQuery.data?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    No bank accounts found matching criteria.{' '}
                    <button
                      type="button"
                      onClick={openCreateAccountModal}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#38d4c5',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Create one now
                    </button>
                  </td>
                </tr>
              ) : (
                (accountsQuery.data?.rows ?? []).map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid #0d3834',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#072723')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Account Name */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '13px' }}>
                        {row.account_name}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                        {row.account_kind || 'Current Account'}
                      </div>
                    </td>

                    {/* Account Number */}
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          color: '#00d2ff',
                          backgroundColor: '#031413',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: '1px solid #144743',
                          fontSize: '12px',
                        }}
                      >
                        {row.account_number}
                      </span>
                    </td>

                    {/* Bank & Branch */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#e2e8f0' }}>
                        {row.bank_name}{' '}
                        {row.bank_code && (
                          <span style={{ color: '#38d4c5', fontSize: '11px', fontWeight: 700 }}>
                            ({row.bank_code})
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                        Branch: {row.bank_branch_name || 'General Branch'}
                      </div>
                    </td>

                    {/* Store Outlet */}
                    <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                      {row.branch_name || 'All Outlets'}
                    </td>

                    {/* Opening Balance */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#ffffff' }}>
                      Rs. {formatCurrency(Number(row.opening_balance || 0))}
                    </td>

                    {/* POS Default */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      {row.is_default ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: '#78350f',
                            color: '#fbbf24',
                            border: '1px solid #d97706',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          <Star size={11} fill="#fbbf24" /> Default
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDefaultAccountMutation.mutate({ id: row.id, branch_id: row.branch_id })}
                          title="Set as POS settlement default for this branch"
                          style={{
                            backgroundColor: 'transparent',
                            border: '1px solid #144743',
                            color: '#94a3b8',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Set Default
                        </button>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          backgroundColor: row.is_active ? '#064e3b' : '#334155',
                          color: row.is_active ? '#34d399' : '#94a3b8',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {row.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => openEditAccountModal(row)}
                          title="Edit Account"
                          style={{
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            color: '#38d4c5',
                            padding: '5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <Edit2 size={13} />
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleAccountMutation.mutate({ id: row.id, is_active: row.is_active })}
                          title={row.is_active ? 'Deactivate' : 'Activate'}
                          style={{
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            color: row.is_active ? '#eab308' : '#10b981',
                            padding: '5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          {row.is_active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to remove bank account "${row.account_name}"?`)) {
                              deleteAccountMutation.mutate(row.id)
                            }
                          }}
                          title="Delete Account"
                          style={{
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            color: '#ef4444',
                            padding: '5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#031413',
              borderTop: '1px solid #144743',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#94a3b8',
            }}
          >
            <div>
              Showing {accountsQuery.data?.rows.length || 0} of {accountsTotalCount} accounts
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  backgroundColor: '#0d3834',
                  color: page <= 1 ? '#64748b' : '#ffffff',
                  border: '1px solid #144743',
                  borderRadius: '4px',
                  padding: '5px 12px',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, Math.ceil(accountsTotalCount / pageSize))}
              </span>
              <button
                type="button"
                disabled={page >= Math.ceil(accountsTotalCount / pageSize)}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  backgroundColor: '#0d3834',
                  color: page >= Math.ceil(accountsTotalCount / pageSize) ? '#64748b' : '#ffffff',
                  border: '1px solid #144743',
                  borderRadius: '4px',
                  padding: '5px 12px',
                  cursor: page >= Math.ceil(accountsTotalCount / pageSize) ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2 CONTENT: BANKS MASTER TABLE ─────────────────────────────────── */}
      {activeTab === 'banks' && (
        <div
          style={{
            border: '1px solid #144743',
            borderRadius: '6px',
            overflow: 'hidden',
            backgroundColor: '#041c19',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid #144743',
                  backgroundColor: '#031413',
                  color: '#38d4c5',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  fontSize: '11px',
                }}
              >
                <th style={{ padding: '12px 14px', width: '120px' }}>BANK CODE</th>
                <th style={{ padding: '12px 14px' }}>BANK NAME</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '140px' }}>BRANCHES COUNT</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '140px' }}>ACCOUNTS LINKED</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '100px' }}>STATUS</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '120px' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {banksQuery.isLoading ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    Loading registered banks...
                  </td>
                </tr>
              ) : (banksQuery.data?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    No banks registered.{' '}
                    <button
                      type="button"
                      onClick={openCreateBankModal}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#38d4c5',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Register a bank
                    </button>
                  </td>
                </tr>
              ) : (
                (banksQuery.data?.rows ?? []).map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid #0d3834',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#072723')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Bank Code */}
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          backgroundColor: '#0d3834',
                          color: '#38d4c5',
                          border: '1px solid #144743',
                          fontWeight: 800,
                          fontSize: '12px',
                          letterSpacing: '0.05em',
                          padding: '3px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        {row.bank_code}
                      </span>
                    </td>

                    {/* Bank Name */}
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#ffffff', fontSize: '13px' }}>
                      {row.name}
                    </td>

                    {/* Branches Count */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBankFilter(row.id)
                          handleTabChange('branches')
                        }}
                        style={{
                          backgroundColor: '#031413',
                          border: '1px solid #144743',
                          color: '#00d2ff',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {row.branches_count || 0} Branches →
                      </button>
                    </td>

                    {/* Accounts Linked */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBankFilter(row.id)
                          handleTabChange('accounts')
                        }}
                        style={{
                          backgroundColor: '#031413',
                          border: '1px solid #144743',
                          color: '#38d4c5',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {row.accounts_count || 0} Accounts →
                      </button>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          backgroundColor: row.is_active ? '#064e3b' : '#334155',
                          color: row.is_active ? '#34d399' : '#94a3b8',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {row.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => openEditBankModal(row)}
                          title="Edit Bank"
                          style={{
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            color: '#38d4c5',
                            padding: '5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <Edit2 size={13} />
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleBankMutation.mutate({ id: row.id, is_active: row.is_active })}
                          title={row.is_active ? 'Deactivate' : 'Activate'}
                          style={{
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            color: row.is_active ? '#eab308' : '#10b981',
                            padding: '5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          {row.is_active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete bank "${row.name}"?`)) {
                              deleteBankMutation.mutate(row.id)
                            }
                          }}
                          title="Delete Bank"
                          style={{
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            color: '#ef4444',
                            padding: '5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#031413',
              borderTop: '1px solid #144743',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#94a3b8',
            }}
          >
            <div>
              Showing {banksQuery.data?.rows.length || 0} of {banksTotalCount} banks
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  backgroundColor: '#0d3834',
                  color: page <= 1 ? '#64748b' : '#ffffff',
                  border: '1px solid #144743',
                  borderRadius: '4px',
                  padding: '5px 12px',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, Math.ceil(banksTotalCount / pageSize))}
              </span>
              <button
                type="button"
                disabled={page >= Math.ceil(banksTotalCount / pageSize)}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  backgroundColor: '#0d3834',
                  color: page >= Math.ceil(banksTotalCount / pageSize) ? '#64748b' : '#ffffff',
                  border: '1px solid #144743',
                  borderRadius: '4px',
                  padding: '5px 12px',
                  cursor: page >= Math.ceil(banksTotalCount / pageSize) ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3 CONTENT: BANK BRANCHES TABLE ─────────────────────────────────── */}
      {activeTab === 'branches' && (
        <div
          style={{
            border: '1px solid #144743',
            borderRadius: '6px',
            overflow: 'hidden',
            backgroundColor: '#041c19',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid #144743',
                  backgroundColor: '#031413',
                  color: '#38d4c5',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  fontSize: '11px',
                }}
              >
                <th style={{ padding: '12px 14px', width: '120px' }}>BRANCH CODE</th>
                <th style={{ padding: '12px 14px' }}>BRANCH NAME</th>
                <th style={{ padding: '12px 14px' }}>PARENT BANK</th>
                <th style={{ padding: '12px 14px', width: '150px' }}>PHONE</th>
                <th style={{ padding: '12px 14px' }}>ADDRESS</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '100px' }}>STATUS</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', width: '120px' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {branchesQuery.isLoading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    Loading bank branches...
                  </td>
                </tr>
              ) : (branchesQuery.data?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    No bank branches found.{' '}
                    <button
                      type="button"
                      onClick={openCreateBranchModal}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#38d4c5',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Add a branch
                    </button>
                  </td>
                </tr>
              ) : (
                (branchesQuery.data?.rows ?? []).map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid #0d3834',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#072723')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* Branch Code */}
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          backgroundColor: '#031413',
                          color: '#00d2ff',
                          border: '1px solid #144743',
                          fontWeight: 700,
                          fontSize: '11px',
                          letterSpacing: '0.05em',
                          padding: '3px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        {row.branch_code}
                      </span>
                    </td>

                    {/* Branch Name */}
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#ffffff', fontSize: '13px' }}>
                      {row.name}
                    </td>

                    {/* Parent Bank */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ color: '#38d4c5', fontWeight: 600 }}>{row.bank_name}</span>{' '}
                      {row.bank_code && (
                        <span style={{ color: '#94a3b8', fontSize: '11px' }}>({row.bank_code})</span>
                      )}
                    </td>

                    {/* Phone */}
                    <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>{row.phone || '—'}</td>

                    {/* Address */}
                    <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{row.address || '—'}</td>

                    {/* Status */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          backgroundColor: row.is_active ? '#064e3b' : '#334155',
                          color: row.is_active ? '#34d399' : '#94a3b8',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {row.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => openEditBranchModal(row)}
                          title="Edit Branch"
                          style={{
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            color: '#38d4c5',
                            padding: '5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <Edit2 size={13} />
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleBranchMutation.mutate({ id: row.id, is_active: row.is_active })}
                          title={row.is_active ? 'Deactivate' : 'Activate'}
                          style={{
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            color: row.is_active ? '#eab308' : '#10b981',
                            padding: '5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          {row.is_active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete branch "${row.name}"?`)) {
                              deleteBranchMutation.mutate(row.id)
                            }
                          }}
                          title="Delete Branch"
                          style={{
                            backgroundColor: '#031413',
                            border: '1px solid #144743',
                            color: '#ef4444',
                            padding: '5px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#031413',
              borderTop: '1px solid #144743',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#94a3b8',
            }}
          >
            <div>
              Showing {branchesQuery.data?.rows.length || 0} of {branchesTotalCount} branches
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  backgroundColor: '#0d3834',
                  color: page <= 1 ? '#64748b' : '#ffffff',
                  border: '1px solid #144743',
                  borderRadius: '4px',
                  padding: '5px 12px',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, Math.ceil(branchesTotalCount / pageSize))}
              </span>
              <button
                type="button"
                disabled={page >= Math.ceil(branchesTotalCount / pageSize)}
                onClick={() => setPage((p) => p + 1)}
                style={{
                  backgroundColor: '#0d3834',
                  color: page >= Math.ceil(branchesTotalCount / pageSize) ? '#64748b' : '#ffffff',
                  border: '1px solid #144743',
                  borderRadius: '4px',
                  padding: '5px 12px',
                  cursor: page >= Math.ceil(branchesTotalCount / pageSize) ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 1: ADD / EDIT BANK ACCOUNT ──────────────────────────────────── */}
      {accountModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #144743',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#031413',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CreditCard size={20} color="#38d4c5" />
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                  {editingAccount ? 'Edit Bank Account' : 'Register New Bank Account'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAccountModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                saveAccountMutation.mutate()
              }}
              style={{ padding: '20px' }}
            >
              {modalError && (
                <div
                  style={{
                    backgroundColor: '#7f1d1d',
                    border: '1px solid #ef4444',
                    color: '#ffffff',
                    padding: '10px 14px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertTriangle size={15} />
                  <span>{modalError}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Account Name */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    ACCOUNT NAME *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main Operating Account - Colombo"
                    value={accountFormData.account_name}
                    onChange={(e) => setAccountFormData({ ...accountFormData, account_name: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Account Number */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    ACCOUNT NUMBER *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 800392817201"
                    value={accountFormData.account_number}
                    onChange={(e) => setAccountFormData({ ...accountFormData, account_number: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Account Kind */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    ACCOUNT KIND / TYPE
                  </label>
                  <select
                    value={accountFormData.account_kind || 'Current'}
                    onChange={(e) => setAccountFormData({ ...accountFormData, account_kind: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="Current">Current Account</option>
                    <option value="Savings">Savings Account</option>
                    <option value="Fixed Deposit">Fixed Deposit Account</option>
                    <option value="Overdraft">Overdraft Account</option>
                    <option value="Merchant Settlement">Merchant Settlement Account</option>
                    <option value="Special Deposit">Special Deposit Account</option>
                  </select>
                </div>

                {/* Bank Select */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    BANK INSTITUTION *
                  </label>
                  <select
                    required
                    value={accountFormData.bank_id}
                    onChange={(e) =>
                      setAccountFormData({
                        ...accountFormData,
                        bank_id: e.target.value,
                        bank_branch_id: '', // reset branch when bank changes
                      })
                    }
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">-- Select Bank --</option>
                    {allBanks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_code} - {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bank Branch Select (Cascading) */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    BANK BRANCH
                  </label>
                  <select
                    value={accountFormData.bank_branch_id || ''}
                    disabled={!accountFormData.bank_id}
                    onChange={(e) => setAccountFormData({ ...accountFormData, bank_branch_id: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      opacity: accountFormData.bank_id ? 1 : 0.6,
                    }}
                  >
                    <option value="">-- General / Main Branch --</option>
                    {modalBankBranches.map((br) => (
                      <option key={br.id} value={br.id}>
                        {br.branch_code ? `[${br.branch_code}] ` : ''}{br.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Store / Business Branch */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    STORE / OUTLET BRANCH *
                  </label>
                  <select
                    required
                    value={accountFormData.branch_id}
                    onChange={(e) => setAccountFormData({ ...accountFormData, branch_id: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">-- Select Store Outlet --</option>
                    {storeBranches.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} {st.is_head_office ? '(HQ / Main Office)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Opening Balance */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    OPENING BALANCE (LKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={accountFormData.opening_balance}
                    onChange={(e) => setAccountFormData({ ...accountFormData, opening_balance: parseFloat(e.target.value) || 0 })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Chart of Accounts Link */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                    CHART OF ACCOUNTS SUB-LEDGER LINK (OPTIONAL)
                  </label>
                  <select
                    value={accountFormData.ledger_account_id || ''}
                    onChange={(e) => setAccountFormData({ ...accountFormData, ledger_account_id: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">-- No Direct GL Mapping (Auto Assigned) --</option>
                    {chartOfAccountsList.map((gl) => (
                      <option key={gl.id} value={gl.id}>
                        [{gl.account_code}] {gl.account_name} ({gl.account_type})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Checkboxes */}
                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(accountFormData.is_default)}
                      onChange={(e) => setAccountFormData({ ...accountFormData, is_default: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                    />
                    <span style={{ color: '#ffffff', fontWeight: 600 }}>
                      Set as primary default account for card & electronic settlements at this store branch
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(accountFormData.is_active)}
                      onChange={(e) => setAccountFormData({ ...accountFormData, is_active: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                    />
                    <span style={{ color: '#ffffff' }}>Account is Active and permitted for transactions</span>
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  marginTop: '24px',
                  paddingTop: '16px',
                  borderTop: '1px solid #144743',
                }}
              >
                <button
                  type="button"
                  onClick={() => setAccountModalOpen(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #144743',
                    color: '#94a3b8',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveAccountMutation.isPending}
                  style={{
                    backgroundColor: '#00b4d8',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 22px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    cursor: saveAccountMutation.isPending ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
                >
                  {saveAccountMutation.isPending ? 'SAVING...' : editingAccount ? 'UPDATE ACCOUNT' : 'SAVE ACCOUNT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: ADD / EDIT BANK ─────────────────────────────────────────── */}
      {bankModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #144743',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#031413',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Building2 size={20} color="#38d4c5" />
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                  {editingBank ? 'Edit Bank Details' : 'Register New Bank'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setBankModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                saveBankMutation.mutate()
              }}
              style={{ padding: '20px' }}
            >
              {modalError && (
                <div
                  style={{
                    backgroundColor: '#7f1d1d',
                    border: '1px solid #ef4444',
                    color: '#ffffff',
                    padding: '10px 14px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertTriangle size={15} />
                  <span>{modalError}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    BANK CODE * (e.g. COMB, BOC, HNB, SAMP)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="COMB"
                    maxLength={10}
                    value={bankFormData.bank_code}
                    onChange={(e) => setBankFormData({ ...bankFormData, bank_code: e.target.value.toUpperCase() })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '14px',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    BANK NAME *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Commercial Bank of Ceylon PLC"
                    value={bankFormData.name}
                    onChange={(e) => setBankFormData({ ...bankFormData, name: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(bankFormData.is_active)}
                      onChange={(e) => setBankFormData({ ...bankFormData, is_active: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                    />
                    <span style={{ color: '#ffffff' }}>Bank institution is active</span>
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  marginTop: '24px',
                  paddingTop: '16px',
                  borderTop: '1px solid #144743',
                }}
              >
                <button
                  type="button"
                  onClick={() => setBankModalOpen(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #144743',
                    color: '#94a3b8',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveBankMutation.isPending}
                  style={{
                    backgroundColor: '#00b4d8',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 22px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    cursor: saveBankMutation.isPending ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
                >
                  {saveBankMutation.isPending ? 'SAVING...' : editingBank ? 'UPDATE BANK' : 'SAVE BANK'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: ADD / EDIT BANK BRANCH ──────────────────────────────────── */}
      {branchModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #144743',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#031413',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <GitBranch size={20} color="#00d2ff" />
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                  {editingBranch ? 'Edit Bank Branch' : 'Add Bank Branch'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setBranchModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                saveBranchMutation.mutate()
              }}
              style={{ padding: '20px' }}
            >
              {modalError && (
                <div
                  style={{
                    backgroundColor: '#7f1d1d',
                    border: '1px solid #ef4444',
                    color: '#ffffff',
                    padding: '10px 14px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertTriangle size={15} />
                  <span>{modalError}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Select Bank */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#00d2ff', marginBottom: '6px' }}>
                    PARENT BANK *
                  </label>
                  <select
                    required
                    value={branchFormData.bank_id}
                    onChange={(e) => setBranchFormData({ ...branchFormData, bank_id: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">-- Select Bank --</option>
                    {allBanks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_code} - {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Branch Code */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#00d2ff', marginBottom: '6px' }}>
                    BRANCH CODE * (e.g. COL-01, KDY, GAL)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="COL-01"
                    maxLength={15}
                    value={branchFormData.branch_code}
                    onChange={(e) => setBranchFormData({ ...branchFormData, branch_code: e.target.value.toUpperCase() })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Branch Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#00d2ff', marginBottom: '6px' }}>
                    BRANCH NAME *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kollupitiya Super Branch"
                    value={branchFormData.name}
                    onChange={(e) => setBranchFormData({ ...branchFormData, name: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Phone */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                    PHONE NUMBER
                  </label>
                  <input
                    type="text"
                    placeholder="011-2345678"
                    value={branchFormData.phone || ''}
                    onChange={(e) => setBranchFormData({ ...branchFormData, phone: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Address */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                    BRANCH ADDRESS
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 450 Galle Road, Colombo 03"
                    value={branchFormData.address || ''}
                    onChange={(e) => setBranchFormData({ ...branchFormData, address: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(branchFormData.is_active)}
                      onChange={(e) => setBranchFormData({ ...branchFormData, is_active: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                    />
                    <span style={{ color: '#ffffff' }}>Branch is operational & active</span>
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  marginTop: '24px',
                  paddingTop: '16px',
                  borderTop: '1px solid #144743',
                }}
              >
                <button
                  type="button"
                  onClick={() => setBranchModalOpen(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #144743',
                    color: '#94a3b8',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveBranchMutation.isPending}
                  style={{
                    backgroundColor: '#00b4d8',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 22px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    cursor: saveBranchMutation.isPending ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
                >
                  {saveBranchMutation.isPending ? 'SAVING...' : editingBranch ? 'UPDATE BRANCH' : 'SAVE BRANCH'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
