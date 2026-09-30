import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  RefreshCw,
  Edit2,
  X,
  AlertTriangle,
  Building2,
  Sparkles,
  Info,
} from 'lucide-react'
import {
  listNumberSequences,
  updateNumberSequence,
  createNumberSequence,
  initializeMissingBranchSequences,
  previewSequenceNumber,
  SEQUENCE_TYPE_METADATA,
  type NumberSequenceRow,
  type SequenceType,
  type ResetFrequency,
  type SequenceCategory,
} from '../services/numberSequences'
import { listBranches } from '../services/branches'
import type { Branch } from '../types/domain'
import { getErrorMessage } from '../lib/errors'

export const NumberSequencesPage: React.FC = () => {
  const queryClient = useQueryClient()

  // ── Filters & Search ────────────────────────────────────────────────────────
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<SequenceCategory | 'all'>('all')

  // ── Global Toast ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Edit Modal State ────────────────────────────────────────────────────────
  const [editingSeq, setEditingSeq] = useState<NumberSequenceRow | null>(null)
  const [editFormData, setEditFormData] = useState<{
    prefix: string
    next_number: number
    padding_length: number
    reset_frequency: ResetFrequency
  }>({
    prefix: '',
    next_number: 1,
    padding_length: 6,
    reset_frequency: 'never',
  })
  const [modalError, setModalError] = useState<string | null>(null)

  // ── Create Modal State ──────────────────────────────────────────────────────
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createFormData, setCreateFormData] = useState<{
    branch_id: string
    sequence_type: SequenceType
    prefix: string
    next_number: number
    padding_length: number
    reset_frequency: ResetFrequency
  }>({
    branch_id: '',
    sequence_type: 'invoice',
    prefix: 'INV-',
    next_number: 1,
    padding_length: 6,
    reset_frequency: 'never',
  })

  // ── Queries ─────────────────────────────────────────────────────────────────
  const branchesQuery = useQuery<Branch[]>({
    queryKey: ['branches-list'],
    queryFn: () => listBranches(),
  })

  const sequencesQuery = useQuery<NumberSequenceRow[]>({
    queryKey: ['number-sequences', selectedBranchId, search, categoryFilter],
    queryFn: () =>
      listNumberSequences({
        branchId: selectedBranchId || undefined,
        search: search || undefined,
        category: categoryFilter,
      }),
  })

  const branches = branchesQuery.data ?? []
  const sequences = sequencesQuery.data ?? []

  // ── Mutations ───────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingSeq) return
      return updateNumberSequence(editingSeq.id, editFormData)
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['number-sequences'] })
      notify(`Sequence ${updated?.sequence_type} updated! Next document: ${updated?.preview_sample}`)
      setEditingSeq(null)
    },
    onError: (err) => setModalError(getErrorMessage(err)),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!createFormData.branch_id) throw new Error('Please select a branch.')
      return createNumberSequence(createFormData)
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['number-sequences'] })
      notify(`New sequence created: ${created.preview_sample}`)
      setIsCreateModalOpen(false)
    },
    onError: (err) => setModalError(getErrorMessage(err)),
  })

  const initializeBranchMutation = useMutation({
    mutationFn: async (branchId: string) => {
      return initializeMissingBranchSequences(branchId)
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['number-sequences'] })
      notify(`Initialized ${res.addedCount} missing standard document sequences for this branch!`)
    },
    onError: (err) => notify(getErrorMessage(err), true),
  })

  // ── Edit Modal Open Handler ─────────────────────────────────────────────────
  const openEditModal = (seq: NumberSequenceRow) => {
    setEditingSeq(seq)
    setModalError(null)
    setEditFormData({
      prefix: seq.prefix,
      next_number: seq.next_number,
      padding_length: seq.padding_length,
      reset_frequency: seq.reset_frequency,
    })
  }

  const openCreateModal = () => {
    setModalError(null)
    const initialBranch = selectedBranchId || branches[0]?.id || ''
    setCreateFormData({
      branch_id: initialBranch,
      sequence_type: 'invoice',
      prefix: 'INV-',
      next_number: 1,
      padding_length: 6,
      reset_frequency: 'never',
    })
    setIsCreateModalOpen(true)
  }

  // ── KPI Summary Calculations ────────────────────────────────────────────────
  const totalSequencesCount = sequences.length
  const uniqueBranchesCount = useMemo(() => {
    const set = new Set(sequences.map((s) => s.branch_id))
    return set.size
  }, [sequences])

  const salesSequencesCount = useMemo(
    () => sequences.filter((s) => s.info.category === 'Sales & POS').length,
    [sequences]
  )

  const purchasesTreasuryCount = useMemo(
    () =>
      sequences.filter(
        (s) => s.info.category === 'Purchases & GRN' || s.info.category === 'Treasury & Cash'
      ).length,
    [sequences]
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
            Document-Number Sequence Details
          </h2>
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={openCreateModal}
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
              ADD SEQUENCE
            </button>
          </div>
        </div>

        {/* Global Actions & Branch Selector */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          {/* Branch Filter Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building2 size={16} color="#38d4c5" />
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              style={{
                backgroundColor: '#0c2e2a',
                border: '1px solid #164e48',
                color: '#ffffff',
                padding: '8px 14px',
                borderRadius: '4px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
            >
              <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Store Outlets ({branches.length})</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                  {b.name} {b.is_head_office ? '(HQ / Main Store)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Provision Missing Defaults Button */}
          {selectedBranchId && (
            <button
              type="button"
              onClick={() => initializeBranchMutation.mutate(selectedBranchId)}
              disabled={initializeBranchMutation.isPending}
              title="Ensure all 17 standard business document types are configured for this branch"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#0c2e2a',
                border: '1px solid #164e48',
                color: '#38d4c5',
                borderRadius: '4px',
                padding: '8px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
            >
              <Sparkles size={14} />
              <span>{initializeBranchMutation.isPending ? 'Provisioning...' : 'Provision Missing Series'}</span>
            </button>
          )}

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => sequencesQuery.refetch()}
            title="Refresh sequence numbers"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              color: '#94a3b8',
              borderRadius: '4px',
              padding: '8px 12px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <RefreshCw size={15} className={sequencesQuery.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
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
            ACTIVE NUMBER SEQUENCES
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
            {totalSequencesCount}
          </div>
          <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
            Atomic, collision-free numbering
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
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#00d2ff', letterSpacing: '0.05em' }}>
            STORE OUTLETS CONFIGURED
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#00d2ff', marginTop: '4px' }}>
            {uniqueBranchesCount}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Independent serial series
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
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#38d4c5', letterSpacing: '0.05em' }}>
            SALES & BILLING SERIES
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#38d4c5', marginTop: '4px' }}>
            {salesSequencesCount}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Invoices, Quotes, Orders & Returns
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
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.05em' }}>
            PURCHASING & TREASURY
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
            {purchasesTreasuryCount}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            GRN Bills, Vouchers & Receipts
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

      {/* ── Filter Toolbar ──────────────────────────────────────────────────── */}
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
        {/* Category Filter Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          {(
            [
              'all',
              'Sales & POS',
              'Purchases & GRN',
              'Treasury & Cash',
              'General Ledger',
              'Inventory & Transfers',
              'Master Entities',
            ] as const
          ).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              style={{
                backgroundColor: categoryFilter === cat ? '#0d3834' : '#031413',
                border: categoryFilter === cat ? '1px solid #38d4c5' : '1px solid #144743',
                color: categoryFilter === cat ? '#38d4c5' : '#94a3b8',
                padding: '6px 12px',
                borderRadius: '16px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {cat === 'all' ? 'All Document Series' : cat}
            </button>
          ))}
        </div>

        {/* Search Input */}
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
            placeholder="Search series, prefix, or branch..."
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
      </div>

      {/* ── Main Sequences Table ────────────────────────────────────────────── */}
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
              <th style={{ padding: '12px 14px' }}>DOCUMENT FAMILY</th>
              <th style={{ padding: '12px 14px', width: '180px' }}>STORE OUTLET</th>
              <th style={{ padding: '12px 14px', width: '110px' }}>PREFIX</th>
              <th style={{ padding: '12px 14px', textAlign: 'center', width: '110px' }}>NEXT NUMBER</th>
              <th style={{ padding: '12px 14px', textAlign: 'center', width: '80px' }}>PADDING</th>
              <th style={{ padding: '12px 14px', textAlign: 'center', width: '110px' }}>RESET FREQ</th>
              <th style={{ padding: '12px 14px', width: '180px' }}>NEXT ISSUED PREVIEW</th>
              <th style={{ padding: '12px 14px', textAlign: 'center', width: '90px' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {sequencesQuery.isLoading ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading document-number sequences...
                </td>
              </tr>
            ) : sequences.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No number sequences found.{' '}
                  {selectedBranchId ? (
                    <button
                      type="button"
                      onClick={() => initializeBranchMutation.mutate(selectedBranchId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#38d4c5',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Provision default sequences for this branch
                    </button>
                  ) : (
                    <span>Select a branch to configure series.</span>
                  )}
                </td>
              </tr>
            ) : (
              sequences.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid #0d3834',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#072723')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Document Family */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: row.info.badgeColor,
                        }}
                      />
                      <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '13px' }}>
                        {row.info.label}
                      </div>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px', marginLeft: '16px' }}>
                      {row.info.description}
                    </div>
                  </td>

                  {/* Store Outlet */}
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
                      {row.branch_name} {row.is_head_office ? '(HQ)' : ''}
                    </span>
                  </td>

                  {/* Prefix */}
                  <td style={{ padding: '12px 14px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        color: '#38d4c5',
                        backgroundColor: '#031413',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: '1px solid #144743',
                        fontSize: '12px',
                      }}
                    >
                      {row.prefix || '(none)'}
                    </span>
                  </td>

                  {/* Next Number Counter */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#ffffff', fontSize: '13px' }}>
                      {row.next_number}
                    </span>
                  </td>

                  {/* Padding Length */}
                  <td style={{ padding: '12px 14px', textAlign: 'center', color: '#94a3b8' }}>
                    {row.padding_length} digits
                  </td>

                  {/* Reset Frequency */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor:
                          row.reset_frequency === 'never'
                            ? '#1e293b'
                            : row.reset_frequency === 'yearly'
                            ? '#064e3b'
                            : '#78350f',
                        color:
                          row.reset_frequency === 'never'
                            ? '#94a3b8'
                            : row.reset_frequency === 'yearly'
                            ? '#34d399'
                            : '#fbbf24',
                      }}
                    >
                      {row.reset_frequency}
                    </span>
                  </td>

                  {/* Live Next Issued Preview */}
                  <td style={{ padding: '12px 14px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        fontSize: '13px',
                        letterSpacing: '0.05em',
                        color: '#00d2ff',
                        backgroundColor: '#02181f',
                        border: '1px solid #005f73',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        display: 'inline-block',
                      }}
                    >
                      {row.preview_sample}
                    </span>
                  </td>

                  {/* Action */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => openEditModal(row)}
                      title="Edit Sequence Rule"
                      style={{
                        backgroundColor: '#031413',
                        border: '1px solid #144743',
                        color: '#38d4c5',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}
                    >
                      <Edit2 size={12} />
                      <span>Configure</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── MODAL 1: EDIT SEQUENCE RULE ───────────────────────────────────────── */}
      {editingSeq && (
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
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                  Configure {editingSeq.info.label}
                </h2>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  Outlet: {editingSeq.branch_name} | Type: {editingSeq.sequence_type}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSeq(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                updateMutation.mutate()
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

              {/* Dynamic Live Preview Banner */}
              <div
                style={{
                  backgroundColor: '#02181f',
                  border: '1px solid #005f73',
                  borderRadius: '6px',
                  padding: '14px',
                  marginBottom: '18px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#38d4c5', letterSpacing: '0.05em' }}>
                  NEXT ISSUED DOCUMENT NUMBER PREVIEW
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '22px',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    color: '#00d2ff',
                    marginTop: '6px',
                  }}
                >
                  {previewSequenceNumber(
                    editFormData.prefix,
                    editFormData.next_number,
                    editFormData.padding_length
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* Prefix */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    DOCUMENT PREFIX
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-"
                    value={editFormData.prefix}
                    onChange={(e) => setEditFormData({ ...editFormData, prefix: e.target.value })}
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
                    }}
                  />
                </div>

                {/* Next Number */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    NEXT NUMBER (COUNTER)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editFormData.next_number}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, next_number: Math.max(1, parseInt(e.target.value, 10) || 1) })
                    }
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

                {/* Padding Length */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    ZERO-PADDING DIGITS (1-18)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="18"
                    required
                    value={editFormData.padding_length}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        padding_length: Math.max(1, Math.min(18, parseInt(e.target.value, 10) || 6)),
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
                  />
                </div>

                {/* Reset Frequency */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    RESET FREQUENCY
                  </label>
                  <select
                    value={editFormData.reset_frequency}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, reset_frequency: e.target.value as ResetFrequency })
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
                    <option value="never">Never (Consecutive Continuous)</option>
                    <option value="daily">Daily (Resets Every Midnight)</option>
                    <option value="monthly">Monthly (Resets 1st of Month)</option>
                    <option value="yearly">Yearly (Resets 1st of January)</option>
                  </select>
                </div>
              </div>

              {/* Compliance Note */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start',
                  backgroundColor: '#031413',
                  border: '1px solid #144743',
                  borderRadius: '4px',
                  padding: '10px 12px',
                  marginTop: '16px',
                  fontSize: '11px',
                  color: '#94a3b8',
                }}
              >
                <Info size={15} color="#38d4c5" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  Consecutive document numbering without gaps is strictly required for Sri Lanka Inland Revenue fiscal audits.
                  Adjusting the next number is intended for initial system onboarding or authorized resets.
                </span>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  marginTop: '20px',
                  paddingTop: '16px',
                  borderTop: '1px solid #144743',
                }}
              >
                <button
                  type="button"
                  onClick={() => setEditingSeq(null)}
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
                  disabled={updateMutation.isPending}
                  style={{
                    backgroundColor: '#00b4d8',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 22px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    cursor: updateMutation.isPending ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
                >
                  {updateMutation.isPending ? 'SAVING...' : 'UPDATE SEQUENCE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: ADD CUSTOM SEQUENCE ──────────────────────────────────────── */}
      {isCreateModalOpen && (
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
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                Add Custom Number Sequence
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                createMutation.mutate()
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

              {/* Dynamic Live Preview Banner */}
              <div
                style={{
                  backgroundColor: '#02181f',
                  border: '1px solid #005f73',
                  borderRadius: '6px',
                  padding: '14px',
                  marginBottom: '18px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#38d4c5', letterSpacing: '0.05em' }}>
                  INITIAL DOCUMENT NUMBER PREVIEW
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '22px',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    color: '#00d2ff',
                    marginTop: '6px',
                  }}
                >
                  {previewSequenceNumber(
                    createFormData.prefix,
                    createFormData.next_number,
                    createFormData.padding_length
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {/* Branch */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    STORE OUTLET *
                  </label>
                  <select
                    required
                    value={createFormData.branch_id}
                    onChange={(e) => setCreateFormData({ ...createFormData, branch_id: e.target.value })}
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
                    <option value="">-- Select Branch --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sequence Type */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    DOCUMENT FAMILY *
                  </label>
                  <select
                    value={createFormData.sequence_type}
                    onChange={(e) => {
                      const st = e.target.value as SequenceType
                      const meta = SEQUENCE_TYPE_METADATA[st]
                      setCreateFormData({
                        ...createFormData,
                        sequence_type: st,
                        prefix: meta?.defaultPrefix || 'DOC-',
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
                    }}
                  >
                    {(Object.keys(SEQUENCE_TYPE_METADATA) as SequenceType[]).map((st) => (
                      <option key={st} value={st}>
                        {SEQUENCE_TYPE_METADATA[st].label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Prefix */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    DOCUMENT PREFIX
                  </label>
                  <input
                    type="text"
                    value={createFormData.prefix}
                    onChange={(e) => setCreateFormData({ ...createFormData, prefix: e.target.value })}
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
                    }}
                  />
                </div>

                {/* Starting Number */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    STARTING NUMBER
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={createFormData.next_number}
                    onChange={(e) =>
                      setCreateFormData({
                        ...createFormData,
                        next_number: Math.max(1, parseInt(e.target.value, 10) || 1),
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
                      fontFamily: 'monospace',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Padding Length */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    ZERO-PADDING DIGITS
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="18"
                    value={createFormData.padding_length}
                    onChange={(e) =>
                      setCreateFormData({
                        ...createFormData,
                        padding_length: Math.max(1, Math.min(18, parseInt(e.target.value, 10) || 6)),
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
                  />
                </div>

                {/* Reset Frequency */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#38d4c5', marginBottom: '6px' }}>
                    RESET FREQUENCY
                  </label>
                  <select
                    value={createFormData.reset_frequency}
                    onChange={(e) =>
                      setCreateFormData({
                        ...createFormData,
                        reset_frequency: e.target.value as ResetFrequency,
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
                    <option value="never">Never (Continuous)</option>
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  marginTop: '20px',
                  paddingTop: '16px',
                  borderTop: '1px solid #144743',
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
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
                  disabled={createMutation.isPending}
                  style={{
                    backgroundColor: '#00b4d8',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 22px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
                >
                  {createMutation.isPending ? 'CREATING...' : 'CREATE SEQUENCE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
