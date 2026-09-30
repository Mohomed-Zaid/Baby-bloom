import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Edit2,
  X,
  FileText,
  User,
  CreditCard,
  AlertTriangle,
} from 'lucide-react'
import { listStaff, createStaff, updateStaff, toggleStaffStatus } from '../services/staffService'
import { listLookup } from '../services/masterData'
import type { StaffProfile } from '../types/staff'
import { getErrorMessage } from '../lib/errors'

interface StaffFormData {
  id?: string
  staff_code: string
  first_name: string
  nick_name: string
  nic: string
  dob: string
  gender: 'MALE' | 'FEMALE'
  address: string
  area: string
  mobile_number: string
  telephone_no: string
  email: string
  is_active: boolean
  sales_in: boolean
  sales_target: boolean
  branches: string[]
  joined_date: string
  department_name: string
  role_level: string
  salary_type: string
  commission_rate: number
  vehicle_no: string
  staff_short_key: string
}

const defaultStaffFormData: StaffFormData = {
  staff_code: '',
  first_name: '',
  nick_name: '',
  nic: '',
  dob: '',
  gender: 'MALE',
  address: '',
  area: '',
  mobile_number: '',
  telephone_no: '',
  email: '',
  is_active: true,
  sales_in: true,
  sales_target: false,
  branches: ['EASY BABY - STORE'],
  joined_date: new Date().toISOString().split('T')[0] ?? '',
  department_name: 'Sales',
  role_level: 'LEVEL 1',
  salary_type: 'Monthly',
  commission_rate: 0,
  vehicle_no: '',
  staff_short_key: '',
}

const DEFAULT_BRANCH_OPTIONS = [
  'EASY BABY - STORE',
  'EASY BABY - BUTTALA',
  'EASY BABY - MOUNT LAVINIA',
]

const DEPARTMENT_OPTIONS = [
  'Sales',
  'Management',
  'Store & Warehouse',
  'Accounts & Finance',
  'Cashier Counter',
  'Customer Care',
  'Operations',
]

const ROLE_OPTIONS = [
  'LEVEL 1',
  'LEVEL 2',
  'Sales Manager',
  'Cashier',
  'Sales Rep',
  'Other',
]

const SALARY_TYPE_OPTIONS = [
  'Monthly',
  'Daily',
  'Commission Based',
  'Hourly',
]

export const StaffPage: React.FC = () => {
  const queryClient = useQueryClient()

  // Filters & State
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'inactive'>('active')
  const [page, setPage] = useState(1)
  const pageSize = 15

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'more_info'>('general')
  const [formData, setFormData] = useState<StaffFormData>(defaultStaffFormData)
  const [isEditing, setIsEditing] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // Notification Toast
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 3500)
  }

  // Load Branches from DB Lookup if available
  const { data: dbBranches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches', 'name'),
  })

  const availableBranches = dbBranches.length > 0
    ? dbBranches.map((b) => b.label)
    : DEFAULT_BRANCH_OPTIONS

  // Load Staff List
  const staffQuery = useQuery({
    queryKey: ['staff-profiles-list', statusFilter, appliedSearch],
    queryFn: () =>
      listStaff({
        status: statusFilter,
        search: appliedSearch || undefined,
      }),
  })

  const staffList = staffQuery.data ?? []
  const filteredStaff = staffList

  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / pageSize))
  const paginatedStaff = filteredStaff.slice((page - 1) * pageSize, page * pageSize)

  // Auto-generate code
  const getNextStaffCode = () => {
    if (staffList.length === 0) return '001'
    const numericCodes = staffList
      .map((s) => parseInt(s.staff_code.replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n))
    const maxNum = numericCodes.length > 0 ? Math.max(...numericCodes) : 0
    return String(maxNum + 1).padStart(3, '0')
  }

  const handleOpenAdd = () => {
    setIsEditing(false)
    setFormData({
      ...defaultStaffFormData,
      staff_code: getNextStaffCode(),
    })
    setActiveTab('general')
    setModalError(null)
    setShowModal(true)
  }

  const handleOpenEdit = (staff: StaffProfile) => {
    setIsEditing(true)
    setFormData({
      id: staff.id,
      staff_code: staff.staff_code || '',
      first_name: staff.first_name || '',
      nick_name: staff.nick_name || staff.first_name || '',
      nic: staff.nic || '',
      dob: staff.dob || '',
      gender: (staff.gender === 'FEMALE' ? 'FEMALE' : 'MALE'),
      address: staff.address || '',
      area: staff.area || '',
      mobile_number: staff.mobile_number || '',
      telephone_no: staff.telephone_no || '',
      email: staff.email || '',
      is_active: staff.is_active,
      sales_in: staff.sales_in ?? true,
      sales_target: staff.sales_target ?? false,
      branches: Array.isArray(staff.branches) && staff.branches.length > 0 ? staff.branches : ['EASY BABY - STORE'],
      joined_date: staff.joined_date || '',
      department_name: staff.department_name || 'Sales',
      role_level: staff.role_level || 'LEVEL 1',
      salary_type: staff.salary_type || 'Monthly',
      commission_rate: staff.commission_rate ?? 0,
      vehicle_no: staff.vehicle_no || '',
      staff_short_key: staff.staff_short_key || '',
    })
    setActiveTab('general')
    setModalError(null)
    setShowModal(true)
  }

  // Save Mutation
  const saveStaffMutation = useMutation({
    mutationFn: async () => {
      if (!formData.first_name.trim()) {
        throw new Error('Staff Name is required.')
      }
      if (!formData.mobile_number.trim()) {
        throw new Error('Mobile No is required.')
      }

      if (isEditing && formData.id) {
        return updateStaff(formData.id, {
          first_name: formData.first_name.trim(),
          nick_name: formData.nick_name.trim(),
          nic: formData.nic.trim(),
          dob: formData.dob || undefined,
          gender: formData.gender,
          address: formData.address.trim(),
          area: formData.area.trim(),
          mobile_number: formData.mobile_number.trim(),
          telephone_no: formData.telephone_no.trim(),
          email: formData.email.trim(),
          is_active: formData.is_active,
          sales_in: formData.sales_in,
          sales_target: formData.sales_target,
          branches: formData.branches,
          joined_date: formData.joined_date || undefined,
          department_name: formData.department_name,
          role_level: formData.role_level,
          designation: formData.role_level,
          salary_type: formData.salary_type,
          commission_rate: Number(formData.commission_rate) || 0,
          vehicle_no: formData.vehicle_no.trim(),
          staff_short_key: formData.staff_short_key.trim(),
        })
      } else {
        return createStaff({
          staff_code: formData.staff_code.trim() || undefined,
          first_name: formData.first_name.trim(),
          nick_name: formData.nick_name.trim(),
          nic: formData.nic.trim(),
          dob: formData.dob || undefined,
          gender: formData.gender,
          address: formData.address.trim(),
          area: formData.area.trim(),
          mobile_number: formData.mobile_number.trim(),
          telephone_no: formData.telephone_no.trim(),
          email: formData.email.trim(),
          is_active: formData.is_active,
          sales_in: formData.sales_in,
          sales_target: formData.sales_target,
          branches: formData.branches,
          joined_date: formData.joined_date || undefined,
          department_name: formData.department_name,
          role_level: formData.role_level,
          designation: formData.role_level,
          salary_type: formData.salary_type,
          commission_rate: Number(formData.commission_rate) || 0,
          vehicle_no: formData.vehicle_no.trim(),
          staff_short_key: formData.staff_short_key.trim(),
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-profiles-list'] })
      queryClient.invalidateQueries({ queryKey: ['staff-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['staff-list'] })
      notify(isEditing ? 'Staff details updated successfully' : 'Staff registered successfully')
      setShowModal(false)
    },
    onError: (err) => {
      setModalError(getErrorMessage(err))
    },
  })

  // Toggle Status Mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      return toggleStaffStatus(id, is_active)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-profiles-list'] })
      queryClient.invalidateQueries({ queryKey: ['staff-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['staff-list'] })
      notify('Staff status updated successfully')
    },
    onError: (err) => {
      notify(getErrorMessage(err), true)
    },
  })

  const handleToggleBranch = (branchName: string) => {
    setFormData((prev) => {
      const exists = prev.branches.includes(branchName)
      const newBranches = exists
        ? prev.branches.filter((b) => b !== branchName)
        : [...prev.branches, branchName]
      return { ...prev, branches: newBranches }
    })
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
            Staff Details
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
              ADD STAFF
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
              placeholder="Search Staff"
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
                width: '220px',
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

      {/* ── Main Staff Table ────────────────────────────────────────────────── */}
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
              <th style={{ padding: '12px 14px' }}>NAME</th>
              <th style={{ padding: '12px 14px', width: '140px' }}>MOBILE</th>
              <th style={{ padding: '12px 14px' }}>ADDRESS</th>
              <th style={{ padding: '12px 14px', width: '150px' }}>ROLE</th>
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>STATUS</th>
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {staffQuery.isLoading ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading staff members...
                </td>
              </tr>
            ) : paginatedStaff.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No staff members found matching criteria.
                </td>
              </tr>
            ) : (
              paginatedStaff.map((staff) => (
                <tr
                  key={staff.id}
                  style={{
                    borderBottom: '1px solid #092f2b',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#082d29')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Code */}
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: '#f8fafc' }}>
                    {staff.staff_code}
                  </td>

                  {/* Name */}
                  <td style={{ padding: '12px 14px', color: '#e2e8f0', fontWeight: 600 }}>
                    {staff.first_name}
                  </td>

                  {/* Mobile */}
                  <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                    {staff.mobile_number}
                  </td>

                  {/* Address */}
                  <td style={{ padding: '12px 14px', color: '#94a3b8', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {staff.address || '-'}
                  </td>

                  {/* Role */}
                  <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                    {staff.role_level || staff.designation || 'LEVEL 1'}
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
                        backgroundColor: staff.is_active ? '#065f46' : '#7f1d1d',
                        color: staff.is_active ? '#34d399' : '#f87171',
                        border: `1px solid ${staff.is_active ? '#059669' : '#b91c1c'}`,
                      }}
                    >
                      {staff.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                      {/* Edit Button */}
                      <button
                        type="button"
                        title="Edit Staff"
                        onClick={() => handleOpenEdit(staff)}
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

                      {/* Deactivate/Delete Button */}
                      <button
                        type="button"
                        title={staff.is_active ? 'Deactivate Staff' : 'Activate Staff'}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to ${staff.is_active ? 'deactivate' : 'activate'} staff "${staff.first_name}"?`
                            )
                          ) {
                            toggleStatusMutation.mutate({ id: staff.id, is_active: !staff.is_active })
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
            Showing {paginatedStaff.length} of {filteredStaff.length} staff members
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

      {/* ── STAFF REGISTRATION MODAL ────────────────────────────────────────── */}
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
              width: '880px',
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
                STAFF REGISTRATION
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Register / Update Button */}
                <button
                  type="button"
                  disabled={saveStaffMutation.isPending}
                  onClick={() => saveStaffMutation.mutate()}
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
                  {saveStaffMutation.isPending ? 'SAVING...' : isEditing ? 'UPDATE' : 'REGISTER'}
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

              {/* Tab: MORE INFO */}
              <button
                type="button"
                onClick={() => setActiveTab('more_info')}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '12px 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'more_info' ? '2px solid #00b4d8' : '2px solid transparent',
                  cursor: 'pointer',
                  color: activeTab === 'more_info' ? '#00b4d8' : '#94a3b8',
                  transition: 'all 0.15s ease',
                }}
              >
                <CreditCard size={18} color={activeTab === 'more_info' ? '#00b4d8' : '#94a3b8'} />
                <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em' }}>
                  MORE INFO
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
                /* ── TAB 1: GENERAL ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Row 1: Code, Staff Name, Nick Name */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        STAFF CODE <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.staff_code}
                        onChange={(e) => setFormData({ ...formData, staff_code: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #164e48',
                          borderRadius: '4px',
                          color: '#ffffff',
                          padding: '9px 12px',
                          fontSize: '13px',
                          fontWeight: 600,
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        STAFF NAME <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Staff Name"
                        value={formData.first_name}
                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
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

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        NICK NAME
                      </label>
                      <input
                        type="text"
                        placeholder="Nick Name"
                        value={formData.nick_name}
                        onChange={(e) => setFormData({ ...formData, nick_name: e.target.value })}
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

                  {/* Row 2: NIC, DOB, Gender */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', alignItems: 'center' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        NIC <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="NIC"
                        value={formData.nic}
                        onChange={(e) => setFormData({ ...formData, nic: e.target.value })}
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

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        DOB
                      </label>
                      <input
                        type="date"
                        value={formData.dob}
                        onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
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

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        GENDER
                      </label>
                      <div style={{ display: 'flex', gap: '18px', alignItems: 'center', height: '38px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                          <input
                            type="radio"
                            name="gender"
                            value="MALE"
                            checked={formData.gender === 'MALE'}
                            onChange={() => setFormData({ ...formData, gender: 'MALE' })}
                            style={{ accentColor: '#00b4d8' }}
                          />
                          MALE
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                          <input
                            type="radio"
                            name="gender"
                            value="FEMALE"
                            checked={formData.gender === 'FEMALE'}
                            onChange={() => setFormData({ ...formData, gender: 'FEMALE' })}
                            style={{ accentColor: '#00b4d8' }}
                          />
                          FEMALE
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Address & Area */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        ADRESS <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <textarea
                        rows={2}
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

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        AREA
                      </label>
                      <input
                        type="text"
                        placeholder="Staff Area"
                        value={formData.area}
                        onChange={(e) => setFormData({ ...formData, area: e.target.value })}
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

                  {/* Row 4: Mobile No, Telephone No, Email */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        MOBILE NO <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Staff Mobile NO"
                        value={formData.mobile_number}
                        onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
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

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        TELEPHONE NO
                      </label>
                      <input
                        type="text"
                        placeholder="Telephone NO"
                        value={formData.telephone_no}
                        onChange={(e) => setFormData({ ...formData, telephone_no: e.target.value })}
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

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        EMAIL
                      </label>
                      <input
                        type="email"
                        placeholder="abc@example.com Code"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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

                  {/* Row 5: Flags (ACTIVE, SALES IN, SALES TARGET) */}
                  <div style={{ display: 'flex', gap: '30px', alignItems: 'center', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        style={{ accentColor: '#00b4d8', width: '16px', height: '16px' }}
                      />
                      ACTIVE
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>
                      <input
                        type="checkbox"
                        checked={formData.sales_in}
                        onChange={(e) => setFormData({ ...formData, sales_in: e.target.checked })}
                        style={{ accentColor: '#00b4d8', width: '16px', height: '16px' }}
                      />
                      SALES IN
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>
                      <input
                        type="checkbox"
                        checked={formData.sales_target}
                        onChange={(e) => setFormData({ ...formData, sales_target: e.target.checked })}
                        style={{ accentColor: '#00b4d8', width: '16px', height: '16px' }}
                      />
                      SALES TARGET
                    </label>
                  </div>

                  {/* Row 6: Branch Checkboxes */}
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#ffffff', marginBottom: '10px', letterSpacing: '0.02em' }}>
                      Branch
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                      {availableBranches.map((br) => {
                        const checked = formData.branches.includes(br)
                        return (
                          <label
                            key={br}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: checked ? '#ffffff' : '#94a3b8',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleBranch(br)}
                              style={{ accentColor: '#00b4d8', width: '15px', height: '15px' }}
                            />
                            {br}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* ── TAB 2: MORE INFO ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Row 1: Joined Date, Department Name, Staff Role */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        JOINED DATE
                      </label>
                      <input
                        type="date"
                        value={formData.joined_date}
                        onChange={(e) => setFormData({ ...formData, joined_date: e.target.value })}
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

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        DEPARTMENT NAME
                      </label>
                      <select
                        value={formData.department_name}
                        onChange={(e) => setFormData({ ...formData, department_name: e.target.value })}
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
                        <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Select</option>
                        {DEPARTMENT_OPTIONS.map((dept) => (
                          <option key={dept} value={dept} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        STAFF ROLE
                      </label>
                      <select
                        value={formData.role_level}
                        onChange={(e) => setFormData({ ...formData, role_level: e.target.value })}
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
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Salary Type, Commission Percentage, Vehicle No, Staff Short Key */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        SALARY TYPE
                      </label>
                      <select
                        value={formData.salary_type}
                        onChange={(e) => setFormData({ ...formData, salary_type: e.target.value })}
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
                        <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Select</option>
                        {SALARY_TYPE_OPTIONS.map((sal) => (
                          <option key={sal} value={sal} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                            {sal}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        COMMISION PERCENTAGE
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="Commission (%)"
                        value={formData.commission_rate || ''}
                        onChange={(e) => setFormData({ ...formData, commission_rate: parseFloat(e.target.value) || 0 })}
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

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        VEHICLE NO
                      </label>
                      <input
                        type="text"
                        placeholder="vehicle no (%)"
                        value={formData.vehicle_no}
                        onChange={(e) => setFormData({ ...formData, vehicle_no: e.target.value })}
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

                    <div>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                        STAFF SHORT KEY
                      </label>
                      <input
                        type="text"
                        placeholder=""
                        value={formData.staff_short_key}
                        onChange={(e) => setFormData({ ...formData, staff_short_key: e.target.value })}
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
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StaffPage
