import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Edit3, UserCheck, UserX, X, Users } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { listLookup } from '../services/masterData'
import { listStaff, createStaff, updateStaff, toggleStaffStatus } from '../services/staffService'
import type { CreateStaffInput, StaffProfile } from '../types/staff'
import { getErrorMessage } from '../lib/errors'

export const StaffPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffProfile | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Form state
  const [staffCode, setStaffCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [address, setAddress] = useState('')
  const [designation, setDesignation] = useState('')
  const [roleLevel, setRoleLevel] = useState('Sales Rep')
  const [commissionRate, setCommissionRate] = useState<number>(0)
  const [branchId, setBranchId] = useState('')
  const [isActive, setIsActive] = useState(true)

  // Lookups
  const { data: branches = [] } = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: () => listLookup('branches', 'name'),
  })

  // Staff query
  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ['staff-profiles', selectedBranch, searchTerm, selectedRole],
    queryFn: () => listStaff({
      branchId: selectedBranch || undefined,
      search: searchTerm || undefined,
      roleLevel: selectedRole || undefined,
    }),
  })

  const resetForm = () => {
    setEditingStaff(null)
    setStaffCode('')
    setFirstName('')
    setLastName('')
    setMobileNumber('')
    setAddress('')
    setDesignation('Sales Executive')
    setRoleLevel('Sales Rep')
    setCommissionRate(0)
    setBranchId('')
    setIsActive(true)
    setErrorMsg(null)
  }

  const openAddModal = () => {
    resetForm()
    // Pre-suggest next code
    const nextNum = staffList.length + 1
    setStaffCode(`STF-${String(nextNum).padStart(3, '0')}`)
    setShowModal(true)
  }

  const openEditModal = (staff: StaffProfile) => {
    setEditingStaff(staff)
    setStaffCode(staff.staff_code)
    setFirstName(staff.first_name)
    setLastName(staff.last_name || '')
    setMobileNumber(staff.mobile_number)
    setAddress(staff.address || '')
    setDesignation(staff.designation)
    setRoleLevel(staff.role_level)
    setCommissionRate(staff.commission_rate)
    setBranchId(staff.branch_id || '')
    setIsActive(staff.is_active)
    setErrorMsg(null)
    setShowModal(true)
  }

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!firstName.trim() || !mobileNumber.trim() || !designation.trim() || !roleLevel.trim()) {
        throw new Error('Please fill all mandatory fields (First Name, Mobile, Designation, Role Level).')
      }

      if (editingStaff) {
        return updateStaff(editingStaff.id, {
          first_name: firstName,
          last_name: lastName,
          mobile_number: mobileNumber,
          address,
          designation,
          role_level: roleLevel,
          commission_rate: commissionRate,
          branch_id: branchId || null,
          is_active: isActive,
        })
      } else {
        const input: CreateStaffInput = {
          staff_code: staffCode,
          first_name: firstName,
          last_name: lastName,
          mobile_number: mobileNumber,
          address,
          designation,
          role_level: roleLevel,
          commission_rate: commissionRate,
          branch_id: branchId || null,
          is_active: isActive,
        }
        return createStaff(input)
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['staff-profiles'] })
      setShowModal(false)
      resetForm()
      setNotice(`Staff profile for "${saved.first_name}" saved successfully.`)
      setTimeout(() => setNotice(null), 4000)
    },
    onError: (err) => {
      setErrorMsg(getErrorMessage(err))
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => toggleStaffStatus(id, active),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['staff-profiles'] })
      setNotice(`Staff "${updated.first_name}" ${updated.is_active ? 'activated' : 'deactivated'}.`)
      setTimeout(() => setNotice(null), 3000)
    },
    onError: (err) => {
      setNotice(getErrorMessage(err))
    },
  })

  return (
    <div className="page-stack">
      <PageHeader
        title="Staff Management"
        description="Operational staff directory, sales representative assignments, role tiers, and sales commission rates."
        breadcrumbs={[{ label: 'Admin', path: '/admin/security' }, { label: 'Staff' }]}
        actions={
          <button className="button primary" onClick={openAddModal}>
            <Plus size={16} /> Add Staff
          </button>
        }
      />

      {notice && <div className="inline-notice">{notice}</div>}

      {/* Filter and Search Bar */}
      <div className="content-panel" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1', minWidth: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#9abfad' }} />
            <input
              type="text"
              className="text-input"
              style={{ paddingLeft: '32px', height: '36px' }}
              placeholder="Search by code, name, designation, mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              className="text-input"
              style={{ height: '36px', minWidth: '160px' }}
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>

            <select
              className="text-input"
              style={{ height: '36px', minWidth: '150px' }}
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="">All Role Levels</option>
              <option value="LEVEL 1">LEVEL 1</option>
              <option value="Sales Manager">Sales Manager</option>
              <option value="Cashier">Cashier</option>
              <option value="Sales Rep">Sales Rep</option>
              <option value="Stock Keeper">Stock Keeper</option>
              <option value="Accountant">Accountant</option>
            </select>
          </div>
        </div>
      </div>

      {/* Staff Table */}
      <section className="content-panel">
        <div className="panel-heading" style={{ marginBottom: '12px' }}>
          <div>
            <span className="eyebrow">Personnel Directory</span>
            <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} /> Staff Profiles ({staffList.length})
            </h2>
          </div>
        </div>

        {isLoading ? (
          <div className="panel-state">Loading staff directory...</div>
        ) : staffList.length === 0 ? (
          <div className="panel-state" style={{ padding: '36px 16px', textAlign: 'center' }}>
            <p style={{ color: '#9abfad', marginBottom: '12px' }}>No staff profiles found matching criteria.</p>
            <button className="button secondary" onClick={openAddModal}>
              <Plus size={14} /> Add First Staff Member
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Code</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Full Name</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Mobile</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Designation</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Role Level</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem' }}>Assigned Branch</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem', textAlign: 'right' }}>Commission %</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '10px 12px', color: '#9abfad', fontSize: '0.85rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((stf) => (
                  <tr
                    key={stf.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      opacity: stf.is_active ? 1 : 0.6,
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#5ec99a' }}>
                      {stf.staff_code}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#e8f0ec' }}>
                      <strong>{stf.full_name}</strong>
                      {stf.address && (
                        <div style={{ fontSize: '0.75rem', color: '#7a9f8d' }}>{stf.address}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cfded6' }}>{stf.mobile_number}</td>
                    <td style={{ padding: '10px 12px', color: '#cfded6' }}>{stf.designation}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background:
                            stf.role_level === 'LEVEL 1'
                              ? 'rgba(235, 160, 60, 0.2)'
                              : stf.role_level === 'Sales Manager'
                              ? 'rgba(74, 185, 230, 0.2)'
                              : 'rgba(94, 201, 154, 0.2)',
                          color:
                            stf.role_level === 'LEVEL 1'
                              ? '#f5b041'
                              : stf.role_level === 'Sales Manager'
                              ? '#5dade2'
                              : '#5ec99a',
                        }}
                      >
                        {stf.role_level}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#cfded6' }}>{stf.branch_name}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#5ec99a', fontWeight: 600 }}>
                      {stf.commission_rate.toFixed(2)}%
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: stf.is_active ? 'rgba(94,201,154,0.15)' : 'rgba(235,87,87,0.15)',
                          color: stf.is_active ? '#5ec99a' : '#eb5757',
                        }}
                      >
                        {stf.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          className="table-action"
                          title="Edit Staff"
                          onClick={() => openEditModal(stf)}
                          style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Edit3 size={14} /> Edit
                        </button>
                        <button
                          className="table-action"
                          title={stf.is_active ? 'Deactivate' : 'Activate'}
                          onClick={() => toggleStatusMutation.mutate({ id: stf.id, active: !stf.is_active })}
                          style={{
                            padding: '4px 8px',
                            color: stf.is_active ? '#e57373' : '#81c784',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {stf.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                          {stf.is_active ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add / Edit Staff Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3>{editingStaff ? 'Edit Staff Profile' : 'Add New Staff Member'}</h3>
              <button
                className="modal-close"
                onClick={() => {
                  setShowModal(false)
                  resetForm()
                }}
              >
                <X size={18} />
              </button>
            </div>

            {errorMsg && (
              <div className="inline-notice" style={{ background: 'rgba(235,87,87,0.2)', color: '#ffb4b4', marginBottom: '14px' }}>
                {errorMsg}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label className="form-field">
                <span>Staff Code *</span>
                <input
                  type="text"
                  className="text-input"
                  value={staffCode}
                  onChange={(e) => setStaffCode(e.target.value)}
                  placeholder="e.g. STF-001"
                />
              </label>

              <label className="form-field">
                <span>Role Level *</span>
                <select
                  className="text-input"
                  value={roleLevel}
                  onChange={(e) => setRoleLevel(e.target.value)}
                >
                  <option value="LEVEL 1">LEVEL 1 (Executive Admin)</option>
                  <option value="Sales Manager">Sales Manager</option>
                  <option value="Cashier">Cashier</option>
                  <option value="Sales Rep">Sales Rep</option>
                  <option value="Stock Keeper">Stock Keeper</option>
                  <option value="Accountant">Accountant</option>
                </select>
              </label>

              <label className="form-field">
                <span>First Name *</span>
                <input
                  type="text"
                  className="text-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </label>

              <label className="form-field">
                <span>Last Name</span>
                <input
                  type="text"
                  className="text-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name (optional)"
                />
              </label>

              <label className="form-field">
                <span>Mobile Number *</span>
                <input
                  type="text"
                  className="text-input"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="e.g. 0771234567"
                />
              </label>

              <label className="form-field">
                <span>Designation *</span>
                <input
                  type="text"
                  className="text-input"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Sales Executive / Cashier"
                />
              </label>

              <label className="form-field">
                <span>Commission Rate (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  className="text-input"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(Number(e.target.value))}
                  placeholder="0.00"
                />
              </label>

              <label className="form-field">
                <span>Assigned Branch</span>
                <select
                  className="text-input"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  <option value="">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field" style={{ gridColumn: 'span 2' }}>
                <span>Address</span>
                <input
                  type="text"
                  className="text-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Residential or contact address"
                />
              </label>

              <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
                <input
                  type="checkbox"
                  id="is_active_toggle"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#5ec99a' }}
                />
                <label htmlFor="is_active_toggle" style={{ color: '#e8f0ec', cursor: 'pointer', fontSize: '0.9rem' }}>
                  Staff member is active and available for sales rep assignments
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setShowModal(false)
                  resetForm()
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? 'Saving...' : editingStaff ? 'Update Staff' : 'Save Staff'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
