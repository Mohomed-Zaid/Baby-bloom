import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Edit2,
  X,
  FileText,
  User,
  UserPlus,
  AlertTriangle,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  listVendorsPaginated,
  createVendor,
  updateVendor,
  softDeleteVendor,
} from '../services/vendors'
import type { Vendor, VendorMember } from '../types/domain'
import { getErrorMessage } from '../lib/errors'

interface VendorFormData {
  id?: string
  vendor_code: string
  name: string
  address: string
  phone: string
  email: string
  cheque_draw_name: string
  become_customer: boolean
  is_active: boolean
  due_days: number | string
  business_type: string
  members: VendorMember[]
}

const defaultVendorFormData: VendorFormData = {
  vendor_code: '',
  name: '',
  address: '',
  phone: '',
  email: '',
  cheque_draw_name: '',
  become_customer: false,
  is_active: true,
  due_days: '',
  business_type: '',
  members: [],
}

export const VendorsPage: React.FC = () => {
  const queryClient = useQueryClient()

  // Filters & State
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 15

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'add_members'>('general')
  const [formData, setFormData] = useState<VendorFormData>(defaultVendorFormData)
  const [isEditing, setIsEditing] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // New Member Input State (inside ADD MEMBERS tab)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberPhone, setNewMemberPhone] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')

  // Toast
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 3500)
  }

  // Load Vendors Query
  const vendorsQuery = useQuery({
    queryKey: ['vendors-paginated', appliedSearch, page],
    queryFn: () =>
      listVendorsPaginated({
        search: appliedSearch || undefined,
        page,
        pageSize,
      }),
  })

  const vendorRows = vendorsQuery.data?.rows ?? []
  const totalCount = vendorsQuery.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Next Vendor Code Auto-suggest
  const getNextVendorCode = () => {
    if (vendorRows.length === 0) return '001'
    const numericCodes = vendorRows
      .map((v) => parseInt(v.vendor_code.replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n))
    const maxNum = numericCodes.length > 0 ? Math.max(...numericCodes) : 0
    return String(maxNum + 1).padStart(3, '0')
  }

  const handleOpenAdd = () => {
    setIsEditing(false)
    setFormData({
      ...defaultVendorFormData,
      vendor_code: getNextVendorCode(),
    })
    setActiveTab('general')
    setModalError(null)
    setNewMemberName('')
    setNewMemberPhone('')
    setNewMemberRole('')
    setNewMemberEmail('')
    setShowModal(true)
  }

  const handleOpenEdit = (v: Vendor) => {
    setIsEditing(true)
    setFormData({
      id: v.id,
      vendor_code: v.vendor_code || '',
      name: v.name || '',
      address: v.address || '',
      phone: v.phone || '',
      email: v.email || '',
      cheque_draw_name: v.cheque_draw_name || '',
      become_customer: Boolean(v.become_customer),
      is_active: v.status === 'active',
      due_days: v.due_days ?? v.credit_days ?? '',
      business_type: v.business_type || '',
      members: Array.isArray(v.members) ? v.members : [],
    })
    setActiveTab('general')
    setModalError(null)
    setNewMemberName('')
    setNewMemberPhone('')
    setNewMemberRole('')
    setNewMemberEmail('')
    setShowModal(true)
  }

  // Save Mutation
  const saveVendorMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name.trim()) {
        throw new Error('Vendor Name is required.')
      }

      const dueDaysNum = typeof formData.due_days === 'string'
        ? (formData.due_days.trim() ? parseInt(formData.due_days, 10) : 0)
        : formData.due_days

      if (isEditing && formData.id) {
        return updateVendor({
          id: formData.id,
          vendor_code: formData.vendor_code.trim(),
          name: formData.name.trim(),
          address: formData.address.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          cheque_draw_name: formData.cheque_draw_name.trim(),
          become_customer: formData.become_customer,
          status: formData.is_active ? 'active' : 'inactive',
          due_days: isNaN(dueDaysNum) ? 0 : dueDaysNum,
          business_type: formData.business_type.trim(),
          members: formData.members,
        })
      } else {
        return createVendor({
          vendor_code: formData.vendor_code.trim() || undefined,
          name: formData.name.trim(),
          address: formData.address.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          cheque_draw_name: formData.cheque_draw_name.trim(),
          become_customer: formData.become_customer,
          status: formData.is_active ? 'active' : 'inactive',
          due_days: isNaN(dueDaysNum) ? 0 : dueDaysNum,
          business_type: formData.business_type.trim(),
          members: formData.members,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors-paginated'] })
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      notify(isEditing ? 'Vendor updated successfully' : 'Vendor registered successfully')
      setShowModal(false)
    },
    onError: (err) => {
      setModalError(getErrorMessage(err))
    },
  })

  // Delete Mutation
  const deleteVendorMutation = useMutation({
    mutationFn: async (id: string) => {
      return softDeleteVendor(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors-paginated'] })
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      notify('Vendor deleted successfully')
    },
    onError: (err) => {
      notify(getErrorMessage(err), true)
    },
  })

  // Add Member to Form
  const handleAddMember = () => {
    if (!newMemberName.trim()) return
    const newMember: VendorMember = {
      name: newMemberName.trim(),
      phone: newMemberPhone.trim() || undefined,
      role: newMemberRole.trim() || undefined,
      email: newMemberEmail.trim() || undefined,
    }
    setFormData((prev) => ({
      ...prev,
      members: [...prev.members, newMember],
    }))
    setNewMemberName('')
    setNewMemberPhone('')
    setNewMemberRole('')
    setNewMemberEmail('')
  }

  const handleRemoveMember = (idx: number) => {
    setFormData((prev) => ({
      ...prev,
      members: prev.members.filter((_, i) => i !== idx),
    }))
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
            Vendor Details
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
              ADD VENDOR
            </button>
          </div>
        </div>

        {/* Search Box on Right */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
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
              placeholder="Search Vendor"
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

      {/* ── Main Vendor Table ───────────────────────────────────────────────── */}
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
              <th style={{ padding: '12px 14px', width: '90px' }}>CODE</th>
              <th style={{ padding: '12px 14px' }}>VENDOR</th>
              <th style={{ padding: '12px 14px', width: '160px' }}>CONTACT NO</th>
              <th style={{ padding: '12px 14px' }}>ADDRESS</th>
              <th style={{ padding: '12px 14px', width: '110px', textAlign: 'center' }}>STATUS</th>
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {vendorsQuery.isLoading ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading vendors...
                </td>
              </tr>
            ) : vendorRows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No vendors found matching criteria.
                </td>
              </tr>
            ) : (
              vendorRows.map((vendor) => (
                <tr
                  key={vendor.id}
                  style={{
                    borderBottom: '1px solid #092f2b',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#082d29')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Code */}
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#f8fafc' }}>
                    {vendor.vendor_code}
                  </td>

                  {/* Vendor Name */}
                  <td style={{ padding: '12px 14px', color: '#e2e8f0', fontWeight: 600 }}>
                    {vendor.name}
                  </td>

                  {/* Contact No */}
                  <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                    {vendor.phone || '-'}
                  </td>

                  {/* Address */}
                  <td style={{ padding: '12px 14px', color: '#94a3b8', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {vendor.address || '-'}
                  </td>

                  {/* Status Capsule */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 12px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        backgroundColor: vendor.status === 'active' ? '#065f46' : '#7f1d1d',
                        color: vendor.status === 'active' ? '#34d399' : '#f87171',
                        border: `1px solid ${vendor.status === 'active' ? '#059669' : '#b91c1c'}`,
                      }}
                    >
                      {vendor.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                      {/* Edit Button */}
                      <button
                        type="button"
                        title="Edit Vendor"
                        onClick={() => handleOpenEdit(vendor)}
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
                        title="Delete Vendor"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to delete vendor "${vendor.name}" (${vendor.vendor_code})?`
                            )
                          ) {
                            deleteVendorMutation.mutate(vendor.id)
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
            Showing {vendorRows.length} of {totalCount} vendors
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

      {/* ── VENDOR REGISTRATION MODAL ───────────────────────────────────────── */}
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
              width: '920px',
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
                VENDOR REGISTRATION
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Register / Update Button */}
                <button
                  type="button"
                  disabled={saveVendorMutation.isPending}
                  onClick={() => saveVendorMutation.mutate()}
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
                  {saveVendorMutation.isPending ? 'SAVING...' : isEditing ? 'UPDATE' : 'REGISTER'}
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

            {/* Modal Tabs Bar */}
            <div
              style={{
                display: 'flex',
                backgroundColor: '#051f1c',
                borderBottom: '1px solid #144743',
              }}
            >
              {/* Tab: GENERAL */}
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '12px 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'general' ? '2px solid #00b4d8' : '2px solid transparent',
                  cursor: 'pointer',
                  color: activeTab === 'general' ? '#00b4d8' : '#94a3b8',
                  transition: 'all 0.15s ease',
                }}
              >
                <User size={18} color={activeTab === 'general' ? '#00b4d8' : '#94a3b8'} />
                <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em' }}>
                  GENERAL
                </span>
              </button>

              {/* Tab: ADD MEMBERS */}
              <button
                type="button"
                onClick={() => setActiveTab('add_members')}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '12px 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'add_members' ? '2px solid #00b4d8' : '2px solid transparent',
                  cursor: 'pointer',
                  color: activeTab === 'add_members' ? '#00b4d8' : '#94a3b8',
                  transition: 'all 0.15s ease',
                }}
              >
                <UserPlus size={18} color={activeTab === 'add_members' ? '#00b4d8' : '#94a3b8'} />
                <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em' }}>
                  ADD MEMBERS
                </span>
              </button>
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
            <div style={{ padding: '24px 20px' }}>
              {activeTab === 'general' ? (
                /* ── TAB 1: GENERAL (Left/Right split) ── */
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1px 1fr', gap: '24px' }}>
                  {/* Left Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* VENDOR CODE */}
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        VENDOR CODE <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.vendor_code}
                        onChange={(e) => setFormData({ ...formData, vendor_code: e.target.value })}
                        style={{
                          width: '180px',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 12px',
                          fontSize: '13px',
                          fontWeight: 700,
                          outline: 'none',
                        }}
                      />
                    </div>

                    {/* VENDOR NAME */}
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        VENDOR NAME <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Vendor Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 12px',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* ADDRESS */}
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        ADDRESS
                      </label>
                      <textarea
                        rows={3}
                        placeholder=""
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 12px',
                          fontSize: '13px',
                          outline: 'none',
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* CONTACT NUMBER */}
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        CONTACT NUMBER
                      </label>
                      <input
                        type="text"
                        placeholder="Contact NO"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 12px',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* EMAIL */}
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        EMAIL
                      </label>
                      <input
                        type="email"
                        placeholder="abc@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 12px',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* CHEQUE DRAW NAME */}
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        CHEQUE DRAW NAME
                      </label>
                      <input
                        type="text"
                        placeholder="ABC PVT LTD"
                        value={formData.cheque_draw_name}
                        onChange={(e) => setFormData({ ...formData, cheque_draw_name: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 12px',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* Checkboxes: BECOME A CUSTOMER, ACTIVE */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em' }}>
                        <input
                          type="checkbox"
                          checked={formData.become_customer}
                          onChange={(e) => setFormData({ ...formData, become_customer: e.target.checked })}
                          style={{ accentColor: '#00b4d8', width: '15px', height: '15px' }}
                        />
                        BECOME A CUSTOMER
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 800, letterSpacing: '0.04em' }}>
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                          style={{ accentColor: '#00b4d8', width: '15px', height: '15px' }}
                        />
                        ACTIVE
                      </label>
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div style={{ backgroundColor: '#144743', width: '1px', height: '100%' }} />

                  {/* Right Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* DUE DAYS */}
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        DUE DAYS
                      </label>
                      <input
                        type="text"
                        placeholder="Days"
                        value={formData.due_days}
                        onChange={(e) => setFormData({ ...formData, due_days: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 12px',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {/* BUSINESS TYPE */}
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        BUSNESS TYPE
                      </label>
                      <input
                        type="text"
                        placeholder=""
                        value={formData.business_type}
                        onChange={(e) => setFormData({ ...formData, business_type: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 12px',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* ── TAB 2: ADD MEMBERS ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Add Member Row Inputs */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.5fr 1.2fr 1.2fr 1.5fr auto',
                      gap: '10px',
                      alignItems: 'flex-end',
                      padding: '14px',
                      backgroundColor: '#082824',
                      border: '1px solid #144743',
                      borderRadius: '4px',
                    }}
                  >
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>
                        MEMBER NAME *
                      </label>
                      <input
                        type="text"
                        placeholder="Name"
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 10px',
                          fontSize: '12px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>
                        PHONE
                      </label>
                      <input
                        type="text"
                        placeholder="Phone"
                        value={newMemberPhone}
                        onChange={(e) => setNewMemberPhone(e.target.value)}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 10px',
                          fontSize: '12px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>
                        ROLE / DESIGNATION
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Sales Rep"
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value)}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 10px',
                          fontSize: '12px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '4px' }}>
                        EMAIL
                      </label>
                      <input
                        type="email"
                        placeholder="Email"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '8px 10px',
                          fontSize: '12px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleAddMember}
                      style={{
                        backgroundColor: '#00b4d8',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '8px 14px',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        height: '34px',
                      }}
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>

                  {/* Members List Table */}
                  <div
                    style={{
                      border: '1px solid #144743',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      backgroundColor: '#051f1c',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#031413', borderBottom: '1px solid #144743', color: '#38d4c5' }}>
                          <th style={{ padding: '8px 12px' }}>NAME</th>
                          <th style={{ padding: '8px 12px' }}>PHONE</th>
                          <th style={{ padding: '8px 12px' }}>ROLE</th>
                          <th style={{ padding: '8px 12px' }}>EMAIL</th>
                          <th style={{ padding: '8px 12px', width: '50px', textAlign: 'center' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formData.members.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                              No contact members added yet. Use the fields above to add members.
                            </td>
                          </tr>
                        ) : (
                          formData.members.map((member, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #0c2e2a' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: '#f8fafc' }}>
                                {member.name}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>
                                {member.phone || '-'}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>
                                {member.role || '-'}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                                {member.email || '-'}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(idx)}
                                  style={{
                                    backgroundColor: '#ef4444',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '3px',
                                    width: '22px',
                                    height: '22px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VendorsPage
