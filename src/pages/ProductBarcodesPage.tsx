import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Edit2,
  X,
  FileText,
  Barcode as BarcodeIcon,
  Printer,
  Sparkles,
  AlertTriangle,
} from 'lucide-react'
import {
  listProductBarcodes,
  listVariantsForBarcode,
  createProductBarcode,
  updateProductBarcode,
  deleteProductBarcode,
  type ProductBarcodeRow,
  type VariantOption,
} from '../services/productBarcodes'
import { generateBarcodeSvg } from '../lib/barcodeGenerator'
import { getErrorMessage } from '../lib/errors'

export const ProductBarcodesPage: React.FC = () => {
  const queryClient = useQueryClient()

  // State
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'primary' | 'secondary'>('all')
  const [page, setPage] = useState(1)
  const pageSize = 15

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  // Form Fields
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [barcodeValue, setBarcodeValue] = useState('')
  const [barcodeType, setBarcodeType] = useState('CODE128')
  const [packQuantity, setPackQuantity] = useState<number>(1)
  const [isPrimary, setIsPrimary] = useState(false)

  // Print Modal State
  const [printRow, setPrintRow] = useState<ProductBarcodeRow | null>(null)
  const [printCopies, setPrintCopies] = useState(1)

  // Toast
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null)
  const notify = (message: string, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 3500)
  }

  // Load Barcodes
  const barcodesQuery = useQuery({
    queryKey: ['product-barcodes-list', appliedSearch, filterType, page],
    queryFn: () =>
      listProductBarcodes({
        search: appliedSearch || undefined,
        filterType,
        page,
        pageSize,
      }),
  })

  // Load Product Variants for selection
  const variantsQuery = useQuery({
    queryKey: ['variants-for-barcode'],
    queryFn: () => listVariantsForBarcode(),
    enabled: showModal,
  })

  const barcodeRows = barcodesQuery.data?.rows ?? []
  const totalCount = barcodesQuery.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Generate a random unique barcode
  const handleGenerateBarcode = () => {
    const timestamp = Date.now().toString().slice(-6)
    const random = Math.floor(1000 + Math.random() * 9000)
    setBarcodeValue(`200${timestamp}${random}`)
  }

  const handleOpenAdd = () => {
    setIsEditing(false)
    setEditingId(null)
    setSelectedVariantId(variantsQuery.data?.[0]?.variant_id || '')
    handleGenerateBarcode()
    setBarcodeType('CODE128')
    setPackQuantity(1)
    setIsPrimary(false)
    setModalError(null)
    setShowModal(true)
  }

  const handleOpenEdit = (row: ProductBarcodeRow) => {
    setIsEditing(true)
    setEditingId(row.id)
    setSelectedVariantId(row.product_variant_id)
    setBarcodeValue(row.barcode)
    setBarcodeType(row.barcode_type || 'CODE128')
    setPackQuantity(row.pack_quantity || 1)
    setIsPrimary(row.is_primary)
    setModalError(null)
    setShowModal(true)
  }

  // Live Barcode Preview SVG
  const modalBarcodeSvg = useMemo(() => {
    if (!barcodeValue.trim()) return ''
    try {
      return generateBarcodeSvg(barcodeValue.trim(), {
        height: 48,
        fontSize: 11,
        showText: true,
      })
    } catch {
      return ''
    }
  }, [barcodeValue])

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!barcodeValue.trim()) {
        throw new Error('Barcode value is required.')
      }
      if (!selectedVariantId) {
        throw new Error('Please select a product variant.')
      }

      if (isEditing && editingId) {
        return updateProductBarcode({
          id: editingId,
          product_variant_id: selectedVariantId,
          barcode: barcodeValue.trim(),
          barcode_type: barcodeType,
          pack_quantity: Number(packQuantity) || 1,
          is_primary: isPrimary,
        })
      } else {
        return createProductBarcode({
          product_variant_id: selectedVariantId,
          barcode: barcodeValue.trim(),
          barcode_type: barcodeType,
          pack_quantity: Number(packQuantity) || 1,
          is_primary: isPrimary,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-barcodes-list'] })
      queryClient.invalidateQueries({ queryKey: ['variants-for-barcode'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      notify(isEditing ? 'Barcode updated successfully' : 'Barcode registered successfully')
      setShowModal(false)
    },
    onError: (err) => {
      setModalError(getErrorMessage(err))
    },
  })

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return deleteProductBarcode(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-barcodes-list'] })
      queryClient.invalidateQueries({ queryKey: ['variants-for-barcode'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      notify('Barcode removed successfully')
    },
    onError: (err) => {
      notify(getErrorMessage(err), true)
    },
  })

  // Trigger browser print
  const handlePrint = () => {
    window.print()
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
            Product Barcodes
          </h2>
          <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
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
              ADD BARCODE
            </button>
          </div>
        </div>

        {/* Filter Dropdown + Search Box on Right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Status Filter */}
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value as 'all' | 'primary' | 'secondary')
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
            <option value="all" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All Barcodes</option>
            <option value="primary" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Primary Only</option>
            <option value="secondary" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Secondary Only</option>
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
              placeholder="Search Barcode / SKU / Name"
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

      {/* ── Main Barcodes Table ─────────────────────────────────────────────── */}
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
              <th style={{ padding: '12px 14px', width: '160px' }}>BARCODE</th>
              <th style={{ padding: '12px 14px', width: '110px' }}>CODE</th>
              <th style={{ padding: '12px 14px' }}>PRODUCT NAME</th>
              <th style={{ padding: '12px 14px', width: '150px' }}>VARIANT / SKU</th>
              <th style={{ padding: '12px 14px', width: '90px' }}>TYPE</th>
              <th style={{ padding: '12px 14px', width: '80px', textAlign: 'center' }}>PACK QTY</th>
              <th style={{ padding: '12px 14px', width: '110px', textAlign: 'center' }}>STATUS</th>
              <th style={{ padding: '12px 14px', width: '110px', textAlign: 'center' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {barcodesQuery.isLoading ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Loading barcodes...
                </td>
              </tr>
            ) : barcodeRows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  No barcodes found matching criteria.
                </td>
              </tr>
            ) : (
              barcodeRows.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: '1px solid #092f2b',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#082d29')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {/* Barcode */}
                  <td style={{ padding: '12px 14px', fontWeight: 800, color: '#f8fafc', letterSpacing: '0.06em' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <BarcodeIcon size={16} color="#00b4d8" />
                      <span>{row.barcode}</span>
                    </div>
                  </td>

                  {/* Product Code */}
                  <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                    {row.product_code || '-'}
                  </td>

                  {/* Product Name */}
                  <td style={{ padding: '12px 14px', color: '#e2e8f0', fontWeight: 600 }}>
                    {row.product_name}
                  </td>

                  {/* Variant / SKU */}
                  <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                    {row.variant_name} {row.sku && `(${row.sku})`}
                  </td>

                  {/* Type */}
                  <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                    {row.barcode_type}
                  </td>

                  {/* Pack Quantity */}
                  <td style={{ padding: '12px 14px', textAlign: 'center', color: '#e2e8f0', fontWeight: 700 }}>
                    {row.pack_quantity}
                  </td>

                  {/* Primary Status Capsule */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 12px',
                        borderRadius: '12px',
                        fontSize: '10px',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        backgroundColor: row.is_primary ? '#065f46' : '#1e293b',
                        color: row.is_primary ? '#34d399' : '#94a3b8',
                        border: `1px solid ${row.is_primary ? '#059669' : '#334155'}`,
                      }}
                    >
                      {row.is_primary ? 'PRIMARY' : 'SECONDARY'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                      {/* Print Preview Button */}
                      <button
                        type="button"
                        title="Print Barcode Label"
                        onClick={() => {
                          setPrintRow(row)
                          setPrintCopies(1)
                        }}
                        style={{
                          backgroundColor: '#0d9488',
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
                        <Printer size={13} />
                      </button>

                      {/* Edit Button */}
                      <button
                        type="button"
                        title="Edit Barcode"
                        onClick={() => handleOpenEdit(row)}
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
                        title="Delete Barcode"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Are you sure you want to delete barcode "${row.barcode}" for ${row.product_name}?`
                            )
                          ) {
                            deleteMutation.mutate(row.id)
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
            Showing {barcodeRows.length} of {totalCount} barcodes
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

      {/* ── BARCODE REGISTRATION MODAL ──────────────────────────────────────── */}
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
              width: '740px',
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
                {isEditing ? 'UPDATE PRODUCT BARCODE' : 'BARCODE REGISTRATION'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Register / Update Button */}
                <button
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
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
                  {saveMutation.isPending ? 'SAVING...' : isEditing ? 'UPDATE' : 'REGISTER'}
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
              {/* Variant Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                  SELECT PRODUCT / VARIANT <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
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
                  <option value="" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Select Product Variant</option>
                  {(variantsQuery.data ?? []).map((v: VariantOption) => (
                    <option key={v.variant_id} value={v.variant_id} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>
                      [{v.product_code}] {v.product_name} - {v.variant_name} (SKU: {v.sku})
                    </option>
                  ))}
                </select>
              </div>

              {/* Barcode & Generate Button */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                  BARCODE NUMBER <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    placeholder="Scan or Enter Barcode"
                    value={barcodeValue}
                    onChange={(e) => setBarcodeValue(e.target.value)}
                    style={{
                      flex: 1,
                      backgroundColor: '#0c2e2a',
                      border: '1px solid #164e48',
                      borderRadius: '4px',
                      color: '#ffffff',
                      padding: '9px 12px',
                      fontSize: '14px',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleGenerateBarcode}
                    style={{
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '0 16px',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Sparkles size={14} /> Auto-Generate
                  </button>
                </div>
              </div>

              {/* Grid: Barcode Type, Pack Qty, Is Primary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '16px', alignItems: 'center' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                    BARCODE TYPE
                  </label>
                  <select
                    value={barcodeType}
                    onChange={(e) => setBarcodeType(e.target.value)}
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
                    <option value="CODE128" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>CODE128 (Standard)</option>
                    <option value="EAN13" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>EAN-13</option>
                    <option value="UPCA" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>UPC-A</option>
                    <option value="CUSTOM" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>CUSTOM / INTERNAL</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', letterSpacing: '0.05em' }}>
                    PACK QUANTITY
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={packQuantity}
                    onChange={(e) => setPackQuantity(parseInt(e.target.value, 10) || 1)}
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

                <div style={{ paddingTop: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em' }}>
                    <input
                      type="checkbox"
                      checked={isPrimary}
                      onChange={(e) => setIsPrimary(e.target.checked)}
                      style={{ accentColor: '#00b4d8', width: '16px', height: '16px' }}
                    />
                    PRIMARY BARCODE
                  </label>
                </div>
              </div>

              {/* Barcode Vector Preview Box */}
              {modalBarcodeSvg && (
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    padding: '16px',
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                    marginTop: '8px',
                  }}
                >
                  <div
                    dangerouslySetInnerHTML={{ __html: modalBarcodeSvg }}
                    style={{ display: 'flex', justifyContent: 'center', width: '100%', maxWidth: '320px' }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PRINT MODAL ─────────────────────────────────────────────────────── */}
      {printRow && (
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
              width: '450px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                PRINT BARCODE LABEL
              </h3>
              <button
                type="button"
                onClick={() => setPrintRow(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Label Preview Card */}
            <div
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                padding: '14px',
                borderRadius: '4px',
                textAlign: 'center',
                marginBottom: '16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '2px' }}>
                BABY BLOOM
              </div>
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                {printRow.product_name}
              </div>
              <div
                dangerouslySetInnerHTML={{
                  __html: generateBarcodeSvg(printRow.barcode, {
                    height: 44,
                    fontSize: 10,
                    showText: true,
                  }),
                }}
                style={{ display: 'flex', justifyContent: 'center' }}
              />
              <div style={{ fontSize: '13px', fontWeight: 900, marginTop: '6px' }}>
                LKR {printRow.retail_price?.toLocaleString() || '0.00'}
              </div>
            </div>

            {/* Copies control */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>Number of Copies:</label>
              <input
                type="number"
                min="1"
                max="100"
                value={printCopies}
                onChange={(e) => setPrintCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  width: '80px',
                  backgroundColor: '#0c2e2a',
                  border: '1px solid #164e48',
                  borderRadius: '4px',
                  color: '#ffffff',
                  padding: '6px 10px',
                  textAlign: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  outline: 'none',
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handlePrint}
                style={{
                  flex: 1,
                  backgroundColor: '#00b4d8',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '10px 0',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Printer size={16} /> PRINT NOW
              </button>
              <button
                type="button"
                onClick={() => setPrintRow(null)}
                style={{
                  backgroundColor: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '10px 18px',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductBarcodesPage
