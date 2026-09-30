import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Barcode, Edit2, Globe, Package, Plus, RefreshCw,
  Settings, Trash2, X
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import { requireSupabase, throwOnError } from '../services/client'
import {
  createMasterRecord, createProductWithVariant, currentCompanyId,
  getMasterRecord, listLookup, nextMasterCode, setMasterActive,
  updateMasterRecord
} from '../services/masterData'
import { listProductVariants } from '../services/productVariants'
import { getErrorMessage } from '../lib/errors'
import { WooCommerceSettingsModal } from '../components/common/WooCommerceSettingsModal'
import { getWooCommerceConfig, syncProductToWooCommerce } from '../services/woocommerce'

// ── Types & Interfaces ────────────────────────────────────────────────────────
interface ProductFormState {
  product_name: string
  category_id: string
  model_no: string
  brand_id: string
  color: string
  others: string
  sku: string
  service_type: string
  main_unit: 'unit1' | 'unit2'
  unit1_name: string
  unit1_price: number
  unit1_mrp: number
  unit2_name: string
  unit2_diff: string
  unit2_price: number
  barcodes: string[]
  selected_branches: string[]
  extra_type: string
  bundle: string
  min_stock: number
  vendor_id: string
  commission_pct: number
  due_days: number
  section: string
  discount_level: string
  profit_limit_pct: number
  wl_sales_price: number
  wl_cost: number
  inv_discount_pct: number
  inv_discount_amt: number
  pur_discount_pct: number
  vat_pct: number
  min_price: number
  expiry_alert_days: number
  price_tiers: {
    price1: number
    price2: number
    price3: number
    price4: number
  }
  flags: {
    hide_cost: boolean
    manufacturer: boolean
    supplies: boolean
    imei_serial: boolean
    remark_no: boolean
    assign_report: boolean
    show_expiry: boolean
    no_discount: boolean
    active: boolean
  }
  stock_location: string
  image_url: string
}

const defaultFormState: ProductFormState = {
  product_name: '',
  category_id: '',
  model_no: '',
  brand_id: '',
  color: '',
  others: '',
  sku: '',
  service_type: 'Item',
  main_unit: 'unit1',
  unit1_name: 'PCS',
  unit1_price: 0,
  unit1_mrp: 0,
  unit2_name: '',
  unit2_diff: '',
  unit2_price: 0,
  barcodes: [],
  selected_branches: [],
  extra_type: '',
  bundle: '',
  min_stock: 0,
  vendor_id: '',
  commission_pct: 0,
  due_days: 0,
  section: 'SECTION A',
  discount_level: 'LEVEL 1',
  profit_limit_pct: 0,
  wl_sales_price: 0,
  wl_cost: 0,
  inv_discount_pct: 0,
  inv_discount_amt: 0,
  pur_discount_pct: 0,
  vat_pct: 0,
  min_price: 0,
  expiry_alert_days: 0,
  price_tiers: {
    price1: 0,
    price2: 0,
    price3: 0,
    price4: 0,
  },
  flags: {
    hide_cost: false,
    manufacturer: false,
    supplies: false,
    imei_serial: false,
    remark_no: false,
    assign_report: true,
    show_expiry: false,
    no_discount: false,
    active: true,
  },
  stock_location: 'RC001',
  image_url: '',
}

export function ProductsPage() {
  const { id } = useParams()
  const isFormRoute = id === 'new' || Boolean(id)

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
      {isFormRoute ? (
        <ProductFormView key={id} editingId={id === 'new' ? null : (id ?? null)} />
      ) : (
        <ProductListView />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 1. PRODUCT LIST VIEW (SCREENSHOT 1)
// ────────────────────────────────────────────────────────────────────────────
function ProductListView() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const permissions = useAuthStore(s => s.user?.permissions)
  const canCost = permissions?.includes('products.view_cost') ?? true

  const [pageSize, setPageSize] = useState<number>(100)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name_asc' | 'code_asc'>('newest')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [barcodeModalProduct, setBarcodeModalProduct] = useState<{ id: string; name: string; code: string; variantId: string } | null>(null)
  const [modalNewBarcode, setModalNewBarcode] = useState('')
  const [wooModalOpen, setWooModalOpen] = useState(false)
  const [syncToast, setSyncToast] = useState<{ message: string; isError?: boolean } | null>(null)

  const handleQuickSyncToWoo = async (row: {
    id: string
    product_code: string
    name: string
    image_url: string | null
    category?: { id: string; name: string } | null
    variants?: Array<{
      sku: string
      retail_price: number
    }>
  }) => {
    const primaryVar = row.variants?.[0]
    setSyncToast({ message: `Syncing "${row.name}" to WooCommerce...` })
    const res = await syncProductToWooCommerce({
      name: row.name,
      sku: primaryVar?.sku || row.product_code,
      regular_price: primaryVar?.retail_price ? String(primaryVar.retail_price) : undefined,
      categories: row.category?.name ? [{ name: row.category.name }] : undefined,
      images: row.image_url ? [{ src: row.image_url }] : undefined,
      status: 'publish',
    })
    setSyncToast({ message: res.message, isError: !res.success })
    setTimeout(() => setSyncToast(null), 4000)
  }

  const categories = useQuery({ queryKey: ['lookup', 'categories'], queryFn: () => listLookup('categories', 'name', { is_active: true }) })

  const productsQuery = useQuery({
    queryKey: ['products-emark-list', page, pageSize, sortBy, categoryFilter, statusFilter, search],
    queryFn: async () => {
      let query = requireSupabase()
        .from('products')
        .select(`
          id,
          product_code,
          name,
          product_status,
          created_at,
          category_id,
          brand_id,
          image_url,
          category:categories(id, name),
          variants:product_variants(
            id,
            sku,
            barcode,
            retail_price,
            purchase_price,
            average_cost,
            attributes,
            is_default,
            is_active
          )
        `, { count: 'exact' })

      if (categoryFilter !== 'all') {
        query = query.eq('category_id', categoryFilter)
      }
      if (statusFilter !== 'all') {
        query = query.eq('product_status', statusFilter)
      }
      if (search.trim()) {
        const s = search.trim().replaceAll(',', ' ').replaceAll('%', '\\%')
        query = query.or(`product_code.ilike.%${s}%,name.ilike.%${s}%`)
      }

      if (sortBy === 'newest') query = query.order('created_at', { ascending: false })
      else if (sortBy === 'oldest') query = query.order('created_at', { ascending: true })
      else if (sortBy === 'name_asc') query = query.order('name', { ascending: true })
      else if (sortBy === 'code_asc') query = query.order('product_code', { ascending: true })

      const from = (page - 1) * pageSize
      query = query.range(from, from + pageSize - 1)

      const { data, count, error } = await query
      throwOnError(error)

      return {
        rows: (data ?? []) as Array<{
          id: string
          product_code: string
          name: string
          product_status: string
          created_at: string
          category_id: string
          brand_id: string
          image_url: string | null
          category?: { id: string; name: string } | null
          variants?: Array<{
            id: string
            sku: string
            barcode: string | null
            retail_price: number
            purchase_price: number
            average_cost: number
            attributes: Record<string, unknown>
            is_default: boolean
            is_active: boolean
          }>
        }>,
        count: count ?? 0,
      }
    },
    placeholderData: keepPreviousData,
  })

  // Barcode modal query
  const barcodeListQuery = useQuery({
    queryKey: ['product-barcodes', barcodeModalProduct?.variantId],
    queryFn: async () => {
      if (!barcodeModalProduct?.variantId) return []
      const { data, error } = await requireSupabase()
        .from('product_barcodes')
        .select('id, barcode, barcode_type, is_primary')
        .eq('product_variant_id', barcodeModalProduct.variantId)
        .order('is_primary', { ascending: false })
      throwOnError(error)
      return (data ?? []) as Array<{ id: string; barcode: string; barcode_type: string; is_primary: boolean }>
    },
    enabled: Boolean(barcodeModalProduct?.variantId),
  })

  const addBarcodeModalMutation = useMutation({
    mutationFn: async (code: string) => {
      if (!barcodeModalProduct?.variantId || !code.trim()) return
      const compId = await currentCompanyId()
      const { error } = await requireSupabase()
        .from('product_barcodes')
        .insert({
          company_id: compId,
          product_variant_id: barcodeModalProduct.variantId,
          barcode: code.trim(),
          barcode_type: 'CODE128',
          pack_quantity: 1,
          is_primary: false,
        } as never)
      throwOnError(error)
    },
    onSuccess: async () => {
      setModalNewBarcode('')
      await queryClient.invalidateQueries({ queryKey: ['product-barcodes', barcodeModalProduct?.variantId] })
      await queryClient.invalidateQueries({ queryKey: ['products-emark-list'] })
    },
  })

  const removeBarcodeModalMutation = useMutation({
    mutationFn: async (barcodeId: string) => {
      const { error } = await requireSupabase()
        .from('product_barcodes')
        .delete()
        .eq('id', barcodeId)
      throwOnError(error)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['product-barcodes', barcodeModalProduct?.variantId] })
      await queryClient.invalidateQueries({ queryKey: ['products-emark-list'] })
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ prodId, currentStatus }: { prodId: string; currentStatus: string }) => {
      const nextStatus = currentStatus !== 'active'
      await setMasterActive('products', prodId, nextStatus, 'product_status')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products-emark-list'] })
    },
  })

  const totalPages = Math.max(1, Math.ceil((productsQuery.data?.count ?? 0) / pageSize))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
            Product Details
          </h2>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => navigate('/products/new')}
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
                boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
              }}
            >
              ADD PRODUCT
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                backgroundColor: '#00c853',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 18px',
                fontWeight: 800,
                fontSize: '12px',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0, 200, 83, 0.4)',
              }}
            >
              PRINT
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setWooModalOpen(true)}
          style={{
            background: '#0a2a26',
            border: '1px solid #164e48',
            borderRadius: '6px',
            padding: '8px',
            color: '#94a3b8',
            cursor: 'pointer',
          }}
          title="WooCommerce Website Sync Settings"
        >
          <Settings size={18} />
        </button>
      </div>

      {syncToast && (
        <div
          style={{
            backgroundColor: syncToast.isError ? '#7f1d1d' : '#064e3b',
            border: `1px solid ${syncToast.isError ? '#ef4444' : '#10b981'}`,
            color: '#ffffff',
            padding: '10px 14px',
            borderRadius: '4px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Globe size={16} color={syncToast.isError ? '#f87171' : '#34d399'} />
          <span style={{ fontWeight: 600 }}>{syncToast.message}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div
        style={{
          backgroundColor: '#041c19',
          border: '1px solid #144743',
          borderRadius: '4px',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, color: '#38d4c5' }}>
          <span>SHOW</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
            style={{
              backgroundColor: '#0c2e2a',
              border: '1px solid #164e48',
              color: '#ffffff',
              padding: '6px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 700,
              outline: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <option value={10} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>10</option>
            <option value={25} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>25</option>
            <option value={50} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>50</option>
            <option value={100} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>100</option>
          </select>
          <span>ENTRIES</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* SORT */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>SORT :</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              style={{
                backgroundColor: '#0c2e2a',
                border: '1px solid #164e48',
                color: '#ffffff',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
            >
              <option value="newest" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Newest First</option>
              <option value="oldest" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Oldest First</option>
              <option value="name_asc" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Name (A-Z)</option>
              <option value="code_asc" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Code (Asc)</option>
            </select>
          </div>

          {/* CATEGORY */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>CATEGORY :</span>
            <select
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}
              style={{
                backgroundColor: '#0c2e2a',
                border: '1px solid #164e48',
                color: '#ffffff',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
            >
              <option value="all" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>View All</option>
              {categories.data?.map(c => (
                <option key={c.value} value={c.value} style={{ backgroundColor: '#041c19', color: '#ffffff' }}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* STATUS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>STATUS :</span>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              style={{
                backgroundColor: '#0c2e2a',
                border: '1px solid #164e48',
                color: '#ffffff',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}
            >
              <option value="active" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Active</option>
              <option value="inactive" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>Inactive</option>
              <option value="all" style={{ backgroundColor: '#041c19', color: '#ffffff' }}>All</option>
            </select>
          </div>

          {/* SEARCH */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.05em' }}>SEARCH :</span>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder=""
                style={{
                  backgroundColor: '#0c2e2a',
                  border: '1px solid #164e48',
                  color: '#ffffff',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  outline: 'none',
                  width: '180px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div
        style={{
          backgroundColor: '#041c19',
          border: '1px solid #144743',
          borderRadius: '4px',
          overflowX: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#031413', borderBottom: '1px solid #144743', color: '#38d4c5', fontSize: '11px', fontWeight: 800, letterSpacing: '0.05em' }}>
              <th style={{ padding: '12px 14px', width: '60px' }}></th>
              <th style={{ padding: '12px 14px' }}>ITEM</th>
              <th style={{ padding: '12px 14px' }}>CATEGORY</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>COST</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>SALES PRICE</th>
              <th style={{ padding: '12px 14px', textAlign: 'right' }}>MRP</th>
              <th style={{ padding: '12px 14px', textAlign: 'center' }}>STATUS</th>
              <th style={{ padding: '12px 14px', textAlign: 'center' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {productsQuery.isLoading ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#689d95' }}>
                  <RefreshCw className="animate-spin" style={{ display: 'inline-block', marginRight: '8px' }} size={16} />
                  Loading products...
                </td>
              </tr>
            ) : productsQuery.data?.rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#689d95' }}>
                  No products found matching the criteria.
                </td>
              </tr>
            ) : (
              productsQuery.data?.rows.map((row) => {
                const primaryVariant = row.variants?.[0]
                const retailPrice = Number(primaryVariant?.retail_price || 0)
                const costPrice = Number(primaryVariant?.average_cost || primaryVariant?.purchase_price || 0)
                const rawAttrs = primaryVariant?.attributes as Record<string, unknown> | undefined
                const rawUnit1 = rawAttrs?.unit1
                const mrpPrice = Number(rawUnit1 && typeof rawUnit1 === 'object' ? (rawUnit1 as Record<string, unknown>).mrp : 0)

                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid #0d302c',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.04)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {/* Thumbnail */}
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '4px',
                          backgroundColor: '#0c2e2a',
                          border: '1px solid #1a564f',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {row.image_url ? (
                          <img src={row.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <Package size={18} color="#2dd4bf" />
                        )}
                      </div>
                    </td>

                    {/* ITEM */}
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontWeight: 600, color: '#ffffff' }}>
                      {row.product_code} - {row.name}
                    </td>

                    {/* CATEGORY */}
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>
                      {row.category?.name || '-'}
                    </td>

                    {/* COST */}
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'right', color: '#cbd5e1', fontSize: '13px' }}>
                      {canCost ? (costPrice > 0 ? costPrice.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00') : '***'}
                    </td>

                    {/* SALES PRICE */}
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'right', fontWeight: 700, color: '#ffffff', fontSize: '13px' }}>
                      {retailPrice.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* MRP */}
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'right', color: '#94a3b8', fontSize: '13px' }}>
                      {mrpPrice.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* STATUS */}
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                      <span
                        style={{
                          backgroundColor: row.product_status === 'active' ? '#10b981' : '#64748b',
                          color: '#ffffff',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {row.product_status === 'active' ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>

                    {/* ACTION */}
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        {/* Barcode Manager Button (Purple) */}
                        <button
                          type="button"
                          onClick={() => {
                            if (primaryVariant?.id) {
                              setBarcodeModalProduct({
                                id: row.id,
                                name: row.name,
                                code: row.product_code,
                                variantId: primaryVariant.id,
                              })
                            }
                          }}
                          title="Manage Barcodes"
                          style={{
                            backgroundColor: '#8b5cf6',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '5px 7px',
                            cursor: 'pointer',
                            display: 'grid',
                            placeItems: 'center',
                            boxShadow: '0 2px 4px rgba(139, 92, 246, 0.3)',
                          }}
                        >
                          <Barcode size={13} />
                        </button>

                        {/* Toggle Active Button (Red) */}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to toggle status for "${row.name}"?`)) {
                              toggleStatusMutation.mutate({ prodId: row.id, currentStatus: row.product_status })
                            }
                          }}
                          title="Toggle Active / Inactive"
                          style={{
                            backgroundColor: '#ef4444',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '5px 7px',
                            cursor: 'pointer',
                            display: 'grid',
                            placeItems: 'center',
                            boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
                          }}
                        >
                          <X size={13} />
                        </button>

                        {/* Edit Button (Blue) */}
                        <button
                          type="button"
                          onClick={() => navigate(`/products/${row.id}`)}
                          title="Edit Product"
                          style={{
                            backgroundColor: '#00b4d8',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '5px 7px',
                            cursor: 'pointer',
                            display: 'grid',
                            placeItems: 'center',
                            boxShadow: '0 2px 4px rgba(0, 180, 216, 0.3)',
                          }}
                        >
                          <Edit2 size={13} />
                        </button>

                        {/* Sync to WooCommerce (Green) */}
                        <button
                          type="button"
                          onClick={() => void handleQuickSyncToWoo(row)}
                          title="Sync to WooCommerce Website"
                          style={{
                            backgroundColor: '#059669',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '5px 7px',
                            cursor: 'pointer',
                            display: 'grid',
                            placeItems: 'center',
                            boxShadow: '0 2px 4px rgba(5, 150, 105, 0.3)',
                          }}
                        >
                          <Globe size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#689d95', padding: '4px 0' }}>
        <span>
          Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, productsQuery.data?.count ?? 0)} of {productsQuery.data?.count ?? 0} entries
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{
              backgroundColor: '#082623',
              border: '1px solid #1a564f',
              color: page <= 1 ? '#475569' : '#ffffff',
              padding: '5px 12px',
              borderRadius: '4px',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
            }}
          >
            Previous
          </button>
          <span style={{ padding: '5px 8px', fontWeight: 700, color: '#ffffff' }}>{page}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{
              backgroundColor: '#082623',
              border: '1px solid #1a564f',
              color: page >= totalPages ? '#475569' : '#ffffff',
              padding: '5px 12px',
              borderRadius: '4px',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
      </div>

      {/* Barcode Manager Modal */}
      {barcodeModalProduct && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#072421', border: '1px solid #164e48', borderRadius: '8px', padding: '20px', width: '460px', maxWidth: '90vw', color: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Barcode size={18} color="#8b5cf6" />
                  Barcodes: {barcodeModalProduct.name}
                </h3>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Code: {barcodeModalProduct.code}</span>
              </div>
              <button type="button" onClick={() => setBarcodeModalProduct(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                value={modalNewBarcode}
                onChange={e => setModalNewBarcode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBarcodeModalMutation.mutate(modalNewBarcode) } }}
                placeholder="Scan or type new barcode..."
                style={{ flex: 1, backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '4px', color: '#ffffff', padding: '6px 10px', fontSize: '13px' }}
              />
              <button
                type="button"
                disabled={!modalNewBarcode.trim() || addBarcodeModalMutation.isPending}
                onClick={() => addBarcodeModalMutation.mutate(modalNewBarcode)}
                style={{ backgroundColor: '#00c853', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '6px 14px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
              >
                + Add
              </button>
            </div>

            {addBarcodeModalMutation.isError && (
              <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '10px' }}>
                {getErrorMessage(addBarcodeModalMutation.error)}
              </div>
            )}

            <div style={{ border: '1px solid #164e48', borderRadius: '4px', backgroundColor: '#02100f', maxHeight: '200px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#010a09', borderBottom: '1px solid #103b36', color: '#689d95', fontSize: '10px' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>BARCODE</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left' }}>TYPE</th>
                    <th style={{ padding: '6px 10px', textAlign: 'center', width: '50px' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {barcodeListQuery.isLoading ? (
                    <tr><td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: '#689d95' }}>Loading...</td></tr>
                  ) : barcodeListQuery.data?.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: '#475569' }}>No secondary barcodes registered.</td></tr>
                  ) : (
                    barcodeListQuery.data?.map(b => (
                      <tr key={b.id} style={{ borderBottom: '1px solid #0d302c' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 600, color: '#ffffff' }}>
                          {b.barcode} {b.is_primary && <span style={{ color: '#10b981', fontSize: '9px', marginLeft: '4px' }}>(Primary)</span>}
                        </td>
                        <td style={{ padding: '6px 10px', color: '#94a3b8', fontSize: '11px' }}>{b.barcode_type || 'CODE128'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeBarcodeModalMutation.mutate(b.id)}
                            style={{ backgroundColor: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '3px', padding: '2px 5px', cursor: 'pointer' }}
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => setBarcodeModalProduct(null)}
                style={{ backgroundColor: '#1e293b', color: '#cbd5e1', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WooCommerce Settings & Bulk Sync Modal */}
      <WooCommerceSettingsModal
        isOpen={wooModalOpen}
        onClose={() => setWooModalOpen(false)}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 2. PRODUCT FORM VIEW (SCREENSHOT 2 & 3)
// ────────────────────────────────────────────────────────────────────────────
function ProductFormView({ editingId }: { editingId: string | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentBranchId = useBranchStore(s => s.branchId)

  // Lookups
  const categories = useQuery({ queryKey: ['lookup', 'categories'], queryFn: () => listLookup('categories', 'name', { is_active: true }) })
  const brands = useQuery({ queryKey: ['lookup', 'brands'], queryFn: () => listLookup('brands', 'name', { is_active: true }) })
  const units = useQuery({ queryKey: ['lookup', 'units'], queryFn: () => listLookup('units', 'name', { is_active: true }) })
  const vendors = useQuery({ queryKey: ['lookup', 'vendors'], queryFn: () => listLookup('vendors', 'name', { status: 'active' }) })
  const branches = useQuery({ queryKey: ['lookup', 'branches'], queryFn: () => listLookup('branches', 'name', { is_active: true }) })

  // Query editing product detail
  const detailQuery = useQuery({
    queryKey: ['product', 'detail', editingId],
    queryFn: async () => {
      if (!editingId) return null
      const prod = await getMasterRecord('products', editingId)
      const variants = await listProductVariants(editingId)
      const primaryVariant = variants[0] || null

      let variantBarcodes: string[] = []
      if (primaryVariant?.id) {
        const { data: bcData } = await requireSupabase()
          .from('product_barcodes')
          .select('barcode')
          .eq('product_variant_id', primaryVariant.id)
        variantBarcodes = ((bcData ?? []) as unknown as Array<{ barcode: string }>).map(b => b.barcode)
      }

      return {
        product: prod,
        variant: primaryVariant,
        barcodes: variantBarcodes,
      }
    },
    enabled: Boolean(editingId),
  })

  // Render form when ready
  if (editingId && detailQuery.isLoading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#689d95' }}>
        <RefreshCw className="animate-spin" style={{ display: 'inline-block', marginRight: '8px' }} size={20} />
        Loading product details...
      </div>
    )
  }

  return (
    <ProductFormFields
      editingId={editingId}
      initialData={detailQuery.data as never}
      branches={branches.data || []}
      categories={categories.data || []}
      brands={brands.data || []}
      units={units.data || []}
      vendors={vendors.data || []}
      currentBranchId={currentBranchId}
      onSaveSuccess={() => {
        queryClient.invalidateQueries({ queryKey: ['products-emark-list'] })
        queryClient.invalidateQueries({ queryKey: ['products'] })
        queryClient.invalidateQueries({ queryKey: ['pos_product_search'] })
        navigate('/products')
      }}
    />
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 3. PRODUCT FORM FIELDS COMPONENT
// ────────────────────────────────────────────────────────────────────────────
interface FormProps {
  editingId: string | null
  initialData?: {
    product: Record<string, unknown>
    variant: Record<string, unknown> | null
    barcodes: string[]
  } | null
  branches: Array<{ value: string; label: string }>
  categories: Array<{ value: string; label: string }>
  brands: Array<{ value: string; label: string }>
  units: Array<{ value: string; label: string }>
  vendors: Array<{ value: string; label: string }>
  currentBranchId: string | null
  onSaveSuccess: () => void
}

function ProductFormFields({
  editingId,
  initialData,
  branches,
  categories,
  brands,
  units,
  vendors,
  currentBranchId,
  onSaveSuccess,
}: FormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Initialize form state once from initialData or defaults
  const [formData, setFormData] = useState<ProductFormState>(() => {
    if (initialData?.product) {
      const p = initialData.product
      const v = initialData.variant
      const rawAttrs = (v?.attributes as Record<string, unknown>) || {}

      const allBarcodes: string[] = []
      if (v?.barcode) allBarcodes.push(String(v.barcode))
      if (initialData.barcodes) {
        for (const bc of initialData.barcodes) {
          if (!allBarcodes.includes(bc)) allBarcodes.push(bc)
        }
      }

      return {
        product_name: String(p.name || ''),
        category_id: String(p.category_id || ''),
        model_no: String(rawAttrs.model_no || ''),
        brand_id: String(p.brand_id || ''),
        color: String(rawAttrs.color || v?.colour || ''),
        others: String(rawAttrs.others || ''),
        sku: String(v?.sku || ''),
        service_type: String(rawAttrs.service_type || 'Item'),
        main_unit: (rawAttrs.main_unit as 'unit1' | 'unit2') || 'unit1',
        unit1_name: String((rawAttrs.unit1 as Record<string, unknown>)?.unit || 'PCS'),
        unit1_price: Number(v?.retail_price || 0),
        unit1_mrp: Number((rawAttrs.unit1 as Record<string, unknown>)?.mrp || 0),
        unit2_name: String((rawAttrs.unit2 as Record<string, unknown>)?.unit || ''),
        unit2_diff: String((rawAttrs.unit2 as Record<string, unknown>)?.diff || ''),
        unit2_price: Number((rawAttrs.unit2 as Record<string, unknown>)?.price || 0),
        barcodes: allBarcodes,
        selected_branches: Array.isArray(rawAttrs.selected_branches)
          ? (rawAttrs.selected_branches as string[])
          : branches.map(b => b.value),
        extra_type: String(rawAttrs.extra_type || ''),
        bundle: String(rawAttrs.bundle || ''),
        min_stock: Number(p.minimum_stock || 0),
        vendor_id: String(p.preferred_vendor_id || ''),
        commission_pct: Number(v?.commission_percentage || 0),
        due_days: Number(rawAttrs.due_days || 0),
        section: String(rawAttrs.section || 'SECTION A'),
        discount_level: String(rawAttrs.discount_level || 'LEVEL 1'),
        profit_limit_pct: Number(rawAttrs.profit_limit_pct || 0),
        wl_sales_price: Number(v?.wholesale_price || 0),
        wl_cost: Number(v?.purchase_price || v?.average_cost || 0),
        inv_discount_pct: Number(v?.default_discount_percentage || 0),
        inv_discount_amt: Number(rawAttrs.inv_discount_amt || 0),
        pur_discount_pct: Number(rawAttrs.pur_discount_pct || 0),
        vat_pct: Number(rawAttrs.vat_pct || 0),
        min_price: Number(v?.minimum_price || 0),
        expiry_alert_days: Number(rawAttrs.expiry_alert_days || 0),
        price_tiers: {
          price1: Number((rawAttrs.price_tiers as Record<string, unknown>)?.price1 || v?.special_price || 0),
          price2: Number((rawAttrs.price_tiers as Record<string, unknown>)?.price2 || 0),
          price3: Number((rawAttrs.price_tiers as Record<string, unknown>)?.price3 || 0),
          price4: Number((rawAttrs.price_tiers as Record<string, unknown>)?.price4 || 0),
        },
        flags: {
          hide_cost: Boolean((rawAttrs.flags as Record<string, unknown>)?.hide_cost),
          manufacturer: Boolean((rawAttrs.flags as Record<string, unknown>)?.manufacturer),
          supplies: Boolean((rawAttrs.flags as Record<string, unknown>)?.supplies),
          imei_serial: Boolean((rawAttrs.flags as Record<string, unknown>)?.imei_serial),
          remark_no: Boolean((rawAttrs.flags as Record<string, unknown>)?.remark_no),
          assign_report: (rawAttrs.flags as Record<string, unknown>)?.assign_report !== false,
          show_expiry: Boolean((rawAttrs.flags as Record<string, unknown>)?.show_expiry),
          no_discount: Boolean((rawAttrs.flags as Record<string, unknown>)?.no_discount),
          active: String(p.product_status) === 'active',
        },
        stock_location: String(rawAttrs.stock_location || 'RC001'),
        image_url: String(p.image_url || ''),
      }
    }

    return {
      ...defaultFormState,
      selected_branches: branches.map(b => b.value),
    }
  })

  const [newBarcodeText, setNewBarcodeText] = useState('')
  const [quickCatOpen, setQuickCatOpen] = useState(false)
  const [quickCatName, setQuickCatName] = useState('')
  const [wooModalOpen, setWooModalOpen] = useState(false)
  const [syncToWeb, setSyncToWeb] = useState(() => getWooCommerceConfig().autoSync)

  // Quick Add Category Mutation
  const quickAddCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const code = 'CAT-' + name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
      const newId = await createMasterRecord('categories', {
        name: name.trim(),
        code: code || `CAT-${Date.now()}`,
        is_active: true,
      })
      return { id: newId, name: name.trim() }
    },
    onSuccess: async (cat) => {
      await queryClient.invalidateQueries({ queryKey: ['lookup', 'categories'] })
      setFormData(prev => ({ ...prev, category_id: cat.id }))
      setQuickCatName('')
      setQuickCatOpen(false)
    },
  })

  // Barcode actions
  const handleAddBarcode = () => {
    const trimmed = newBarcodeText.trim()
    if (!trimmed) return
    if (!formData.barcodes.includes(trimmed)) {
      setFormData(prev => ({ ...prev, barcodes: [...prev.barcodes, trimmed] }))
    }
    setNewBarcodeText('')
  }

  const handleRemoveBarcode = (code: string) => {
    setFormData(prev => ({
      ...prev,
      barcodes: prev.barcodes.filter(b => b !== code),
    }))
  }

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formData.product_name.trim()) {
        throw new Error('Product Name is required.')
      }

      const compId = await currentCompanyId()
      const effBranch = currentBranchId || branches[0]?.value || ''
      const effCategoryId = formData.category_id || categories[0]?.value
      if (!effCategoryId) throw new Error('Please select or add a category first.')

      const effUnitId = units[0]?.value
      if (!effUnitId) throw new Error('No units found in system.')

      const attributes = {
        model_no: formData.model_no,
        color: formData.color,
        others: formData.others,
        service_type: formData.service_type,
        main_unit: formData.main_unit,
        unit1: { unit: formData.unit1_name, price: formData.unit1_price, mrp: formData.unit1_mrp },
        unit2: { unit: formData.unit2_name, diff: formData.unit2_diff, price: formData.unit2_price },
        extra_type: formData.extra_type,
        bundle: formData.bundle,
        due_days: formData.due_days,
        section: formData.section,
        discount_level: formData.discount_level,
        profit_limit_pct: formData.profit_limit_pct,
        inv_discount_amt: formData.inv_discount_amt,
        pur_discount_pct: formData.pur_discount_pct,
        vat_pct: formData.vat_pct,
        expiry_alert_days: formData.expiry_alert_days,
        price_tiers: formData.price_tiers,
        flags: formData.flags,
        stock_location: formData.stock_location,
        selected_branches: formData.selected_branches,
      }

      let finalSku = formData.sku.trim()

      if (editingId) {
        // UPDATE Existing Product
        await updateMasterRecord('products', editingId, {
          name: formData.product_name.trim(),
          category_id: effCategoryId,
          brand_id: formData.brand_id || null,
          preferred_vendor_id: formData.vendor_id || null,
          minimum_stock: formData.min_stock || 0,
          reorder_level: formData.min_stock || 0,
          image_url: formData.image_url.trim() || null,
          product_status: formData.flags.active ? 'active' : 'inactive',
          notes: formData.stock_location ? `Location: ${formData.stock_location}` : null,
        })

        const currentVariants = await listProductVariants(editingId)
        const primaryVar = currentVariants[0]
        if (primaryVar) {
          finalSku = finalSku || primaryVar.sku
          await updateMasterRecord('product_variants', primaryVar.id, {
            retail_price: formData.unit1_price || 0,
            wholesale_price: formData.wl_sales_price || 0,
            purchase_price: formData.wl_cost || 0,
            average_cost: formData.wl_cost || 0,
            minimum_price: formData.min_price || 0,
            special_price: formData.price_tiers.price1 || 0,
            commission_percentage: formData.commission_pct || 0,
            default_discount_percentage: formData.inv_discount_pct || 0,
            sku: formData.sku.trim() || primaryVar.sku,
            barcode: formData.barcodes[0] || null,
            colour: formData.color || null,
            attributes,
          })

          // Sync secondary barcodes
          if (formData.barcodes.length > 0) {
            for (let i = 0; i < formData.barcodes.length; i++) {
              const rawBc = formData.barcodes[i]
              const bc = rawBc ? rawBc.trim() : ''
              if (!bc) continue
              const { data: exists } = await requireSupabase()
                .from('product_barcodes')
                .select('id')
                .eq('company_id', compId)
                .eq('barcode', bc)
                .maybeSingle()

              if (!exists) {
                await requireSupabase().from('product_barcodes').insert({
                  company_id: compId,
                  product_variant_id: primaryVar.id,
                  barcode: bc,
                  barcode_type: 'CODE128',
                  pack_quantity: 1,
                  is_primary: i === 0,
                } as never)
              }
            }
          }
        }
      } else {
        // CREATE New Product
        let code: string
        try {
          code = await nextMasterCode(effBranch, 'product')
        } catch {
          code = String(Math.floor(1000 + Math.random() * 9000))
        }

        const sku = formData.sku.trim() || `SKU-${code}`
        finalSku = finalSku || sku
        const primaryBarcode = formData.barcodes[0] || null

        const createdProductId = await createProductWithVariant({
          product: {
            product_code: code,
            name: formData.product_name.trim(),
            category_id: effCategoryId,
            brand_id: formData.brand_id || null,
            base_unit_id: effUnitId,
            product_status: formData.flags.active ? 'active' : 'inactive',
            has_variants: false,
            track_stock: true,
            allow_negative_stock: false,
            minimum_stock: formData.min_stock || 0,
            reorder_level: formData.min_stock || 0,
            default_warranty_days: 0,
            preferred_vendor_id: formData.vendor_id || null,
            image_url: formData.image_url.trim() || null,
            notes: formData.stock_location ? `Location: ${formData.stock_location}` : null,
          },
          variant: {
            sku,
            barcode: primaryBarcode,
            variant_name: 'Default',
            retail_price: formData.unit1_price || 0,
            wholesale_price: formData.wl_sales_price || 0,
            purchase_price: formData.wl_cost || 0,
            average_cost: formData.wl_cost || 0,
            special_price: formData.price_tiers.price1 || 0,
            minimum_price: formData.min_price || 0,
            commission_percentage: formData.commission_pct || 0,
            default_discount_percentage: formData.inv_discount_pct || 0,
            colour: formData.color || null,
            attributes,
          },
        })

        if (createdProductId && formData.barcodes.length > 0) {
          const vars = await listProductVariants(createdProductId)
          const varId = vars[0]?.id
          if (varId) {
            for (let i = 0; i < formData.barcodes.length; i++) {
              const rawBc = formData.barcodes[i]
              const bc = rawBc ? rawBc.trim() : ''
              if (!bc) continue
              const { data: exists } = await requireSupabase()
                .from('product_barcodes')
                .select('id')
                .eq('company_id', compId)
                .eq('barcode', bc)
                .maybeSingle()

              if (!exists) {
                await requireSupabase().from('product_barcodes').insert({
                  company_id: compId,
                  product_variant_id: varId,
                  barcode: bc,
                  barcode_type: 'CODE128',
                  pack_quantity: 1,
                  is_primary: i === 0,
                } as never)
              }
            }
          }
        }
      }

      // Sync to WooCommerce Website if enabled
      if (syncToWeb) {
        try {
          const catName = categories.find(c => c.value === effCategoryId)?.label
          await syncProductToWooCommerce({
            name: formData.product_name.trim(),
            sku: finalSku || undefined,
            regular_price: String(formData.unit1_price || 0),
            sale_price: formData.price_tiers.price1 > 0 ? String(formData.price_tiers.price1) : undefined,
            description: formData.others || '',
            categories: catName ? [{ name: catName }] : undefined,
            images: formData.image_url.trim() ? [{ src: formData.image_url.trim() }] : undefined,
            manage_stock: true,
            status: 'publish',
          })
        } catch {
          // Continue gracefully
        }
      }
    },
    onSuccess: onSaveSuccess,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
            Product Details
          </h2>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => navigate('/products')}
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
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
              }}
            >
              VIEW LIST
            </button>
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
                cursor: saveMutation.isPending ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 8px rgba(0, 180, 216, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {saveMutation.isPending ? 'SAVING...' : 'SAVE'}
            </button>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#5eead4',
                cursor: 'pointer',
                marginLeft: '8px',
              }}
            >
              <input
                type="checkbox"
                checked={syncToWeb}
                onChange={e => setSyncToWeb(e.target.checked)}
                style={{ accentColor: '#00b4d8' }}
              />
              <Globe size={13} />
              SYNC TO WEBSITE
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setWooModalOpen(true)}
          style={{
            background: '#0a2a26',
            border: '1px solid #164e48',
            borderRadius: '6px',
            padding: '8px',
            color: '#94a3b8',
            cursor: 'pointer',
          }}
          title="WooCommerce Website Sync Settings"
        >
          <Settings size={18} />
        </button>
      </div>

      {saveMutation.isError && (
        <div style={{ backgroundColor: '#7f1d1d', border: '1px solid #ef4444', color: '#fef2f2', padding: '10px 14px', borderRadius: '4px', fontSize: '13px' }}>
          {getErrorMessage(saveMutation.error)}
        </div>
      )}

      {/* ── SECTION 1: General info: (SCREENSHOT 2) ────────────────── */}
      <fieldset
        style={{
          border: '1px solid rgba(255, 255, 255, 0.25)',
          borderRadius: '6px',
          padding: '16px 20px',
          margin: 0,
          backgroundColor: 'rgba(4, 28, 25, 0.4)',
        }}
      >
        <legend style={{ padding: '0 8px', fontSize: '16px', fontWeight: 600, color: '#ffffff' }}>
          General info:
        </legend>

        {/* Row 1: Product info fields */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {/* PRODUCT NAME* */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', letterSpacing: '0.05em', marginBottom: '4px' }}>
              PRODUCT NAME*
            </label>
            <input
              type="text"
              value={formData.product_name}
              onChange={e => setFormData(p => ({ ...p, product_name: e.target.value }))}
              placeholder="Product Name"
              style={{
                width: '100%',
                backgroundColor: '#0a2926',
                border: '1px solid #164e48',
                borderRadius: '3px',
                color: '#ffffff',
                padding: '6px 10px',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          {/* CATEGORY* with inline + button */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', letterSpacing: '0.05em', marginBottom: '4px' }}>
              CATEGORY*
            </label>
            <div style={{ display: 'flex', gap: '4px' }}>
              <select
                value={formData.category_id}
                onChange={e => setFormData(p => ({ ...p, category_id: e.target.value }))}
                style={{
                  flex: 1,
                  backgroundColor: '#0a2926',
                  border: '1px solid #164e48',
                  borderRadius: '3px',
                  color: '#ffffff',
                  padding: '6px 8px',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">Select Category</option>
                {categories.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setQuickCatOpen(true)}
                title="Quick Add Category"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: '#00b4d8',
                  color: '#ffffff',
                  border: 'none',
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* MODEL NO */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', letterSpacing: '0.05em', marginBottom: '4px' }}>
              MODEL NO
            </label>
            <input
              type="text"
              value={formData.model_no}
              onChange={e => setFormData(p => ({ ...p, model_no: e.target.value }))}
              placeholder="Item Secondary Name"
              style={{
                width: '100%',
                backgroundColor: '#0a2926',
                border: '1px solid #164e48',
                borderRadius: '3px',
                color: '#ffffff',
                padding: '6px 10px',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          {/* BRAND */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', letterSpacing: '0.05em', marginBottom: '4px' }}>
              BRAND
            </label>
            <select
              value={formData.brand_id}
              onChange={e => setFormData(p => ({ ...p, brand_id: e.target.value }))}
              style={{
                width: '100%',
                backgroundColor: '#0a2926',
                border: '1px solid #164e48',
                borderRadius: '3px',
                color: '#ffffff',
                padding: '6px 8px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">Item Brand</option>
              {brands.map(b => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>

          {/* COLOR */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', letterSpacing: '0.05em', marginBottom: '4px' }}>
              COLOR
            </label>
            <input
              type="text"
              value={formData.color}
              onChange={e => setFormData(p => ({ ...p, color: e.target.value }))}
              placeholder="Item Color"
              style={{
                width: '100%',
                backgroundColor: '#0a2926',
                border: '1px solid #164e48',
                borderRadius: '3px',
                color: '#ffffff',
                padding: '6px 10px',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          {/* OTHERS */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', letterSpacing: '0.05em', marginBottom: '4px' }}>
              OTHERS
            </label>
            <input
              type="text"
              value={formData.others}
              onChange={e => setFormData(p => ({ ...p, others: e.target.value }))}
              placeholder="Item Color"
              style={{
                width: '100%',
                backgroundColor: '#0a2926',
                border: '1px solid #164e48',
                borderRadius: '3px',
                color: '#ffffff',
                padding: '6px 10px',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          {/* SKU */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', letterSpacing: '0.05em', marginBottom: '4px' }}>
              SKU
            </label>
            <input
              type="text"
              value={formData.sku}
              onChange={e => setFormData(p => ({ ...p, sku: e.target.value }))}
              placeholder="Item Color"
              style={{
                width: '100%',
                backgroundColor: '#0a2926',
                border: '1px solid #164e48',
                borderRadius: '3px',
                color: '#ffffff',
                padding: '6px 10px',
                fontSize: '12px',
                outline: 'none',
              }}
            />
          </div>

          {/* SERVICE TYPE */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', letterSpacing: '0.05em', marginBottom: '4px' }}>
              SERVICE TYPE
            </label>
            <select
              value={formData.service_type}
              onChange={e => setFormData(p => ({ ...p, service_type: e.target.value }))}
              style={{
                width: '100%',
                backgroundColor: '#0a2926',
                border: '1px solid #164e48',
                borderRadius: '3px',
                color: '#ffffff',
                padding: '6px 8px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="Item">Item</option>
              <option value="Service">Service</option>
              <option value="Non-inventory">Non-inventory</option>
            </select>
          </div>
        </div>

        {/* Units & Barcodes Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: '20px', marginBottom: '20px' }}>
          {/* Left Column: Unit Cards */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#5eead4', letterSpacing: '0.05em' }}>
                SELECT MAIN UNIT
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ffffff', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="main_unit"
                  checked={formData.main_unit === 'unit1'}
                  onChange={() => setFormData(p => ({ ...p, main_unit: 'unit1' }))}
                  style={{ accentColor: '#00b4d8' }}
                />
                UNIT 01
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ffffff', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="main_unit"
                  checked={formData.main_unit === 'unit2'}
                  onChange={() => setFormData(p => ({ ...p, main_unit: 'unit2' }))}
                  style={{ accentColor: '#00b4d8' }}
                />
                UNIT 02
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Unit 1 Box */}
              <div style={{ border: '1px solid #164e48', borderRadius: '4px', padding: '12px 14px', backgroundColor: 'rgba(4, 28, 26, 0.6)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', marginBottom: '10px' }}>
                  Unit 1<br /><span style={{ fontSize: '11px', color: '#94a3b8' }}>(Package/Bundle)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#5eead4', marginBottom: '2px' }}>UNIT</label>
                    <input
                      type="text"
                      value={formData.unit1_name}
                      onChange={e => setFormData(p => ({ ...p, unit1_name: e.target.value }))}
                      style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '5px 8px', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#5eead4', marginBottom: '2px' }}>SALES PRICE*</label>
                    <input
                      type="number"
                      value={formData.unit1_price || ''}
                      onChange={e => setFormData(p => ({ ...p, unit1_price: Number(e.target.value) }))}
                      placeholder="0"
                      style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '5px 8px', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#5eead4', marginBottom: '2px' }}>MRP*</label>
                    <input
                      type="number"
                      value={formData.unit1_mrp || ''}
                      onChange={e => setFormData(p => ({ ...p, unit1_mrp: Number(e.target.value) }))}
                      placeholder="0"
                      style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '5px 8px', fontSize: '12px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Unit 2 Box */}
              <div style={{ border: '1px solid #164e48', borderRadius: '4px', padding: '12px 14px', backgroundColor: 'rgba(4, 28, 26, 0.6)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', marginBottom: '10px' }}>
                  Unit 2<br /><span style={{ fontSize: '11px', color: '#94a3b8' }}>(Per Peice)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#5eead4', marginBottom: '2px' }}>UNIT</label>
                    <input
                      type="text"
                      value={formData.unit2_name}
                      onChange={e => setFormData(p => ({ ...p, unit2_name: e.target.value }))}
                      placeholder="e.g. Price"
                      style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '5px 8px', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#5eead4', marginBottom: '2px' }}>DIFF (PCS PER BOX)</label>
                    <input
                      type="text"
                      value={formData.unit2_diff}
                      onChange={e => setFormData(p => ({ ...p, unit2_diff: e.target.value }))}
                      placeholder="e.g. Price"
                      style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '5px 8px', fontSize: '12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#5eead4', marginBottom: '2px' }}>SALES PRICE*</label>
                    <input
                      type="number"
                      value={formData.unit2_price || ''}
                      onChange={e => setFormData(p => ({ ...p, unit2_price: Number(e.target.value) }))}
                      placeholder="0"
                      style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '5px 8px', fontSize: '12px' }}
                    />
                    <span style={{ fontSize: '10px', color: '#38bdf8', marginTop: '4px', display: 'block' }}>
                      • Enter Quantity To Calculate Sales Price
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Barcode Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>Barcode</span>
              <input
                type="text"
                value={newBarcodeText}
                onChange={e => setNewBarcodeText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddBarcode() } }}
                placeholder=""
                style={{
                  flex: 1,
                  backgroundColor: '#0a2926',
                  border: '1px solid #164e48',
                  borderRadius: '3px',
                  color: '#ffffff',
                  padding: '6px 10px',
                  fontSize: '12px',
                }}
              />
              <button
                type="button"
                onClick={handleAddBarcode}
                style={{
                  backgroundColor: '#00c853',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '3px',
                  padding: '6px 14px',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                + ADD
              </button>
            </div>

            {/* Barcode Table */}
            <div
              style={{
                border: '1px solid #164e48',
                borderRadius: '4px',
                backgroundColor: '#02100f',
                minHeight: '130px',
                maxHeight: '160px',
                overflowY: 'auto',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#010a09', borderBottom: '1px solid #103b36', color: '#689d95', fontSize: '10px', fontWeight: 800 }}>
                    <th style={{ padding: '6px 10px', width: '40px' }}>#</th>
                    <th style={{ padding: '6px 10px' }}>BARCODE</th>
                    <th style={{ padding: '6px 10px', textAlign: 'center', width: '80px' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.barcodes.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: '#475569' }}>
                        No barcodes added yet. Type and click + ADD.
                      </td>
                    </tr>
                  ) : (
                    formData.barcodes.map((bc, idx) => (
                      <tr key={bc} style={{ borderBottom: '1px solid #0d302c' }}>
                        <td style={{ padding: '6px 10px', color: '#94a3b8' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 10px', color: '#ffffff', fontWeight: 600 }}>{bc}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveBarcode(bc)}
                            style={{
                              backgroundColor: '#ef4444',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '3px',
                              padding: '2px 6px',
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
        </div>

        {/* Bottom: Select Branches Section */}
        <div
          style={{
            border: '1px solid #164e48',
            borderRadius: '4px',
            padding: '12px 16px',
            backgroundColor: 'rgba(2, 16, 15, 0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff' }}>Select Branches</span>
            <input
              type="checkbox"
              checked={branches.length > 0 && formData.selected_branches.length === branches.length}
              onChange={(e) => {
                if (e.target.checked) {
                  setFormData(p => ({ ...p, selected_branches: branches.map(b => b.value) }))
                } else {
                  setFormData(p => ({ ...p, selected_branches: [] }))
                }
              }}
              style={{ accentColor: '#00b4d8' }}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            {branches.map(b => {
              const checked = formData.selected_branches.includes(b.value)
              return (
                <label key={b.value} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#ffffff', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData(p => ({ ...p, selected_branches: [...p.selected_branches, b.value] }))
                      } else {
                        setFormData(p => ({ ...p, selected_branches: p.selected_branches.filter(id => id !== b.value) }))
                      }
                    }}
                    style={{ accentColor: '#00b4d8' }}
                  />
                  {b.label.toUpperCase()}
                </label>
              )
            })}
          </div>
        </div>
      </fieldset>

      {/* ── SECTION 2: Extra info: (SCREENSHOT 3) ──────────────────── */}
      <fieldset
        style={{
          border: '1px solid rgba(255, 255, 255, 0.25)',
          borderRadius: '6px',
          padding: '16px 20px',
          margin: 0,
          backgroundColor: 'rgba(4, 28, 25, 0.4)',
        }}
      >
        <legend style={{ padding: '0 8px', fontSize: '16px', fontWeight: 600, color: '#ffffff' }}>
          Extra info:
        </legend>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr)', gap: '20px', marginBottom: '20px' }}>
          {/* Left Form: 3 Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Row 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>TYPE</label>
                <input
                  type="text"
                  value={formData.extra_type}
                  onChange={e => setFormData(p => ({ ...p, extra_type: e.target.value }))}
                  placeholder="Item Type"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>BUNDLE (PER PACKAGE)</label>
                <input
                  type="text"
                  value={formData.bundle}
                  onChange={e => setFormData(p => ({ ...p, bundle: e.target.value }))}
                  placeholder="Item Bundle (Per Package)"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>MIN. STOCK LEVEL</label>
                <input
                  type="number"
                  value={formData.min_stock || ''}
                  onChange={e => setFormData(p => ({ ...p, min_stock: Number(e.target.value) }))}
                  placeholder="Minimum Stock Level (Per Pa"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
              {/* VENDOR dropdown with white background */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>VENDOR</label>
                <select
                  value={formData.vendor_id}
                  onChange={e => setFormData(p => ({ ...p, vendor_id: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: '3px',
                    color: '#111827',
                    padding: '6px 8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Select Vendor</option>
                  {vendors.map(v => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>COMMISION (%)</label>
                <input
                  type="number"
                  value={formData.commission_pct || ''}
                  onChange={e => setFormData(p => ({ ...p, commission_pct: Number(e.target.value) }))}
                  placeholder="Commision (%)"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>DUE DAYS</label>
                <input
                  type="number"
                  value={formData.due_days || ''}
                  onChange={e => setFormData(p => ({ ...p, due_days: Number(e.target.value) }))}
                  placeholder="Due days"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
            </div>

            {/* Row 2 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>SECTION</label>
                <select
                  value={formData.section}
                  onChange={e => setFormData(p => ({ ...p, section: e.target.value }))}
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                >
                  <option value="SECTION A">SECTION A</option>
                  <option value="SECTION B">SECTION B</option>
                  <option value="SECTION C">SECTION C</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>DISCOUNT LEVEL</label>
                <select
                  value={formData.discount_level}
                  onChange={e => setFormData(p => ({ ...p, discount_level: e.target.value }))}
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                >
                  <option value="LEVEL 1">LEVEL 1</option>
                  <option value="LEVEL 2">LEVEL 2</option>
                  <option value="LEVEL 3">LEVEL 3</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>PROFIT LIMIT (%)</label>
                <input
                  type="number"
                  value={formData.profit_limit_pct || ''}
                  onChange={e => setFormData(p => ({ ...p, profit_limit_pct: Number(e.target.value) }))}
                  placeholder="Profit Limit (%)"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>WL. SALES PRICE</label>
                <input
                  type="number"
                  value={formData.wl_sales_price || ''}
                  onChange={e => setFormData(p => ({ ...p, wl_sales_price: Number(e.target.value) }))}
                  placeholder="Wl Sales Price"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>WL. COST</label>
                <input
                  type="number"
                  value={formData.wl_cost || ''}
                  onChange={e => setFormData(p => ({ ...p, wl_cost: Number(e.target.value) }))}
                  placeholder="Wl Cost"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>INV DISCOUNT</label>
                <input
                  type="number"
                  value={formData.inv_discount_pct || ''}
                  onChange={e => setFormData(p => ({ ...p, inv_discount_pct: Number(e.target.value) }))}
                  placeholder="INV(%) Price"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
            </div>

            {/* Row 3 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>INV DISCOUNT AMOUNT</label>
                <input
                  type="number"
                  value={formData.inv_discount_amt || ''}
                  onChange={e => setFormData(p => ({ ...p, inv_discount_amt: Number(e.target.value) }))}
                  placeholder="Amount"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>PUR. DISCOUNT</label>
                <input
                  type="number"
                  value={formData.pur_discount_pct || ''}
                  onChange={e => setFormData(p => ({ ...p, pur_discount_pct: Number(e.target.value) }))}
                  placeholder="PUR(%)"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>VAT (%)</label>
                <input
                  type="number"
                  value={formData.vat_pct || ''}
                  onChange={e => setFormData(p => ({ ...p, vat_pct: Number(e.target.value) }))}
                  placeholder="VAT(%)"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>MIN. PRICE</label>
                <input
                  type="number"
                  value={formData.min_price || ''}
                  onChange={e => setFormData(p => ({ ...p, min_price: Number(e.target.value) }))}
                  placeholder="Minimum Price"
                  style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '3px', color: '#ffffff', padding: '6px 8px', fontSize: '12px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>EXPIRY ALERT IN</label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input
                    type="number"
                    value={formData.expiry_alert_days || ''}
                    onChange={e => setFormData(p => ({ ...p, expiry_alert_days: Number(e.target.value) }))}
                    placeholder="0"
                    style={{
                      width: '100%',
                      backgroundColor: '#0a2926',
                      border: '1px solid #164e48',
                      borderRight: 'none',
                      borderTopLeftRadius: '3px',
                      borderBottomLeftRadius: '3px',
                      color: '#ffffff',
                      padding: '6px 8px',
                      fontSize: '12px',
                    }}
                  />
                  <span
                    style={{
                      backgroundColor: '#164e48',
                      color: '#e2e8f0',
                      padding: '6px 8px',
                      fontSize: '11px',
                      borderTopRightRadius: '3px',
                      borderBottomRightRadius: '3px',
                    }}
                  >
                    days
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Tiered Pricing Table & Flags Checkboxes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '16px' }}>
            {/* TYPE | PRICE Table */}
            <div style={{ border: '1px solid #164e48', borderRadius: '4px', backgroundColor: '#02100f', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#010a09', borderBottom: '1px solid #103b36', color: '#689d95', fontWeight: 800 }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>TYPE</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>PRICE</th>
                  </tr>
                </thead>
                <tbody>
                  {(['price1', 'price2', 'price3', 'price4'] as const).map((tierKey, idx) => (
                    <tr key={tierKey} style={{ borderBottom: '1px solid #0d302c' }}>
                      <td style={{ padding: '6px 10px', color: '#ffffff', fontWeight: 600 }}>Price {idx + 1}</td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          type="number"
                          value={formData.price_tiers[tierKey] || ''}
                          onChange={e => {
                            const val = Number(e.target.value)
                            setFormData(p => ({
                              ...p,
                              price_tiers: { ...p.price_tiers, [tierKey]: val },
                            }))
                          }}
                          placeholder=""
                          style={{
                            width: '100%',
                            backgroundColor: '#0a2926',
                            border: '1px solid #164e48',
                            borderRadius: '3px',
                            color: '#ffffff',
                            padding: '4px 6px',
                            fontSize: '12px',
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Flags Checkbox Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px', fontWeight: 700, color: '#ffffff' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.flags.hide_cost}
                  onChange={e => setFormData(p => ({ ...p, flags: { ...p.flags, hide_cost: e.target.checked } }))}
                  style={{ accentColor: '#00b4d8' }}
                />
                HIDE COST
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.flags.manufacturer}
                  onChange={e => setFormData(p => ({ ...p, flags: { ...p.flags, manufacturer: e.target.checked } }))}
                  style={{ accentColor: '#00b4d8' }}
                />
                MANUFACTURER
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.flags.supplies}
                  onChange={e => setFormData(p => ({ ...p, flags: { ...p.flags, supplies: e.target.checked } }))}
                  style={{ accentColor: '#00b4d8' }}
                />
                SUPPLIES
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.flags.imei_serial}
                  onChange={e => setFormData(p => ({ ...p, flags: { ...p.flags, imei_serial: e.target.checked } }))}
                  style={{ accentColor: '#00b4d8' }}
                />
                IMEI / SERIAL NUMBER
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.flags.remark_no}
                  onChange={e => setFormData(p => ({ ...p, flags: { ...p.flags, remark_no: e.target.checked } }))}
                  style={{ accentColor: '#00b4d8' }}
                />
                REMARK NO
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.flags.assign_report}
                  onChange={e => setFormData(p => ({ ...p, flags: { ...p.flags, assign_report: e.target.checked } }))}
                  style={{ accentColor: '#00b4d8' }}
                />
                ASSIGN REPORT
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.flags.show_expiry}
                  onChange={e => setFormData(p => ({ ...p, flags: { ...p.flags, show_expiry: e.target.checked } }))}
                  style={{ accentColor: '#00b4d8' }}
                />
                SHOW EXPIRY
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.flags.no_discount}
                  onChange={e => setFormData(p => ({ ...p, flags: { ...p.flags, no_discount: e.target.checked } }))}
                  style={{ accentColor: '#00b4d8' }}
                />
                NO DISCOUNT
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.flags.active}
                  onChange={e => setFormData(p => ({ ...p, flags: { ...p.flags, active: e.target.checked } }))}
                  style={{ accentColor: '#00b4d8' }}
                />
                ACTIVE
              </label>
            </div>
          </div>
        </div>

        {/* Bottom 2 rows: STOCK LOCATION & GOOGLE DRIVE IMAGE URL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>
              STOCK LOCATION
            </label>
            <input
              type="text"
              value={formData.stock_location}
              onChange={e => setFormData(p => ({ ...p, stock_location: e.target.value }))}
              placeholder="RC001"
              style={{
                width: '100%',
                backgroundColor: '#0a2926',
                border: '1px solid #164e48',
                borderRadius: '3px',
                color: '#ffffff',
                padding: '8px 12px',
                fontSize: '12px',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#5eead4', marginBottom: '4px' }}>
              GOOGLE DRIVE IMAGE URL
            </label>
            <input
              type="text"
              value={formData.image_url}
              onChange={e => setFormData(p => ({ ...p, image_url: e.target.value }))}
              placeholder="Paste Image URL Here"
              style={{
                width: '100%',
                backgroundColor: '#0a2926',
                border: '1px solid #164e48',
                borderRadius: '3px',
                color: '#ffffff',
                padding: '8px 12px',
                fontSize: '12px',
              }}
            />
          </div>
        </div>
      </fieldset>

      {/* Quick Add Category Modal */}
      {quickCatOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#072421', border: '1px solid #164e48', borderRadius: '8px', padding: '20px', width: '380px', maxWidth: '90vw', color: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Add New Category</h3>
              <button type="button" onClick={() => setQuickCatOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#5eead4', marginBottom: '4px' }}>Category Name</label>
              <input
                type="text"
                value={quickCatName}
                onChange={e => setQuickCatName(e.target.value)}
                placeholder="e.g. BABY TOYS"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); quickAddCategoryMutation.mutate(quickCatName) } }}
                style={{ width: '100%', backgroundColor: '#0a2926', border: '1px solid #164e48', borderRadius: '4px', color: '#ffffff', padding: '8px 10px', fontSize: '13px' }}
              />
            </div>

            {quickAddCategoryMutation.isError && (
              <div style={{ color: '#ef4444', fontSize: '12px', marginBottom: '10px' }}>
                {getErrorMessage(quickAddCategoryMutation.error)}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setQuickCatOpen(false)}
                style={{ backgroundColor: '#1e293b', color: '#cbd5e1', border: 'none', borderRadius: '4px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!quickCatName.trim() || quickAddCategoryMutation.isPending}
                onClick={() => quickAddCategoryMutation.mutate(quickCatName)}
                style={{ backgroundColor: '#00b4d8', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '6px 14px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
              >
                {quickAddCategoryMutation.isPending ? 'Adding...' : 'Add Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WooCommerce Settings & Sync Modal */}
      <WooCommerceSettingsModal
        isOpen={wooModalOpen}
        onClose={() => setWooModalOpen(false)}
      />
    </div>
  )
}
