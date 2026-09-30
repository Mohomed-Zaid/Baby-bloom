import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Edit2,
  X,
  FileText,
  AlertTriangle,
} from 'lucide-react'
import {
  listCategoriesPaginated,
  listCategoryOptions,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  softDeleteCategory,
  type CategoryRow,
} from '../services/categories'
import { getErrorMessage } from '../lib/errors'

interface CategoryFormData {
  id?: string
  code: string
  name: string
  parent_id: string
  description: string
  is_active: boolean
}

const defaultFormData: CategoryFormData = {
  code: '',
  name: '',
  parent_id: '',
  description: '',
  is_active: true,
}

export const CategoriesPage: React.FC = () => {
  const queryClient = useQueryClient()

  // Filters & State
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'inactive'>('active')
  const [page, setPage] = useState(1)
  const pageSize = 15

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState<CategoryFormData>(defaultFormData)
  const [isEditing, setIsEditing] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 3500)
  }

  // Load Categories Query
  const categoriesQuery = useQuery({
    queryKey: ['categories-paginated', appliedSearch, statusFilter, page],
    queryFn: () =>
      listCategoriesPaginated({
        search: appliedSearch || undefined,
        status: statusFilter,
        page,
        pageSize,
      }),
  })

  // Load Parent Options
  const parentOptionsQuery = useQuery({
    queryKey: ['categories-options'],
    queryFn: () => listCategoryOptions(),
    enabled: showModal,
  })

  const categoryRows = categoriesQuery.data?.rows ?? []
  const totalCount = categoriesQuery.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Next Category Code Auto-suggest
  const getNextCategoryCode = () => {
    if (categoryRows.length === 0) return '001'
    const numericCodes = categoryRows
      .map((c) => parseInt(c.code.replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n))
    const maxNum = numericCodes.length > 0 ? Math.max(...numericCodes) : 0
    return String(maxNum + 1).padStart(3, '0')
  }

  const handleOpenAdd = () => {
    setIsEditing(false)
    setFormData({
      ...defaultFormData,
      code: getNextCategoryCode(),
    })
    setModalError(null)
    setShowModal(true)
  }

  const handleOpenEdit = (c: CategoryRow) => {
    setIsEditing(true)
    setFormData({
      id: c.id,
      code: c.code,
      name: c.name,
      parent_id: c.parent_id || '',
      description: c.description || '',
      is_active: c.is_active,
    })
    setModalError(null)
    setShowModal(true)
  }

  // Save Mutation
  const saveCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name.trim()) {
        throw new Error('Category Name is required.')
      }

      if (isEditing && formData.id) {
        return updateCategory({
          id: formData.id,
          code: formData.code.trim(),
          name: formData.name.trim(),
          parent_id: formData.parent_id || null,
          description: formData.description.trim(),
          is_active: formData.is_active,
        })
      } else {
        return createCategory({
          code: formData.code.trim() || undefined,
          name: formData.name.trim(),
          parent_id: formData.parent_id || null,
          description: formData.description.trim(),
          is_active: formData.is_active,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-paginated'] })
      queryClient.invalidateQueries({ queryKey: ['categories-options'] })
      notify(isEditing ? 'Category updated successfully' : 'Category registered successfully')
      setShowModal(false)
    },
    onError: (err) => {
      setModalError(getErrorMessage(err))
    },
  })

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return softDeleteCategory(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-paginated'] })
      queryClient.invalidateQueries({ queryKey: ['categories-options'] })
      notify('Category deleted successfully')
    },
    onError: (err) => {
      notify(getErrorMessage(err), true)
    },
  })

  // Toggle Status Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: boolean }) => {
      return toggleCategoryStatus(id, currentStatus)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-paginated'] })
      notify('Category status updated successfully')
    },
    onError: (err) => {
      notify(getErrorMessage(err), true)
    },
  })

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
            Category Details
          </h2>
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={handleOpenAdd}
              style={{
                backgroundColor: '#00b4d8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 22px',
                fontWeight: 800,
                fontSize: '12px',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0096c7')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#00b4d8')}
            >
              ADD CATEGORY
            </button>
          </div>
        </div>

        {/* Filter Dropdown + Search Box on Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'active' | 'all' | 'inactive')
              setPage(1)
            }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '8px 14px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value="active" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Active</option>
            <option value="all" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All</option>
            <option value="inactive" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Inactive</option>
          </select>

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
              placeholder="Search Category"
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
                width: '240px',
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
              <Search size={16} />
            </button>
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

      {/* ── Main Category Table ─────────────────────────────────────────────── */}
      <div
        style={{
          border: '1px solid #144743',
          borderRadius: '4px',
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
              <th style={{ padding: '12px 14px' }}>CATEGORY NAME</th>
              <th style={{ padding: '12px 14px', width: '180px' }}>PARENT CATEGORY</th>
              <th style={{ padding: '12px 14px' }}>DESCRIPTION</th>
              <th style={{ padding: '12px 14px', width: '110px', textAlign: 'center' }}>STATUS</th>
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {categoriesQuery.isLoading ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading categories...
                </td>
              </tr>
            ) : categoryRows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No categories found matching criteria.
                </td>
              </tr>
            ) : (
              categoryRows.map((cat) => (
                <tr
                  key={cat.id}
                  style={{
                    borderBottom: '1px solid #092f2b',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#082d29')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Code */}
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#f8fafc' }}>
                    {cat.code}
                  </td>

                  {/* Name */}
                  <td style={{ padding: '12px 14px', color: '#e2e8f0', fontWeight: 600 }}>
                    {cat.name}
                  </td>

                  {/* Parent */}
                  <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                    {cat.parent_name || '-'}
                  </td>

                  {/* Description */}
                  <td style={{ padding: '12px 14px', color: '#94a3b8', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cat.description || '-'}
                  </td>

                  {/* Status Capsule */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <button
                      type="button"
                      title="Click to toggle status"
                      onClick={() => toggleStatusMutation.mutate({ id: cat.id, currentStatus: cat.is_active })}
                      style={{
                        display: 'inline-block',
                        padding: '3px 12px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        backgroundColor: cat.is_active ? '#065f46' : '#7f1d1d',
                        color: cat.is_active ? '#34d399' : '#f87171',
                        border: `1px solid ${cat.is_active ? '#059669' : '#b91c1c'}`,
                        cursor: 'pointer',
                      }}
                    >
                      {cat.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </button>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                      {/* Edit Button */}
                      <button
                        type="button"
                        title="Edit Category"
                        onClick={() => handleOpenEdit(cat)}
                        style={{
                          backgroundColor: '#00b4d8',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '3px',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Edit2 size={13} />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        title="Delete Category"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to delete category "${cat.name}" (${cat.code})?`
                            )
                          ) {
                            deleteMutation.mutate(cat.id)
                          }
                        }}
                        style={{
                          backgroundColor: '#ef4444',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '3px',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── Pagination ──────────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            backgroundColor: '#031413',
            borderTop: '1px solid #144743',
            fontSize: '12px',
            color: '#94a3b8',
          }}
        >
          <div>
            Showing {categoryRows.length} of {totalCount} categories
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                backgroundColor: page <= 1 ? '#0c2e2a' : '#144743',
                color: page <= 1 ? '#475569' : '#ffffff',
                border: 'none',
                borderRadius: '3px',
                padding: '4px 10px',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              Prev
            </button>
            <span style={{ padding: '4px 8px', color: '#38d4c5', fontWeight: 700 }}>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                backgroundColor: page >= totalPages ? '#0c2e2a' : '#144743',
                color: page >= totalPages ? '#475569' : '#ffffff',
                border: 'none',
                borderRadius: '3px',
                padding: '4px 10px',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ── CATEGORY REGISTRATION MODAL ─────────────────────────────────────── */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#041c19',
              border: '1px solid #17534c',
              borderRadius: '6px',
              width: '680px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 180, 216, 0.1)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: '1px solid #144743',
                backgroundColor: '#031413',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em' }}>
                {isEditing ? 'UPDATE CATEGORY' : 'CATEGORY REGISTRATION'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Register / Update Button */}
                <button
                  type="button"
                  disabled={saveCategoryMutation.isPending}
                  onClick={() => saveCategoryMutation.mutate()}
                  style={{
                    backgroundColor: '#00b4d8',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 18px',
                    fontWeight: 800,
                    fontSize: '12px',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                  }}
                >
                  <FileText size={14} />
                  {saveCategoryMutation.isPending ? 'SAVING...' : isEditing ? 'UPDATE' : 'REGISTER'}
                </button>

                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '8px 18px',
                    fontWeight: 800,
                    fontSize: '12px',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                  }}
                >
                  CANCEL
                </button>

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    marginLeft: '6px',
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Error Message if any */}
            {modalError && (
              <div
                style={{
                  margin: '16px 20px 0 20px',
                  padding: '10px 14px',
                  backgroundColor: '#450a0a',
                  border: '1px solid #ef4444',
                  borderRadius: '4px',
                  color: '#fca5a5',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            {/* Modal Body */}
            <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Row 1: Code and Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                    CATEGORY CODE <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
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

                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                    CATEGORY NAME <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Category Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%',
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Row 2: Parent Category */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                  PARENT CATEGORY
                </label>
                <select
                  value={formData.parent_id}
                  onChange={(e) => setFormData({ ...formData, parent_id: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                  }}
                >
                  <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>None (Top-Level Category)</option>
                  {(parentOptionsQuery.data ?? [])
                    .filter((opt) => !formData.id || opt.id !== formData.id)
                    .map((opt) => (
                      <option key={opt.id} value={opt.id} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                        [{opt.code}] {opt.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Row 3: Description */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                  DESCRIPTION
                </label>
                <textarea
                  rows={3}
                  placeholder="Optional description of this category..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    backgroundColor: '#0c2e2a',
                    border: '1px solid #164e48',
                    borderRadius: '4px',
                    color: '#ffffff',
                    padding: '9px 12px',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Row 4: Active Checkbox */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    style={{ accentColor: '#00b4d8', width: '16px', height: '16px' }}
                  />
                  ACTIVE
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CategoriesPage
