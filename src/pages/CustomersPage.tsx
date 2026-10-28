import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Edit2, X, FileText, Plus, Search,
  RefreshCw, Check, AlertTriangle, User
} from 'lucide-react'
import { useBranchStore } from '../stores/branchStore'
import { requireSupabase, throwOnError } from '../services/client'
import { listStaff } from '../services/staffService'
import { currentCompanyId, nextMasterCode } from '../services/masterData'
import { isBackendOffline } from '../lib/supabase'
import { MOCK_CUSTOMERS } from '../services/mockData'
import { getErrorMessage } from '../lib/errors'
import type { Customer } from '../types/domain'

interface CustomerFormData {
  id?: string
  customer_code: string
  name: string
  nick_name: string
  nic: string
  phone: string
  alternate_phone: string
  address: string
  area: string
  email: string
  join_date: string
  payment_plan: string
  customer_type: string
  vat_no: string
  vat_percentage: number
  discount_level: string
  credit_limit: number
  dealer_code: string
  credit_days: number
  sales_rep_id: string
  sales_rep_name: string
  is_active: boolean
}

const defaultFormData: CustomerFormData = {
  customer_code: '',
  name: '',
  nick_name: '',
  nic: '',
  phone: '',
  alternate_phone: '',
  address: '',
  area: 'Dambulla',
  email: '',
  join_date: new Date().toISOString().split('T')[0] ?? '',
  payment_plan: 'None',
  customer_type: 'retail',
  vat_no: '',
  vat_percentage: 0,
  discount_level: 'none',
  credit_limit: 0,
  dealer_code: '',
  credit_days: 0,
  sales_rep_id: '',
  sales_rep_name: '',
  is_active: true,
}

const DEFAULT_AREAS = [
  'Dambulla', 'Colombo', 'Kandy', 'Kurunegala', 'Galle',
  'Matara', 'Jaffna', 'Negombo', 'Anuradhapura', 'Mutur',
  'Hambantota', 'Ratnapura', 'Mount Lavinia', 'Dickwella'
]

export function CustomersPage() {
  const queryClient = useQueryClient()
  const branchId = useBranchStore((s) => s.branchId)

  // State
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState<CustomerFormData>(defaultFormData)
  const [isEditing, setIsEditing] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // Quick Area Add
  const [customAreas, setCustomAreas] = useState<string[]>(DEFAULT_AREAS)
  const [showAddAreaPrompt, setShowAddAreaPrompt] = useState(false)
  const [newAreaInput, setNewAreaInput] = useState('')

  // Notifications
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 3500)
  }

  // Load Sales Reps / Staff
  const staffQuery = useQuery({
    queryKey: ['staff-list', branchId],
    queryFn: () => listStaff({ branchId: branchId || undefined, activeOnly: true }),
  })

  function getMockCustomersPage(search: string, p: number, ps: number) {
    let list = [...MOCK_CUSTOMERS] as unknown as Customer[]
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(s) ||
        c.customer_code.toLowerCase().includes(s) ||
        (c.phone && c.phone.toLowerCase().includes(s)) ||
        (c.address && c.address.toLowerCase().includes(s))
      )
    }
    const from = (p - 1) * ps
    return {
      rows: list.slice(from, from + ps),
      count: list.length,
    }
  }

  // Load Customers
  const customersQuery = useQuery({
    queryKey: ['customers-list', appliedSearch, page],
    queryFn: async () => {
      if (isBackendOffline()) {
        return getMockCustomersPage(appliedSearch, page, pageSize)
      }
      const supabase = requireSupabase()
      const session = (await supabase.auth.getSession()).data.session
      if (!session) {
        return getMockCustomersPage(appliedSearch, page, pageSize)
      }

      try {
        let query = supabase
          .from('customers')
          .select('*', { count: 'exact' })
          .is('deleted_at', null)
          .order('customer_code', { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1)

        if (appliedSearch.trim()) {
          const term = appliedSearch.trim()
          query = query.or(`customer_code.ilike.%${term}%,name.ilike.%${term}%,contact_person.ilike.%${term}%,phone.ilike.%${term}%,address.ilike.%${term}%,city.ilike.%${term}%`)
        }

        const { data, error, count } = await query
        if (!error && data) {
          const rows = data.map((c: any) => {
            let meta: Record<string, any> = {}
            try {
              if (c.notes && c.notes.startsWith('{')) meta = JSON.parse(c.notes)
            } catch { }
            return {
              ...c,
              nick_name: meta.nick_name || c.contact_person || '',
              nic: meta.nic || '',
              area: c.city || meta.area || '',
              join_date: meta.join_date || (c.created_at ? c.created_at.split('T')[0] : ''),
              payment_plan: meta.payment_plan || 'None',
              discount_level: meta.discount_level || 'none',
              dealer_code: meta.dealer_code || '',
              sales_rep_id: meta.sales_rep_id || '',
              sales_rep_name: meta.sales_rep_name || '',
              vat_no: c.tax_number || meta.vat_no || '',
              vat_percentage: meta.vat_percentage ?? 0,
            }
          })
          return {
            rows: rows as unknown as Customer[],
            count: count ?? rows.length,
          }
        }
      } catch {
        // fallback to mock data
      }

      return getMockCustomersPage(appliedSearch, page, pageSize)
    },
  })

  // Open Add Modal
  const handleOpenAdd = async () => {
    setIsEditing(false)
    setModalError(null)

    let code: string
    try {
      code = branchId ? await nextMasterCode(branchId, 'customer') : String(Math.floor(5800 + Math.random() * 500))
    } catch {
      code = String(Math.floor(5800 + Math.random() * 500))
    }

    setFormData({
      ...defaultFormData,
      customer_code: code,
      join_date: new Date().toISOString().split('T')[0] ?? '',
    })
    setShowModal(true)
  }

  // Open Edit Modal
  const handleOpenEdit = (customer: Customer) => {
    setIsEditing(true)
    setModalError(null)
    let meta: Record<string, any> = {}
    try {
      if (customer.notes && customer.notes.startsWith('{')) meta = JSON.parse(customer.notes)
    } catch { }

    setFormData({
      id: customer.id,
      customer_code: customer.customer_code || '',
      name: customer.name || '',
      nick_name: meta.nick_name || customer.nick_name || customer.contact_person || '',
      nic: meta.nic || customer.nic || '',
      phone: customer.phone || '',
      alternate_phone: customer.alternate_phone || '',
      address: customer.address || '',
      area: customer.city || meta.area || customer.area || 'Dambulla',
      email: customer.email || '',
      join_date: meta.join_date || customer.join_date || (customer.created_at ? customer.created_at.split('T')[0] : '') || '',
      payment_plan: meta.payment_plan || customer.payment_plan || 'None',
      customer_type: customer.customer_type || 'retail',
      vat_no: customer.tax_number || meta.vat_no || customer.vat_no || '',
      vat_percentage: meta.vat_percentage ?? customer.vat_percentage ?? 0,
      discount_level: meta.discount_level || customer.discount_level || 'none',
      credit_limit: customer.credit_limit || 0,
      dealer_code: meta.dealer_code || customer.dealer_code || '',
      credit_days: customer.credit_days || 0,
      sales_rep_id: meta.sales_rep_id || customer.sales_rep_id || '',
      sales_rep_name: meta.sales_rep_name || customer.sales_rep_name || '',
      is_active: customer.is_active ?? true,
    })
    setShowModal(true)
  }

  // Save / Register Mutation
  const saveCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name.trim()) {
        throw new Error('Customer Name is required')
      }

      const extraMeta = {
        nick_name: formData.nick_name.trim() || undefined,
        nic: formData.nic.trim() || undefined,
        area: formData.area.trim() || undefined,
        join_date: formData.join_date || undefined,
        payment_plan: formData.payment_plan || undefined,
        discount_level: formData.discount_level || undefined,
        dealer_code: formData.dealer_code.trim() || undefined,
        sales_rep_id: formData.sales_rep_id || undefined,
        sales_rep_name: formData.sales_rep_name || undefined,
        vat_percentage: Number(formData.vat_percentage || 0) || undefined,
        vat_no: formData.vat_no.trim() || undefined,
      }

      // Valid columns of public.customers ONLY
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        contact_person: formData.nick_name.trim() || null,
        phone: formData.phone.trim() || null,
        alternate_phone: formData.alternate_phone.trim() || null,
        address: formData.address.trim() || null,
        city: formData.area.trim() || null,
        email: formData.email.trim() || null,
        customer_type: formData.customer_type === 'wholesale' ? 'wholesale' : formData.customer_type === 'dealer' ? 'dealer' : 'retail',
        tax_number: formData.vat_no.trim() || null,
        credit_limit: Number(formData.credit_limit || 0),
        credit_days: Number(formData.credit_days || 0),
        is_active: formData.is_active,
        notes: JSON.stringify(extraMeta),
      }

      const supabase = requireSupabase()
      const session = (await supabase.auth.getSession()).data.session

      // In offline or demo/unauthenticated mode, update mock data directly
      if (isBackendOffline() || !session) {
        if (isEditing && formData.id) {
          const idx = MOCK_CUSTOMERS.findIndex(c => c.id === formData.id)
          if (idx >= 0 && MOCK_CUSTOMERS[idx]) {
            MOCK_CUSTOMERS[idx] = {
              ...MOCK_CUSTOMERS[idx],
              name: formData.name.trim(),
              phone: formData.phone.trim() || '',
              email: formData.email.trim() || '',
              address: formData.address.trim() || '',
              credit_limit: Number(formData.credit_limit || 0),
              is_active: formData.is_active,
            }
          }
        } else {
          MOCK_CUSTOMERS.unshift({
            id: `cust-${Date.now()}`,
            customer_code: formData.customer_code.trim() || `CUST-${Math.floor(1000 + Math.random() * 9000)}`,
            name: formData.name.trim(),
            phone: formData.phone.trim() || '',
            email: formData.email.trim() || '',
            address: formData.address.trim() || '',
            credit_limit: Number(formData.credit_limit || 0),
            current_balance: 0,
            is_active: formData.is_active,
          })
        }
        return
      }

      // Live Supabase update/insert
      if (isEditing && formData.id) {
        const { error } = await supabase
          .from('customers')
          .update(payload as never)
          .eq('id', formData.id)
        throwOnError(error)
      } else {
        const companyId = await currentCompanyId()
        const effectiveBranchId = branchId || ''
        if (!companyId || !effectiveBranchId) {
          throw new Error('Active Company and Branch required to register customer')
        }
        const insertPayload = {
          ...payload,
          company_id: companyId,
          branch_id: effectiveBranchId,
          customer_code: formData.customer_code.trim() || String(Math.floor(5800 + Math.random() * 500)),
          opening_balance: 0,
          opening_balance_type: 'debit',
          price_level: 'retail',
          sms_enabled: false,
        }
        const { error } = await supabase
          .from('customers')
          .insert(insertPayload as never)
        throwOnError(error)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers-list'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setShowModal(false)
      notify(isEditing ? 'Customer updated successfully' : 'Customer registered successfully')
    },
    onError: (err) => {
      setModalError(getErrorMessage(err))
    },
  })

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const supabase = requireSupabase()
      const session = (await supabase.auth.getSession()).data.session
      if (isBackendOffline() || !session) {
        const idx = MOCK_CUSTOMERS.findIndex(c => c.id === customerId)
        if (idx >= 0 && MOCK_CUSTOMERS[idx]) {
          MOCK_CUSTOMERS[idx].is_active = false
        }
        return
      }
      const { error } = await supabase
        .from('customers')
        .update({ is_active: false, deleted_at: new Date().toISOString() } as never)
        .eq('id', customerId)
      throwOnError(error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers-list'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      notify('Customer removed successfully')
    },
    onError: (err) => {
      notify(getErrorMessage(err), true)
    },
  })

  const handleDelete = (c: Customer) => {
    if (window.confirm(`Are you sure you want to deactivate customer "${c.name}" (${c.customer_code})?`)) {
      deleteMutation.mutate(c.id)
    }
  }

  // Add custom area
  const handleAddArea = () => {
    const trimmed = newAreaInput.trim()
    if (trimmed && !customAreas.includes(trimmed)) {
      setCustomAreas(prev => [trimmed, ...prev])
      setFormData(prev => ({ ...prev, area: trimmed }))
    }
    setNewAreaInput('')
    setShowAddAreaPrompt(false)
  }

  const totalPages = Math.max(1, Math.ceil((customersQuery.data?.count ?? 0) / pageSize))

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
            Customer Details
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
              ADD CUSTOMER
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
              placeholder="Search Customer - Press Enter"
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
          <button type="button" onClick={() => setToast(null)} style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Main Customer Table ──────────────────────────────────────────────── */}
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
              <th style={{ padding: '12px 14px' }}>FIRST NAME</th>
              <th style={{ padding: '12px 14px', width: '160px' }}>NICK NAME</th>
              <th style={{ padding: '12px 14px', width: '140px' }}>MOBILE</th>
              <th style={{ padding: '12px 14px' }}>ADDRESS</th>
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>STATUS</th>
              <th style={{ padding: '12px 14px', width: '100px', textAlign: 'center' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {customersQuery.isLoading ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#689d95' }}>
                  <RefreshCw className="animate-spin" style={{ display: 'inline-block', marginRight: '8px' }} size={18} />
                  Loading customers...
                </td>
              </tr>
            ) : (customersQuery.data?.rows.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#689d95' }}>
                  No customer records found.
                </td>
              </tr>
            ) : (
              customersQuery.data?.rows.map((row, idx) => {
                const isOdd = idx % 2 === 1
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid #0b2b27',
                      backgroundColor: isOdd ? '#06201d' : '#041816',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0c3530')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isOdd ? '#06201d' : '#041816')}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#e2e8f0' }}>
                      {row.customer_code}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#ffffff' }}>
                      {row.name}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                      {row.nick_name || '-'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#e2e8f0' }}>
                      {row.phone || '-'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                      {row.address || row.city || '-'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <span
                        style={{
                          backgroundColor: row.is_active ? '#00c853' : '#475569',
                          color: '#ffffff',
                          fontWeight: 800,
                          fontSize: '10px',
                          letterSpacing: '0.04em',
                          padding: '3px 10px',
                          borderRadius: '12px',
                          display: 'inline-block',
                        }}
                      >
                        {row.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(row)}
                          title="Edit Customer"
                          style={{
                            backgroundColor: '#0284c7',
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
                          onClick={() => handleDelete(row)}
                          title="Deactivate Customer"
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
                )
              })
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
            Showing {customersQuery.data?.rows.length ?? 0} of {customersQuery.data?.count ?? 0} customers
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

      {/* ── CUSTOMER REGISTRATION MODAL ─────────────────────────────────────── */}
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
              width: '900px',
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
                CUSTOMER REGISTRATION
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Register / Update Button */}
                <button
                  type="button"
                  disabled={saveCustomerMutation.isPending}
                  onClick={() => saveCustomerMutation.mutate()}
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
                  {saveCustomerMutation.isPending ? 'SAVING...' : isEditing ? 'UPDATE' : 'REGISTER'}
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

            {/* Sub-header Tab: GENERAL */}
            <div style={{ borderBottom: '2px solid #00b4d8', backgroundColor: '#051f1c', padding: '10px 0', textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <User size={20} color="#00b4d8" />
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#00b4d8', letterSpacing: '0.08em' }}>
                  GENERAL
                </span>
              </div>
            </div>

            {/* Error Message */}
            {modalError && (
              <div
                style={{
                  backgroundColor: '#7f1d1d',
                  border: '1px solid #ef4444',
                  color: '#ffffff',
                  padding: '10px 16px',
                  margin: '16px 20px 0',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            {/* Modal Body: 2 Columns */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '24px',
                padding: '20px',
              }}
            >
              {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderRight: '1px solid #144743', paddingRight: '24px' }}>
                {/* Customer Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    CUSTOMER NAME<span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Customer Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                {/* Nick Name */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    NICK NAME
                  </label>
                  <input
                    type="text"
                    placeholder="Nick Name"
                    value={formData.nick_name}
                    onChange={(e) => setFormData({ ...formData, nick_name: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                {/* NIC */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    NIC
                  </label>
                  <input
                    type="text"
                    placeholder="Nic Number"
                    value={formData.nic}
                    onChange={(e) => setFormData({ ...formData, nic: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                {/* Mobile No & Telephone No */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                      MOBILE NO
                    </label>
                    <input
                      type="text"
                      placeholder="Mobile NO"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                      TELEPHONE NO
                    </label>
                    <input
                      type="text"
                      placeholder="Telephone NO"
                      value={formData.alternate_phone}
                      onChange={(e) => setFormData({ ...formData, alternate_phone: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Permanent Address */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    PERMANENT ADRESS
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Permanent Address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                {/* Area with (+) Button */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8' }}>
                      AREA
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAddAreaPrompt(true)}
                      title="Add New Area"
                      style={{
                        backgroundColor: '#0284c7',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '50%',
                        width: '16px',
                        height: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={10} />
                    </button>
                  </div>

                  {showAddAreaPrompt ? (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                      <input
                        type="text"
                        placeholder="Enter Area Name"
                        value={newAreaInput}
                        onChange={(e) => setNewAreaInput(e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleAddArea}
                        style={{
                          backgroundColor: '#00b4d8',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddAreaPrompt(false)}
                        style={{
                          backgroundColor: '#475569',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formData.area}
                      onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                      style={selectStyle}
                    >
                      {customAreas.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    EMAIL
                  </label>
                  <input
                    type="email"
                    placeholder="abc@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                {/* Join Date & Payment Plan */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                      JOIN DATE
                    </label>
                    <input
                      type="date"
                      value={formData.join_date}
                      onChange={(e) => setFormData({ ...formData, join_date: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                      PAYMENT PLAN
                    </label>
                    <select
                      value={formData.payment_plan}
                      onChange={(e) => setFormData({ ...formData, payment_plan: e.target.value })}
                      style={selectStyle}
                    >
                      <option value="None">None</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Bi-Weekly">Bi-Weekly</option>
                      <option value="Monthly">Monthly</option>
                      <option value="Credit 30 Days">Credit 30 Days</option>
                    </select>
                  </div>
                </div>

                {/* Customer Type */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    CUSTOMER TYPE
                  </label>
                  <select
                    value={formData.customer_type}
                    onChange={(e) => setFormData({ ...formData, customer_type: e.target.value })}
                    style={selectStyle}
                  >
                    <option value="retail">Retail</option>
                    <option value="wholesale">Wholesale</option>
                    <option value="corporate">Corporate</option>
                    <option value="dealer">Dealer</option>
                  </select>
                </div>
              </div>

              {/* ── RIGHT COLUMN ─────────────────────────────────────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Vat No & Vat Percentage */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                      VAT NO
                    </label>
                    <input
                      type="text"
                      placeholder="Vat NO"
                      value={formData.vat_no}
                      onChange={(e) => setFormData({ ...formData, vat_no: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                      VAT PERCENTAGE
                    </label>
                    <input
                      type="number"
                      placeholder="VAT (%)"
                      value={formData.vat_percentage || ''}
                      onChange={(e) => setFormData({ ...formData, vat_percentage: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Discount Level */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    DISCOUNT LEVEL
                  </label>
                  <select
                    value={formData.discount_level}
                    onChange={(e) => setFormData({ ...formData, discount_level: e.target.value })}
                    style={selectStyle}
                  >
                    <option value="none">none</option>
                    <option value="Level 1">Level 1 (5%)</option>
                    <option value="Level 2">Level 2 (10%)</option>
                    <option value="Level 3">Level 3 (15%)</option>
                  </select>
                </div>

                {/* Credit Limit & Dealer Code */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                      CREDIT LIMIT
                    </label>
                    <input
                      type="number"
                      placeholder="Credit Limit"
                      value={formData.credit_limit || ''}
                      onChange={(e) => setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                      DEALER CODE
                    </label>
                    <input
                      type="text"
                      placeholder="Dealer Code"
                      value={formData.dealer_code}
                      onChange={(e) => setFormData({ ...formData, dealer_code: e.target.value })}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Due Days */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    DUE DAYS
                  </label>
                  <input
                    type="number"
                    placeholder="Due days"
                    value={formData.credit_days || ''}
                    onChange={(e) => setFormData({ ...formData, credit_days: parseInt(e.target.value, 10) || 0 })}
                    style={inputStyle}
                  />
                </div>

                {/* Sales Rep */}
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    SALES REP
                  </label>
                  <select
                    value={formData.sales_rep_id}
                    onChange={(e) => {
                      const selectedStaff = staffQuery.data?.find((s) => s.id === e.target.value)
                      setFormData({
                        ...formData,
                        sales_rep_id: e.target.value,
                        sales_rep_name: selectedStaff ? `${selectedStaff.staff_code} - ${selectedStaff.full_name}` : '',
                      })
                    }}
                    style={{ ...selectStyle, backgroundColor: '#ffffff', color: '#0f172a' }}
                  >
                    <option value="">-- Select Sales Rep --</option>
                    {staffQuery.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.staff_code} - {s.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Active Checkbox */}
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <div
                      onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '3px',
                        backgroundColor: formData.is_active ? '#00b4d8' : '#092a26',
                        border: '1px solid #17534c',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      {formData.is_active && <Check size={14} color="#ffffff" />}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>
                      ACTIVE
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Shared Input & Select Styles ───────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#092a26',
  border: '1px solid #17534c',
  borderRadius: '4px',
  color: '#ffffff',
  padding: '8px 12px',
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#092a26',
  border: '1px solid #17534c',
  borderRadius: '4px',
  color: '#ffffff',
  padding: '8px 12px',
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
  cursor: 'pointer',
}
