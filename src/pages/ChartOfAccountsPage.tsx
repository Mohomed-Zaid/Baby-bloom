import React, { useState, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Lock,
  X,
  FileSpreadsheet,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Layers,
  List,
  GitFork,
  Sliders,
  BookOpen,
  AlertTriangle,
  Check,
} from 'lucide-react'
import {
  listChartOfAccounts,
  createChartAccount,
  updateChartAccount,
  toggleChartAccountStatus,
  deleteChartAccount,
  listAccountMappings,
  saveAccountMapping,
  fetchAccountLedgerDetails,
  type ChartOfAccountNode,
  type CreateChartAccountInput,
  type AccountMappingRow,
  type AccountLedgerEntry,
} from '../services/chartOfAccounts'
import type { ChartOfAccount, AccountType, NormalBalance } from '../types/domain'
import { getErrorMessage } from '../lib/errors'

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0)
}

export const ChartOfAccountsPage: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── Tab Management ──────────────────────────────────────────────────────────
  const activeTab: 'accounts' | 'mappings' = useMemo(() => {
    if (location.pathname.startsWith('/account-mappings')) return 'mappings'
    return 'accounts'
  }, [location.pathname])

  const handleTabChange = (tab: 'accounts' | 'mappings') => {
    if (tab === 'mappings') navigate('/account-mappings')
    else navigate('/chart-of-accounts')
  }

  // ── Global Toast ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // ── State for Filter & Display Mode ─────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<AccountType | 'all'>('all')
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  // Flat view pagination
  const [flatPage, setFlatPage] = useState(1)
  const flatPageSize = 15

  // ── Modals State ───────────────────────────────────────────────────────────
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null)
  const [accountFormData, setAccountFormData] = useState<CreateChartAccountInput>({
    account_code: '',
    account_name: '',
    account_type: 'expense',
    subtype: 'operating_expense',
    normal_balance: 'debit',
    parent_account_id: '',
    is_control_account: false,
    allow_manual_entries: true,
    is_active: true,
  })
  const [modalError, setModalError] = useState<string | null>(null)

  // Ledger audit drawer/modal
  const [ledgerModalAccount, setLedgerModalAccount] = useState<ChartOfAccount | null>(null)

  // ── Queries ─────────────────────────────────────────────────────────────────
  // Query flat list (for parent lookups & flat table)
  const flatAccountsQuery = useQuery<ChartOfAccountNode[]>({
    queryKey: ['chart-of-accounts', 'flat'],
    queryFn: () => listChartOfAccounts({ buildTree: false }),
  })

  // Query hierarchical tree
  const treeAccountsQuery = useQuery<ChartOfAccountNode[]>({
    queryKey: ['chart-of-accounts', 'tree'],
    queryFn: () => listChartOfAccounts({ buildTree: true }),
  })

  // Query system account mappings
  const mappingsQuery = useQuery<AccountMappingRow[]>({
    queryKey: ['account-mappings'],
    queryFn: () => listAccountMappings(),
  })

  // Query ledger entries for selected account
  const ledgerEntriesQuery = useQuery<AccountLedgerEntry[]>({
    queryKey: ['account-ledger-entries', ledgerModalAccount?.id],
    queryFn: () => (ledgerModalAccount ? fetchAccountLedgerDetails(ledgerModalAccount.id) : []),
    enabled: Boolean(ledgerModalAccount),
  })

  const flatList = flatAccountsQuery.data ?? []
  const treeList = treeAccountsQuery.data ?? []
  const mappingsList = mappingsQuery.data ?? []

  // ── Mutations ───────────────────────────────────────────────────────────────
  const saveAccountMutation = useMutation({
    mutationFn: async () => {
      if (editingAccount) {
        return updateChartAccount(editingAccount.id, accountFormData)
      } else {
        return createChartAccount(accountFormData)
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account-mappings'] })
      queryClient.invalidateQueries({ queryKey: ['lookup-chart-of-accounts'] })
      notify(
        editingAccount
          ? `Account ${saved.account_code} updated successfully!`
          : `Account ${saved.account_code} - ${saved.account_name} created!`
      )
      setAccountModalOpen(false)
      setEditingAccount(null)
    },
    onError: (err) => setModalError(getErrorMessage(err)),
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      toggleChartAccountStatus(id, is_active),
    onSuccess: (acc) => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] })
      notify(`Account ${acc.account_code} is now ${acc.is_active ? 'Active' : 'Inactive'}.`)
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  const deleteAccountMutation = useMutation({
    mutationFn: (id: string) => deleteChartAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['account-mappings'] })
      notify('Account removed from Chart of Accounts.')
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  const saveMappingMutation = useMutation({
    mutationFn: ({ mapping_key, account_id }: { mapping_key: string; account_id: string }) =>
      saveAccountMapping(mapping_key, account_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-mappings'] })
      notify('System posting destination updated.')
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  // ── Modal Open Handlers ─────────────────────────────────────────────────────
  const openCreateAccountModal = (parentId?: string, parentType?: AccountType) => {
    setEditingAccount(null)
    setModalError(null)
    const initialType = parentType || 'expense'
    setAccountFormData({
      account_code: '',
      account_name: '',
      account_type: initialType,
      subtype: initialType === 'asset' ? 'cash' : 'operating_expense',
      normal_balance: initialType === 'asset' || initialType === 'expense' || initialType === 'cost_of_sales' ? 'debit' : 'credit',
      parent_account_id: parentId || '',
      is_control_account: false,
      allow_manual_entries: true,
      is_active: true,
    })
    setAccountModalOpen(true)
  }

  const openEditAccountModal = (acc: ChartOfAccount) => {
    setEditingAccount(acc)
    setModalError(null)
    setAccountFormData({
      account_code: acc.account_code,
      account_name: acc.account_name,
      account_type: acc.account_type,
      subtype: (acc as any).subtype || null,
      normal_balance: acc.normal_balance,
      parent_account_id: acc.parent_account_id || '',
      is_control_account: Boolean(acc.is_control_account),
      allow_manual_entries: acc.allow_manual_entries !== false,
      is_active: acc.is_active !== false,
    })
    setAccountModalOpen(true)
  }

  // ── Tree Toggle Logic ───────────────────────────────────────────────────────
  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const expandAll = () => setCollapsedGroups({})
  const collapseAll = () => {
    const allCollapsed: Record<string, boolean> = {
      asset: true,
      liability: true,
      equity: true,
      income: true,
      expense: true,
      cost_of_sales: true,
    }
    flatList.forEach((a) => {
      allCollapsed[a.id] = true
    })
    setCollapsedGroups(allCollapsed)
  }

  // Group accounts by major accounting division
  const groupedByType: Record<AccountType, ChartOfAccountNode[]> = {
    asset: [],
    liability: [],
    equity: [],
    income: [],
    expense: [],
    cost_of_sales: [],
  }

  treeList.forEach((acc) => {
    if (groupedByType[acc.account_type]) {
      groupedByType[acc.account_type].push(acc)
    }
  })

  // ── Filtered Flat List ─────────────────────────────────────────────────────
  const filteredFlatList = useMemo(() => {
    return flatList.filter((a) => {
      const matchesSearch =
        !search.trim() ||
        a.account_name.toLowerCase().includes(search.toLowerCase()) ||
        a.account_code.toLowerCase().includes(search.toLowerCase())

      const matchesType = typeFilter === 'all' || a.account_type === typeFilter

      return matchesSearch && matchesType
    })
  }, [flatList, search, typeFilter])

  const paginatedFlatList = useMemo(() => {
    const from = (flatPage - 1) * flatPageSize
    return filteredFlatList.slice(from, from + flatPageSize)
  }, [filteredFlatList, flatPage])

  // ── KPI Metrics Calculations ────────────────────────────────────────────────
  const activeCount = useMemo(() => flatList.filter((a) => a.is_active).length, [flatList])
  const assetCount = useMemo(() => flatList.filter((a) => a.account_type === 'asset').length, [flatList])
  const liabilityEquityCount = useMemo(
    () => flatList.filter((a) => a.account_type === 'liability' || a.account_type === 'equity').length,
    [flatList]
  )
  const incomeExpenseCount = useMemo(
    () =>
      flatList.filter(
        (a) =>
          a.account_type === 'income' ||
          a.account_type === 'expense' ||
          a.account_type === 'cost_of_sales'
      ).length,
    [flatList]
  )
  const configuredMappingsCount = useMemo(
    () => mappingsList.filter((m) => Boolean(m.account_id)).length,
    [mappingsList]
  )

  // ── Recursive Tree Item Renderer ───────────────────────────────────────────
  const renderTreeItem = (node: ChartOfAccountNode, depth = 0) => {
    const isMatchesSearch =
      !search.trim() ||
      node.account_name.toLowerCase().includes(search.toLowerCase()) ||
      node.account_code.toLowerCase().includes(search.toLowerCase())

    const hasChildren = Boolean(node.children && node.children.length > 0)
    const isCollapsed = Boolean(collapsedGroups[node.id])

    // Hide if filtering and doesn't match search, unless child matches
    if (!isMatchesSearch && (!node.children || node.children.length === 0)) {
      return null
    }

    return (
      <div key={node.id} style={{ marginBottom: '4px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            paddingLeft: `${Math.max(12, depth * 24 + 12)}px`,
            borderRadius: '6px',
            backgroundColor: depth === 0 ? '#062925' : '#031a17',
            border: depth === 0 ? '1px solid #144743' : '1px solid #0d3834',
            transition: 'background-color 0.15s ease',
            fontSize: '12px',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0b3531')}
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = depth === 0 ? '#062925' : '#031a17')
          }
        >
          {/* Left: Code, Name, Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleGroup(node.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38d4c5',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              </button>
            ) : (
              <span style={{ width: '15px' }} />
            )}

            {/* Account Code Badge */}
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 800,
                color: '#38d4c5',
                backgroundColor: '#031413',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid #144743',
                fontSize: '12px',
              }}
            >
              {node.account_code}
            </span>

            {/* Account Name */}
            <span
              style={{
                fontWeight: depth === 0 ? 700 : 500,
                color: node.is_active ? '#ffffff' : '#94a3b8',
                fontSize: '13px',
                textDecoration: node.is_active ? 'none' : 'line-through',
              }}
            >
              {node.account_name}
            </span>

            {/* Badges */}
            {node.is_system_account && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '10px',
                  fontWeight: 700,
                  backgroundColor: '#1e293b',
                  color: '#94a3b8',
                  padding: '2px 6px',
                  borderRadius: '10px',
                }}
              >
                <Lock size={9} /> System
              </span>
            )}

            {node.is_control_account && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  backgroundColor: '#0c4a6e',
                  color: '#38bdf8',
                  padding: '2px 6px',
                  borderRadius: '10px',
                }}
              >
                Control
              </span>
            )}
          </div>

          {/* Right: Subtype, Normal Balance, Status & Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Normal Balance Badge */}
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                textTransform: 'uppercase',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: node.normal_balance === 'debit' ? '#082f49' : '#3b0764',
                color: node.normal_balance === 'debit' ? '#38bdf8' : '#c084fc',
                border: `1px solid ${node.normal_balance === 'debit' ? '#0284c7' : '#9333ea'}`,
              }}
            >
              {node.normal_balance}
            </span>

            {/* Status Badge */}
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: node.is_active ? '#064e3b' : '#334155',
                color: node.is_active ? '#34d399' : '#94a3b8',
              }}
            >
              {node.is_active ? 'Active' : 'Inactive'}
            </span>

            {/* Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
              {/* Add Child Sub-Account */}
              <button
                type="button"
                onClick={() => openCreateAccountModal(node.id, node.account_type)}
                title="Add Sub-Account under this account"
                style={{
                  backgroundColor: '#031413',
                  border: '1px solid #144743',
                  color: '#38d4c5',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <Plus size={11} />
                <span>Sub</span>
              </button>

              {/* View Ledger Entries */}
              <button
                type="button"
                onClick={() => setLedgerModalAccount(node)}
                title="View recent transactions / ledger entries"
                style={{
                  backgroundColor: '#031413',
                  border: '1px solid #144743',
                  color: '#00d2ff',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <BookOpen size={12} />
              </button>

              {/* Edit Account */}
              <button
                type="button"
                onClick={() => openEditAccountModal(node)}
                title="Edit Account"
                style={{
                  backgroundColor: '#031413',
                  border: '1px solid #144743',
                  color: '#f59e0b',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Edit2 size={12} />
              </button>

              {/* Toggle Status */}
              <button
                type="button"
                onClick={() => toggleStatusMutation.mutate({ id: node.id, is_active: node.is_active })}
                title={node.is_active ? 'Deactivate' : 'Activate'}
                style={{
                  backgroundColor: '#031413',
                  border: '1px solid #144743',
                  color: node.is_active ? '#eab308' : '#10b981',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {node.is_active ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
              </button>

              {/* Delete Account */}
              {!node.is_system_account && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Are you sure you want to delete account "${node.account_code} - ${node.account_name}"?`
                      )
                    ) {
                      deleteAccountMutation.mutate(node.id)
                    }
                  }}
                  title="Delete Account"
                  style={{
                    backgroundColor: '#031413',
                    border: '1px solid #144743',
                    color: '#ef4444',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Children Render */}
        {hasChildren && !isCollapsed && (
          <div style={{ marginLeft: '12px', borderLeft: '1px dashed #144743', paddingLeft: '8px', marginTop: '4px' }}>
            {node.children?.map((child) => renderTreeItem(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

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
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
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
            Chart of Accounts Details
          </h2>
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => openCreateAccountModal()}
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
              ADD ACCOUNT
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => {
              flatAccountsQuery.refetch()
              treeAccountsQuery.refetch()
              mappingsQuery.refetch()
            }}
            title="Refresh accounts"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              color: '#94a3b8',
              borderRadius: '4px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <RefreshCw
              size={15}
              className={flatAccountsQuery.isFetching ? 'animate-spin' : ''}
              color="#38d4c5"
            />
            <span>Refresh</span>
          </button>
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
          <Layers size={16} />
          <span>Chart of Accounts</span>
          <span
            style={{
              backgroundColor: '#144743',
              color: '#ffffff',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '11px',
            }}
          >
            {flatList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('mappings')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '6px',
            border: activeTab === 'mappings' ? '1px solid #38d4c5' : '1px solid transparent',
            backgroundColor: activeTab === 'mappings' ? '#0b3531' : '#041c19',
            color: activeTab === 'mappings' ? '#38d4c5' : '#94a3b8',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Sliders size={16} />
          <span>System Account Mappings</span>
          <span
            style={{
              backgroundColor: configuredMappingsCount === 15 ? '#064e3b' : '#78350f',
              color: configuredMappingsCount === 15 ? '#34d399' : '#fbbf24',
              padding: '2px 8px',
              borderRadius: '10px',
              fontSize: '11px',
              fontWeight: 800,
            }}
          >
            {configuredMappingsCount} / 15 Configured
          </span>
        </button>
      </div>

      {/* ── Top Metric KPI Cards ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
            TOTAL REGISTERED ACCOUNTS
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
            {flatList.length}
          </div>
          <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
            {activeCount} Active operational accounts
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
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.05em' }}>
            ASSETS (1000s)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
            {assetCount}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Cash, Banks, Receivables & Inventory
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
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#c084fc', letterSpacing: '0.05em' }}>
            LIABILITIES & EQUITY (2000s & 3000s)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#c084fc', marginTop: '4px' }}>
            {liabilityEquityCount}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Trade Creditors, Advances & Capital
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
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#34d399', letterSpacing: '0.05em' }}>
            INCOME & EXPENSES (4000s to 6000s)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>
            {incomeExpenseCount}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Turnover, COGS & Operating Costs
          </div>
        </div>
      </div>

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

      {/* ── TAB 1 CONTENT: CHART OF ACCOUNTS (TREE & TABLE) ───────────────────── */}
      {activeTab === 'accounts' && (
        <div>
          {/* Toolbar */}
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
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
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
                  placeholder="Search code or account name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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
                <div
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#13443e',
                    color: '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Search size={15} />
                </div>
              </div>

              {/* Account Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as AccountType | 'all')
                  setFlatPage(1)
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
                <option value="all" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Account Classes</option>
                <option value="asset" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>1000 - Assets</option>
                <option value="liability" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>2000 - Liabilities</option>
                <option value="equity" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>3000 - Equity</option>
                <option value="income" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>4000 - Incomes</option>
                <option value="cost_of_sales" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>5000 - Cost of Sales</option>
                <option value="expense" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>6000 - Operating Expenses</option>
              </select>

              {/* Tree controls */}
              {viewMode === 'tree' && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={expandAll}
                    style={{
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      color: '#38d4c5',
                      padding: '7px 12px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    style={{
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      color: '#94a3b8',
                      padding: '7px 12px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Collapse All
                  </button>
                </div>
              )}
            </div>

            {/* View Mode Toggle: Tree vs Table */}
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#031413', border: '1px solid #144743', borderRadius: '4px' }}>
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: viewMode === 'tree' ? '#0d3834' : 'transparent',
                  color: viewMode === 'tree' ? '#38d4c5' : '#94a3b8',
                  border: 'none',
                  padding: '7px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <GitFork size={14} />
                <span>Tree Hierarchy</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('flat')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: viewMode === 'flat' ? '#0d3834' : 'transparent',
                  color: viewMode === 'flat' ? '#38d4c5' : '#94a3b8',
                  border: 'none',
                  padding: '7px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <List size={14} />
                <span>Flat Table</span>
              </button>
            </div>
          </div>

          {/* TREE VIEW */}
          {viewMode === 'tree' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(
                [
                  {
                    type: 'asset' as AccountType,
                    label: '1000 - ASSETS',
                    badge: 'Debit Balance',
                    badgeBg: '#082f49',
                    badgeColor: '#38bdf8',
                  },
                  {
                    type: 'liability' as AccountType,
                    label: '2000 - LIABILITIES',
                    badge: 'Credit Balance',
                    badgeBg: '#451a03',
                    badgeColor: '#fbbf24',
                  },
                  {
                    type: 'equity' as AccountType,
                    label: '3000 - EQUITY & RESERVES',
                    badge: 'Credit Balance',
                    badgeBg: '#3b0764',
                    badgeColor: '#c084fc',
                  },
                  {
                    type: 'income' as AccountType,
                    label: '4000 - INCOMES & OPERATING REVENUES',
                    badge: 'Credit Balance',
                    badgeBg: '#064e3b',
                    badgeColor: '#34d399',
                  },
                  {
                    type: 'cost_of_sales' as AccountType,
                    label: '5000 - COST OF SALES (COGS)',
                    badge: 'Debit Balance',
                    badgeBg: '#4c0519',
                    badgeColor: '#fb7185',
                  },
                  {
                    type: 'expense' as AccountType,
                    label: '6000 - OPERATING EXPENSES & OVERHEADS',
                    badge: 'Debit Balance',
                    badgeBg: '#4c0519',
                    badgeColor: '#fb7185',
                  },
                ]
              )
                .filter((s) => typeFilter === 'all' || s.type === typeFilter)
                .map((section) => {
                  const list = groupedByType[section.type] || []
                  const isGroupCollapsed = Boolean(collapsedGroups[section.type])

                  return (
                    <div
                      key={section.type}
                      style={{
                        backgroundColor: '#041c19',
                        border: '1px solid #144743',
                        borderRadius: '6px',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Section Category Header */}
                      <button
                        type="button"
                        onClick={() => toggleGroup(section.type)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          backgroundColor: '#031413',
                          border: 'none',
                          borderBottom: isGroupCollapsed ? 'none' : '1px solid #144743',
                          cursor: 'pointer',
                          color: '#ffffff',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isGroupCollapsed ? (
                            <ChevronRight size={18} color="#38d4c5" />
                          ) : (
                            <ChevronDown size={18} color="#38d4c5" />
                          )}
                          <span style={{ fontWeight: 800, fontSize: '13px', letterSpacing: '0.05em' }}>
                            {section.label}
                          </span>
                          <span
                            style={{
                              backgroundColor: '#0d3834',
                              color: '#38d4c5',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              fontWeight: 700,
                            }}
                          >
                            {list.length} Top Accounts
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: section.badgeBg,
                              color: section.badgeColor,
                            }}
                          >
                            Normal: {section.badge}
                          </span>
                        </div>
                      </button>

                      {/* Section Accounts Tree Body */}
                      {!isGroupCollapsed && (
                        <div style={{ padding: '12px' }}>
                          {list.length > 0 ? (
                            list.map((acc) => renderTreeItem(acc, 0))
                          ) : (
                            <div style={{ padding: '16px', color: '#94a3b8', fontSize: '12px', fontStyle: 'italic' }}>
                              No accounts in this category.{' '}
                              <button
                                type="button"
                                onClick={() => openCreateAccountModal(undefined, section.type)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#38d4c5',
                                  textDecoration: 'underline',
                                  cursor: 'pointer',
                                }}
                              >
                                Create the first account
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          )}

          {/* FLAT TABLE VIEW */}
          {viewMode === 'flat' && (
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
                    <th style={{ padding: '12px 14px', width: '100px' }}>CODE</th>
                    <th style={{ padding: '12px 14px' }}>ACCOUNT NAME</th>
                    <th style={{ padding: '12px 14px', width: '130px' }}>ACCOUNT TYPE</th>
                    <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>NORMAL</th>
                    <th style={{ padding: '12px 14px', width: '160px' }}>PARENT ACCOUNT</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', width: '80px' }}>CONTROL</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', width: '90px' }}>STATUS</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center', width: '130px' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {flatAccountsQuery.isLoading ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        Loading chart of accounts...
                      </td>
                    </tr>
                  ) : paginatedFlatList.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                        No ledger accounts found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedFlatList.map((row) => (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom: '1px solid #0d3834',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#072723')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              color: '#38d4c5',
                              backgroundColor: '#031413',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              border: '1px solid #144743',
                            }}
                          >
                            {row.account_code}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>{row.account_name}</div>
                          {row.is_system_account && (
                            <span style={{ fontSize: '10px', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Lock size={9} /> Core System
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textTransform: 'capitalize', color: '#cbd5e1' }}>
                          {row.account_type.replace(/_/g, ' ')}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: row.normal_balance === 'debit' ? '#082f49' : '#3b0764',
                              color: row.normal_balance === 'debit' ? '#38bdf8' : '#c084fc',
                            }}
                          >
                            {row.normal_balance}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: '11px' }}>
                          {row.parent_name ? `[${row.parent_code}] ${row.parent_name}` : '— Root —'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {row.is_control_account ? (
                            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '11px' }}>Yes</span>
                          ) : (
                            <span style={{ color: '#64748b' }}>No</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '12px',
                              backgroundColor: row.is_active ? '#064e3b' : '#334155',
                              color: row.is_active ? '#34d399' : '#94a3b8',
                            }}
                          >
                            {row.is_active ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                            <button
                              type="button"
                              onClick={() => setLedgerModalAccount(row)}
                              title="Audit Ledger Entries"
                              style={{
                                backgroundColor: '#031413',
                                border: '1px solid #144743',
                                color: '#00d2ff',
                                padding: '4px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              <BookOpen size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditAccountModal(row)}
                              title="Edit Account"
                              style={{
                                backgroundColor: '#031413',
                                border: '1px solid #144743',
                                color: '#f59e0b',
                                padding: '4px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleStatusMutation.mutate({ id: row.id, is_active: row.is_active })}
                              title={row.is_active ? 'Deactivate' : 'Activate'}
                              style={{
                                backgroundColor: '#031413',
                                border: '1px solid #144743',
                                color: row.is_active ? '#eab308' : '#10b981',
                                padding: '4px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              {row.is_active ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
                            </button>
                            {!row.is_system_account && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Are you sure you want to delete account "${row.account_code} - ${row.account_name}"?`
                                    )
                                  ) {
                                    deleteAccountMutation.mutate(row.id)
                                  }
                                }}
                                title="Delete Account"
                                style={{
                                  backgroundColor: '#031413',
                                  border: '1px solid #144743',
                                  color: '#ef4444',
                                  padding: '4px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Flat Table Pagination */}
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
                  Showing {paginatedFlatList.length} of {filteredFlatList.length} filtered accounts
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    disabled={flatPage <= 1}
                    onClick={() => setFlatPage((p) => Math.max(1, p - 1))}
                    style={{
                      backgroundColor: '#0d3834',
                      color: flatPage <= 1 ? '#64748b' : '#ffffff',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      padding: '5px 12px',
                      cursor: flatPage <= 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Previous
                  </button>
                  <span>
                    Page {flatPage} of {Math.max(1, Math.ceil(filteredFlatList.length / flatPageSize))}
                  </span>
                  <button
                    type="button"
                    disabled={flatPage >= Math.ceil(filteredFlatList.length / flatPageSize)}
                    onClick={() => setFlatPage((p) => p + 1)}
                    style={{
                      backgroundColor: '#0d3834',
                      color:
                        flatPage >= Math.ceil(filteredFlatList.length / flatPageSize) ? '#64748b' : '#ffffff',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      padding: '5px 12px',
                      cursor:
                        flatPage >= Math.ceil(filteredFlatList.length / flatPageSize)
                          ? 'not-allowed'
                          : 'pointer',
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2 CONTENT: SYSTEM POSTING ACCOUNT MAPPINGS ────────────────────── */}
      {activeTab === 'mappings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #144743',
              borderRadius: '6px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#38d4c5' }}>
                Automated Transaction Posting Rules
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Every automated transaction (POS checkout sales, purchases, customer credit receivables, petty cash,
                supplier advances) automatically generates balanced journal entries into these designated GL accounts.
              </p>
            </div>
            <div
              style={{
                backgroundColor: '#031413',
                border: '1px solid #144743',
                borderRadius: '6px',
                padding: '8px 14px',
                textAlign: 'right',
              }}
            >
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>MAPPING STATUS</div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  color: configuredMappingsCount === 15 ? '#34d399' : '#f59e0b',
                }}
              >
                {configuredMappingsCount} OF 15 CONFIGURED
              </div>
            </div>
          </div>

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
                  <th style={{ padding: '12px 14px', width: '220px' }}>TRANSACTION DESTINATION</th>
                  <th style={{ padding: '12px 14px', width: '180px' }}>POSTING CATEGORY</th>
                  <th style={{ padding: '12px 14px' }}>DESCRIPTION & USAGE</th>
                  <th style={{ padding: '12px 14px', width: '320px' }}>ASSIGNED LEDGER ACCOUNT</th>
                  <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {mappingsQuery.isLoading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                      Loading system account mappings...
                    </td>
                  </tr>
                ) : (
                  mappingsList.map((row) => (
                    <MappingRowEditor
                      key={row.mapping_key}
                      mapping={row}
                      accounts={flatList}
                      onSave={(accountId) =>
                        saveMappingMutation.mutate({
                          mapping_key: row.mapping_key,
                          account_id: accountId,
                        })
                      }
                      isPending={saveMappingMutation.isPending}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL 1: ADD / EDIT ACCOUNT MODAL ─────────────────────────────────── */}
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
              maxWidth: '560px',
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
                <FileSpreadsheet size={20} color="#38d4c5" />
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                  {editingAccount ? 'Edit General Ledger Account' : 'Register New Ledger Account'}
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

            {/* Modal Form */}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* Account Code */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    ACCOUNT CODE *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 5040"
                    disabled={Boolean(editingAccount?.is_system_account)}
                    value={accountFormData.account_code}
                    onChange={(e) => setAccountFormData({ ...accountFormData, account_code: e.target.value.trim() })}
                    style={{
                      width: '100%',
                      backgroundColor: '#031413',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      outline: 'none',
                      boxSizing: 'border-box',
                      opacity: editingAccount?.is_system_account ? 0.6 : 1,
                    }}
                  />
                </div>

                {/* Account Type */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    ACCOUNT CLASS / TYPE *
                  </label>
                  <select
                    disabled={Boolean(editingAccount?.is_system_account)}
                    value={accountFormData.account_type}
                    onChange={(e) => {
                      const newType = e.target.value as AccountType
                      const normal =
                        newType === 'asset' || newType === 'expense' || newType === 'cost_of_sales'
                          ? 'debit'
                          : 'credit'
                      setAccountFormData({
                        ...accountFormData,
                        account_type: newType,
                        normal_balance: normal,
                      })
                    }}
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
                      opacity: editingAccount?.is_system_account ? 0.6 : 1,
                    }}
                  >
                    <option value="asset">1000 - Asset</option>
                    <option value="liability">2000 - Liability</option>
                    <option value="equity">3000 - Equity</option>
                    <option value="income">4000 - Income</option>
                    <option value="cost_of_sales">5000 - Cost of Sales</option>
                    <option value="expense">6000 - Operating Expense</option>
                  </select>
                </div>

                {/* Account Name */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    ACCOUNT NAME *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Advertising & Digital Marketing Overheads"
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

                {/* Normal Balance */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    NORMAL BALANCE
                  </label>
                  <select
                    disabled={Boolean(editingAccount?.is_system_account)}
                    value={accountFormData.normal_balance}
                    onChange={(e) =>
                      setAccountFormData({ ...accountFormData, normal_balance: e.target.value as NormalBalance })
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
                      opacity: editingAccount?.is_system_account ? 0.6 : 1,
                    }}
                  >
                    <option value="debit">DEBIT</option>
                    <option value="credit">CREDIT</option>
                  </select>
                </div>

                {/* Parent Account */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    PARENT ACCOUNT (OPTIONAL)
                  </label>
                  <select
                    disabled={Boolean(editingAccount?.is_system_account)}
                    value={accountFormData.parent_account_id || ''}
                    onChange={(e) => setAccountFormData({ ...accountFormData, parent_account_id: e.target.value || null })}
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
                      opacity: editingAccount?.is_system_account ? 0.6 : 1,
                    }}
                  >
                    <option value="">-- No Parent (Root Division) --</option>
                    {flatList
                      .filter(
                        (a) =>
                          a.account_type === accountFormData.account_type &&
                          (!editingAccount || a.id !== editingAccount.id)
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          [{a.account_code}] {a.account_name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Checkboxes */}
                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(accountFormData.is_control_account)}
                      disabled={Boolean(editingAccount?.is_system_account)}
                      onChange={(e) =>
                        setAccountFormData({
                          ...accountFormData,
                          is_control_account: e.target.checked,
                          allow_manual_entries: e.target.checked ? false : accountFormData.allow_manual_entries,
                        })
                      }
                      style={{ width: '16px', height: '16px', accentColor: '#38d4c5' }}
                    />
                    <span style={{ color: '#ffffff' }}>
                      Is Control Account (aggregates child accounts; direct manual journals restricted)
                    </span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(accountFormData.allow_manual_entries)}
                      disabled={Boolean(accountFormData.is_control_account)}
                      onChange={(e) => setAccountFormData({ ...accountFormData, allow_manual_entries: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                    />
                    <span style={{ color: '#ffffff' }}>Allow Manual Journal Entries to this account</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(accountFormData.is_active)}
                      onChange={(e) => setAccountFormData({ ...accountFormData, is_active: e.target.checked })}
                      style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                    />
                    <span style={{ color: '#ffffff' }}>Account is Active for transactions</span>
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

      {/* ── MODAL 2: LEDGER AUDIT / RECENT TRANSACTIONS MODAL ────────────────── */}
      {ledgerModalAccount && (
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
              maxWidth: '720px',
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
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      color: '#38d4c5',
                      backgroundColor: '#0d3834',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid #144743',
                    }}
                  >
                    {ledgerModalAccount.account_code}
                  </span>
                  <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>
                    {ledgerModalAccount.account_name}
                  </h2>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  Recent Subledger Journal Lines & Audit Transactions
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLedgerModalAccount(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '16px 20px' }}>
              {ledgerEntriesQuery.isLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading ledger entries...
                </div>
              ) : (ledgerEntriesQuery.data ?? []).length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No journal transactions recorded for this account yet.
                </div>
              ) : (
                <div style={{ border: '1px solid #144743', borderRadius: '4px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                    <thead>
                      <tr
                        style={{
                          backgroundColor: '#031413',
                          borderBottom: '1px solid #144743',
                          color: '#38d4c5',
                          fontWeight: 700,
                          fontSize: '11px',
                        }}
                      >
                        <th style={{ padding: '8px 12px', width: '100px' }}>DATE</th>
                        <th style={{ padding: '8px 12px', width: '110px' }}>JV NUMBER</th>
                        <th style={{ padding: '8px 12px' }}>DESCRIPTION</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', width: '110px' }}>DEBIT (LKR)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', width: '110px' }}>CREDIT (LKR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ledgerEntriesQuery.data ?? []).map((entry) => (
                        <tr key={entry.id} style={{ borderBottom: '1px solid #0d3834' }}>
                          <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{entry.entry_date}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#38d4c5' }}>
                            {entry.journal_number}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>
                            {entry.description || 'System Transaction Posting'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: entry.debit ? '#38bdf8' : '#64748b' }}>
                            {entry.debit ? formatCurrency(entry.debit) : '—'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: entry.credit ? '#c084fc' : '#64748b' }}>
                            {entry.credit ? formatCurrency(entry.credit) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                padding: '12px 20px',
                borderTop: '1px solid #144743',
                backgroundColor: '#031413',
              }}
            >
              <button
                type="button"
                onClick={() => setLedgerModalAccount(null)}
                style={{
                  backgroundColor: '#0d3834',
                  border: '1px solid #144743',
                  color: '#ffffff',
                  padding: '7px 16px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-component for System Mapping Row ──────────────────────────────────────
const MappingRowEditor: React.FC<{
  mapping: AccountMappingRow
  accounts: ChartOfAccountNode[]
  onSave: (accountId: string) => void
  isPending: boolean
}> = ({ mapping, accounts, onSave, isPending }) => {
  const [selectedAccountId, setSelectedAccountId] = useState(mapping.account_id)
  const isChanged = selectedAccountId !== mapping.account_id

  return (
    <tr
      style={{
        borderBottom: '1px solid #0d3834',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#072723')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <td style={{ padding: '12px 14px' }}>
        <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '13px' }}>
          {mapping.mapping_key.replace(/_/g, ' ').toUpperCase()}
        </div>
        <div style={{ color: '#38d4c5', fontSize: '11px', fontFamily: 'monospace' }}>
          key: {mapping.mapping_key}
        </div>
      </td>

      <td style={{ padding: '12px 14px' }}>
        <span
          style={{
            backgroundColor: '#031413',
            border: '1px solid #144743',
            color: '#cbd5e1',
            padding: '3px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
          }}
        >
          {mapping.category}
        </span>
      </td>

      <td style={{ padding: '12px 14px', color: '#94a3b8', fontSize: '12px' }}>
        {mapping.description}
      </td>

      <td style={{ padding: '12px 14px' }}>
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          style={{
            width: '100%',
            backgroundColor: '#031413',
            border: isChanged ? '1px solid #f59e0b' : '1px solid #144743',
            borderRadius: '4px',
            color: '#ffffff',
            padding: '7px 10px',
            fontSize: '12px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">-- Select GL Posting Account --</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              [{a.account_code}] {a.account_name} ({a.account_type.toUpperCase()})
            </option>
          ))}
        </select>
      </td>

      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
        <button
          type="button"
          disabled={!isChanged || isPending || !selectedAccountId}
          onClick={() => onSave(selectedAccountId)}
          style={{
            backgroundColor: isChanged ? '#10b981' : 'transparent',
            color: isChanged ? '#ffffff' : '#64748b',
            border: isChanged ? 'none' : '1px solid #144743',
            padding: '5px 12px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 700,
            cursor: isChanged ? 'pointer' : 'default',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Check size={12} />
          <span>Save</span>
        </button>
      </td>
    </tr>
  )
}
