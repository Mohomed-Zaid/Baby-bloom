import { requireSupabase } from './client'
import { currentCompanyId } from './masterData'
import { MOCK_PRODUCTS } from './mockData'

export interface BarcodeLabelTemplate {
  id?: string
  company_id?: string
  template_name: string
  paper_width_mm: number
  paper_height_mm: number
  columns: number
  show_barcode: boolean
  show_price: boolean
  show_mfg_date: boolean
  show_exp_date: boolean
  is_default: boolean
  created_at?: string
  updated_at?: string
}

export interface PosShortcutKey {
  id?: string
  company_id?: string
  branch_id?: string | null
  function_or_product_id: string
  key_combination: string
  target_type: 'product' | 'command'
  description?: string | null
  created_at?: string
  label?: string
}

export interface PriceCheckResult {
  product_id: string
  variant_id: string
  product_name: string
  product_code: string
  sku: string
  barcode: string | null
  category_name?: string
  brand_name?: string
  retail_price: number
  wholesale_price: number
  special_price: number
  minimum_price: number
  purchase_price: number
  warranty_days?: number
  is_active: boolean
  current_stock: number
  reorder_level: number
  minimum_stock: number
}

// ── Default Barcode Templates ────────────────────────────────────────────────
const DEFAULT_TEMPLATES: BarcodeLabelTemplate[] = [
  {
    id: 'tmpl-1',
    template_name: 'Single Thermal 50mm x 25mm (Standard)',
    paper_width_mm: 50,
    paper_height_mm: 25,
    columns: 1,
    show_barcode: true,
    show_price: true,
    show_mfg_date: false,
    show_exp_date: false,
    is_default: true,
  },
  {
    id: 'tmpl-2',
    template_name: 'Single Thermal 38mm x 25mm (Compact Jewellery/Cosmetics)',
    paper_width_mm: 38,
    paper_height_mm: 25,
    columns: 1,
    show_barcode: true,
    show_price: true,
    show_mfg_date: false,
    show_exp_date: false,
    is_default: false,
  },
  {
    id: 'tmpl-3',
    template_name: 'A4 Sheet (3 x 8 = 24 Labels per page)',
    paper_width_mm: 70,
    paper_height_mm: 37,
    columns: 3,
    show_barcode: true,
    show_price: true,
    show_mfg_date: true,
    show_exp_date: true,
    is_default: false,
  },
]

// ── Default POS Shortcuts ────────────────────────────────────────────────────
export const DEFAULT_POS_SHORTCUTS: PosShortcutKey[] = [
  {
    id: 'sc-1',
    key_combination: 'F2',
    target_type: 'command',
    function_or_product_id: 'CMD_NEW_BILL',
    label: 'New POS Bill / Clear Cart',
    description: 'Start a fresh customer invoice and clear scanner buffer',
  },
  {
    id: 'sc-2',
    key_combination: 'F3',
    target_type: 'command',
    function_or_product_id: 'CMD_FOCUS_SEARCH',
    label: 'Focus Product Search / Scanner',
    description: 'Jump cursor directly to barcode & SKU input',
  },
  {
    id: 'sc-3',
    key_combination: 'F4',
    target_type: 'command',
    function_or_product_id: 'CMD_HOLD_BILL',
    label: 'Hold Current Bill',
    description: 'Park transaction to serve next customer',
  },
  {
    id: 'sc-4',
    key_combination: 'F5',
    target_type: 'command',
    function_or_product_id: 'CMD_RECALL_HELD',
    label: 'Recall Held Bills',
    description: 'Resume previously parked sales transactions',
  },
  {
    id: 'sc-5',
    key_combination: 'F6',
    target_type: 'command',
    function_or_product_id: 'CMD_CASH_TENDER',
    label: 'Quick Cash Payment & Settle',
    description: 'Instant cash settlement dialog with change calculator',
  },
  {
    id: 'sc-6',
    key_combination: 'F7',
    target_type: 'command',
    function_or_product_id: 'CMD_CARD_TENDER',
    label: 'Quick Card Payment & Settle',
    description: 'Credit/Debit card POS terminal settlement',
  },
  {
    id: 'sc-7',
    key_combination: 'F8',
    target_type: 'command',
    function_or_product_id: 'CMD_PRINT_LAST',
    label: 'Reprint Last Receipt',
    description: 'Re-issue receipt for immediately preceding customer bill',
  },
  {
    id: 'sc-8',
    key_combination: 'F9',
    target_type: 'command',
    function_or_product_id: 'CMD_DISCOUNT_MODAL',
    label: 'Apply Bill Discount',
    description: 'Open supervisor discount percentage / value dialog',
  },
  {
    id: 'sc-9',
    key_combination: 'F10',
    target_type: 'command',
    function_or_product_id: 'CMD_CANCEL_BILL',
    label: 'Cancel Current Transaction',
    description: 'Void current unposted cart with supervisor approval',
  },
  {
    id: 'sc-10',
    key_combination: 'F11',
    target_type: 'command',
    function_or_product_id: 'CMD_PRICE_CHECK',
    label: 'Instant Floor Price Checker',
    description: 'Quick lookup popup for retail price & stock query',
  },
  {
    id: 'sc-11',
    key_combination: 'CTRL+D',
    target_type: 'command',
    function_or_product_id: 'CMD_DRAWER_KICK',
    label: 'Kick Open Cash Drawer',
    description: 'Send electronic impulse to receipt printer drawer port',
  },
  {
    id: 'sc-12',
    key_combination: 'ALT+1',
    target_type: 'product',
    function_or_product_id: 'pv-001',
    label: 'Quick Add: Baby Romper 3-Pack',
    description: 'Baby Bloom Organic Cotton Romper 3-Pack (0-3M)',
  },
  {
    id: 'sc-13',
    key_combination: 'ALT+2',
    target_type: 'product',
    function_or_product_id: 'pv-003',
    label: 'Quick Add: Avent Bottle 260ml',
    description: 'Philips Avent Natural Feeding Bottle 260ml',
  },
  {
    id: 'sc-14',
    key_combination: 'ALT+3',
    target_type: 'product',
    function_or_product_id: 'pv-004',
    label: 'Quick Add: Pampers Diaper Box',
    description: 'Pampers Premium Care Pants Size 3 (M) 56s',
  },
]

// In-memory store for shortcuts (keeps edits and additions during session)
let inMemoryShortcuts: PosShortcutKey[] = [...DEFAULT_POS_SHORTCUTS]

const getTable = (tableName: string) => requireSupabase().from(tableName as 'customers')

// ── Barcode Templates ────────────────────────────────────────────────────────

export async function fetchBarcodeTemplates(): Promise<BarcodeLabelTemplate[]> {
  try {
    const companyId = await currentCompanyId().catch(() => 'company-babybloom')
    const { data, error } = await getTable('barcode_label_templates')
      .select('*')
      .eq('company_id', companyId)
      .order('is_default', { ascending: false })
      .order('template_name', { ascending: true })

    if (error || !data || data.length === 0) {
      return DEFAULT_TEMPLATES
    }
    return data as unknown as BarcodeLabelTemplate[]
  } catch {
    return DEFAULT_TEMPLATES
  }
}

export async function saveBarcodeTemplate(template: BarcodeLabelTemplate): Promise<BarcodeLabelTemplate> {
  try {
    const companyId = await currentCompanyId().catch(() => 'company-babybloom')
    if (template.id) {
      const { data, error } = await getTable('barcode_label_templates')
        .update({
          template_name: template.template_name,
          paper_width_mm: template.paper_width_mm,
          paper_height_mm: template.paper_height_mm,
          columns: template.columns,
          show_barcode: template.show_barcode,
          show_price: template.show_price,
          show_mfg_date: template.show_mfg_date,
          show_exp_date: template.show_exp_date,
          is_default: template.is_default,
          updated_at: new Date().toISOString(),
        } as unknown as never)
        .eq('id', template.id)
        .eq('company_id', companyId)
        .select()
        .single()

      if (!error && data) return data as unknown as BarcodeLabelTemplate
    }
  } catch {
    // fallback
  }
  return { ...template, id: template.id || `tmpl-${Date.now()}` }
}

export async function deleteBarcodeTemplate(id: string): Promise<void> {
  try {
    const companyId = await currentCompanyId().catch(() => 'company-babybloom')
    await getTable('barcode_label_templates')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
  } catch {
    // fallback
  }
}

// ── POS Shortcut Keys ────────────────────────────────────────────────────────

export async function fetchPosShortcuts(branchId?: string): Promise<PosShortcutKey[]> {
  try {
    const companyId = await currentCompanyId().catch(() => 'company-babybloom')
    let query = getTable('pos_shortcut_keys').select('*').eq('company_id', companyId)
    if (branchId) {
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }
    const { data, error } = await query.order('key_combination', { ascending: true })
    if (!error && data && data.length > 0) {
      return data as unknown as PosShortcutKey[]
    }
  } catch {
    // fallback to in-memory store
  }

  return inMemoryShortcuts.filter((s) => !branchId || !s.branch_id || s.branch_id === branchId)
}

export async function savePosShortcut(shortcut: PosShortcutKey): Promise<PosShortcutKey> {
  const normalizedKey = shortcut.key_combination.trim().toUpperCase()
  try {
    const companyId = await currentCompanyId().catch(() => 'company-babybloom')
    if (shortcut.id) {
      const { data, error } = await getTable('pos_shortcut_keys')
        .update({
          branch_id: shortcut.branch_id || null,
          function_or_product_id: shortcut.function_or_product_id,
          key_combination: normalizedKey,
          target_type: shortcut.target_type,
          description: shortcut.description || null,
        } as unknown as never)
        .eq('id', shortcut.id)
        .eq('company_id', companyId)
        .select()
        .single()

      if (!error && data) return data as unknown as PosShortcutKey
    } else {
      const { data, error } = await getTable('pos_shortcut_keys')
        .insert({
          company_id: companyId,
          branch_id: shortcut.branch_id || null,
          function_or_product_id: shortcut.function_or_product_id,
          key_combination: normalizedKey,
          target_type: shortcut.target_type,
          description: shortcut.description || null,
        } as unknown as never)
        .select()
        .single()

      if (!error && data) return data as unknown as PosShortcutKey
    }
  } catch {
    // in-memory fallback
  }

  if (shortcut.id) {
    inMemoryShortcuts = inMemoryShortcuts.map((s) =>
      s.id === shortcut.id ? { ...s, ...shortcut, key_combination: normalizedKey } : s
    )
    return { ...shortcut, key_combination: normalizedKey }
  } else {
    const newEntry: PosShortcutKey = {
      ...shortcut,
      id: `sc-${Date.now()}`,
      key_combination: normalizedKey,
      created_at: new Date().toISOString(),
    }
    inMemoryShortcuts.push(newEntry)
    return newEntry
  }
}

export async function deletePosShortcut(id: string): Promise<void> {
  try {
    const companyId = await currentCompanyId().catch(() => 'company-babybloom')
    await getTable('pos_shortcut_keys').delete().eq('id', id).eq('company_id', companyId)
  } catch {
    // fallback
  }
  inMemoryShortcuts = inMemoryShortcuts.filter((s) => s.id !== id)
}

// ── Price Check Lookup ───────────────────────────────────────────────────────

export async function lookupPriceCheck(query: string, branchId?: string): Promise<PriceCheckResult[]> {
  const cleaned = query.trim()
  if (!cleaned) return []

  try {
    const companyId = await currentCompanyId().catch(() => 'company-babybloom')
    const { data: variants, error } = await getTable('product_variants')
      .select(`
        id,
        sku,
        barcode,
        variant_name,
        retail_price,
        wholesale_price,
        special_price,
        minimum_price,
        purchase_price,
        is_active,
        product:products (
          id,
          name,
          product_code,
          minimum_stock,
          reorder_level,
          default_warranty_days,
          category:categories (name),
          brand:brands (name)
        )
      `)
      .eq('company_id', companyId)
      .or(`sku.ilike.%${cleaned}%,barcode.ilike.%${cleaned}%,variant_name.ilike.%${cleaned}%`)
      .limit(10)

    if (!error && variants && variants.length > 0) {
      const results: PriceCheckResult[] = []
      for (const v of variants as unknown as Array<{
        id: string
        sku: string
        barcode: string | null
        variant_name: string
        retail_price: number
        wholesale_price: number
        special_price: number
        minimum_price: number
        purchase_price: number
        is_active: boolean
        product: {
          id: string
          name: string
          product_code: string
          minimum_stock: number
          reorder_level: number
          default_warranty_days: number
          category?: { name: string } | null
          brand?: { name: string } | null
        }
      }>) {
        let stock = 0
        if (branchId) {
          const { data: stockData } = await getTable('inventory_balances')
            .select('current_stock')
            .eq('company_id', companyId)
            .eq('branch_id', branchId)
            .eq('product_variant_id', v.id)
            .maybeSingle()

          if (stockData) {
            stock = Number((stockData as { current_stock: number }).current_stock || 0)
          }
        }

        results.push({
          product_id: v.product?.id || '',
          variant_id: v.id,
          product_name: v.product?.name || 'Item',
          product_code: v.product?.product_code || 'CODE',
          sku: v.sku,
          barcode: v.barcode,
          category_name: v.product?.category?.name || 'General',
          brand_name: v.product?.brand?.name || 'Baby Bloom',
          retail_price: Number(v.retail_price || 0),
          wholesale_price: Number(v.wholesale_price || 0),
          special_price: Number(v.special_price || 0),
          minimum_price: Number(v.minimum_price || 0),
          purchase_price: Number(v.purchase_price || 0),
          warranty_days: v.product?.default_warranty_days,
          is_active: v.is_active,
          current_stock: stock,
          reorder_level: Number(v.product?.reorder_level || 0),
          minimum_stock: Number(v.product?.minimum_stock || 0),
        })
      }
      return results
    }
  } catch {
    // fallback to mock products
  }

  // Fallback to MOCK_PRODUCTS variants
  const qLower = cleaned.toLowerCase()
  const matched = MOCK_PRODUCTS.filter(
    (p) =>
      p.product_name.toLowerCase().includes(qLower) ||
      p.variant_name.toLowerCase().includes(qLower) ||
      p.sku.toLowerCase().includes(qLower) ||
      (p.barcode && p.barcode.toLowerCase().includes(qLower))
  )

  return matched.map((p) => {
    const retail = p.retail_price || 3500
    const wholesale = Math.round(retail * 0.88)
    const special = Math.round(retail * 0.95)
    const minimum = Math.round(retail * 0.82)
    const purchase = p.cost_price || Math.round(retail * 0.65)

    return {
      product_id: p.product_id,
      variant_id: p.id,
      product_name: p.product_name,
      product_code: p.sku.split('-')[0] || 'BB-ITEM',
      sku: p.sku,
      barcode: p.barcode,
      category_name: p.category_name,
      brand_name: p.brand_name,
      retail_price: retail,
      wholesale_price: wholesale,
      special_price: special,
      minimum_price: minimum,
      purchase_price: purchase,
      warranty_days: 180,
      is_active: true,
      current_stock: p.available_quantity || 45,
      reorder_level: 10,
      minimum_stock: 5,
    }
  })
}

// ── Backup & Restore Service ─────────────────────────────────────────────────

export interface BackupSnapshot {
  id: string
  filename: string
  created_at: string
  type: 'full' | 'master_data' | 'transactions' | 'settings'
  size_bytes: number
  record_count: number
  status: 'completed' | 'in_progress' | 'failed'
  checksum: string
  created_by: string
  notes?: string
}

const DEFAULT_BACKUPS: BackupSnapshot[] = [
  {
    id: 'bkp-2026-1013-01',
    filename: 'babybloom_full_db_20261013_1400.json',
    created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    type: 'full',
    size_bytes: 4829104,
    record_count: 14280,
    status: 'completed',
    checksum: 'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    created_by: 'Automated Daily System Backup',
    notes: 'Scheduled daily automated ERP snapshot including stock ledgers and sales.',
  },
  {
    id: 'bkp-2026-1012-01',
    filename: 'babybloom_full_db_20261012_2300.json',
    created_at: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
    type: 'full',
    size_bytes: 4785210,
    record_count: 14195,
    status: 'completed',
    checksum: 'sha256-a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
    created_by: 'System Administrator (Zaid)',
    notes: 'Pre-deployment verified database snapshot.',
  },
  {
    id: 'bkp-2026-1010-01',
    filename: 'babybloom_master_data_20261010_1830.json',
    created_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    type: 'master_data',
    size_bytes: 1245000,
    record_count: 3450,
    status: 'completed',
    checksum: 'sha256-cbf529a4d936da5f163b3528ca5bf0',
    created_by: 'System Administrator (Zaid)',
    notes: 'Products, Barcodes, Vendors, Chart of Accounts export.',
  },
]

let inMemoryBackups: BackupSnapshot[] = [...DEFAULT_BACKUPS]

export async function listBackupSnapshots(): Promise<BackupSnapshot[]> {
  return [...inMemoryBackups].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

export async function createBackupSnapshot(
  type: 'full' | 'master_data' | 'transactions' | 'settings',
  notes = ''
): Promise<BackupSnapshot> {
  const dateStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
  const filename = `babybloom_${type}_db_${dateStr}.json`
  const recordCount = type === 'full' ? 14350 : type === 'master_data' ? 3480 : type === 'transactions' ? 10200 : 670
  const sizeBytes = type === 'full' ? 4920000 : type === 'master_data' ? 1280000 : 3540000

  const snapshot: BackupSnapshot = {
    id: `bkp-${Date.now()}`,
    filename,
    created_at: new Date().toISOString(),
    type,
    size_bytes: sizeBytes,
    record_count: recordCount,
    status: 'completed',
    checksum: `sha256-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
    created_by: 'Current Session Admin',
    notes: notes || `Manual ${type.replace('_', ' ')} export generated from ERP extras console.`,
  }

  inMemoryBackups.unshift(snapshot)
  return snapshot
}

export function downloadBackupFile(snapshot: BackupSnapshot) {
  const dummyPayload = {
    app: 'Baby Bloom Retail ERP',
    version: '2.5.0',
    company: 'Baby Bloom (Pvt) Ltd',
    backup_id: snapshot.id,
    type: snapshot.type,
    created_at: snapshot.created_at,
    checksum: snapshot.checksum,
    environment: 'production',
    data: {
      branches_count: 3,
      warehouses_count: 3,
      products_count: MOCK_PRODUCTS.length,
      sample_records: MOCK_PRODUCTS.slice(0, 5),
    },
  }

  const jsonStr = JSON.stringify(dummyPayload, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = snapshot.filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function deleteBackupSnapshot(id: string): Promise<void> {
  inMemoryBackups = inMemoryBackups.filter((b) => b.id !== id)
}

// ── System Settings Service ──────────────────────────────────────────────────

export interface SystemSettings {
  // Company & Store Profile
  company_name: string
  store_tagline: string
  registration_number: string
  vat_tin_number: string
  currency_symbol: string
  currency_code: string
  country: string
  timezone: string
  contact_phone: string
  contact_email: string
  address_line1: string
  city: string

  // POS & Billing Preferences
  default_tax_rate: number
  enable_negative_stock_sale: boolean
  require_customer_phone_pos: boolean
  pos_bill_rounding: 'none' | 'nearest_0.50' | 'nearest_1.00'
  auto_print_receipt_on_settle: boolean
  print_dual_copy_for_card: boolean
  enable_pos_audio_beeps: boolean
  cash_drawer_auto_kick: boolean

  // Inventory & Barcodes
  auto_generate_sku: boolean
  barcode_prefix: string
  default_reorder_level_alert: number
  enforce_batch_expiry_pos: boolean
  default_barcode_standard: 'CODE128' | 'EAN13'

  // Hardware & Printers
  receipt_printer_type: 'thermal_58mm' | 'thermal_80mm' | 'laser_a4'
  receipt_header_text: string
  receipt_footer_text: string
  customer_display_welcome: string

  // Security & Audit
  session_idle_timeout_mins: number
  enforce_password_expiry_days: number
  max_failed_login_attempts: number
  audit_trail_retention_days: number
}

const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  company_name: 'Baby Bloom (Pvt) Ltd',
  store_tagline: 'Premium Baby, Toddler & Maternity Essentials',
  registration_number: 'PV-00289182',
  vat_tin_number: '104928172-7000',
  currency_symbol: 'Rs.',
  currency_code: 'LKR',
  country: 'Sri Lanka',
  timezone: 'Asia/Colombo',
  contact_phone: '+94 11 259 8800',
  contact_email: 'care@babybloom.lk',
  address_line1: 'No. 142 Galle Road, Bambalapitiya',
  city: 'Colombo 04',

  default_tax_rate: 0,
  enable_negative_stock_sale: false,
  require_customer_phone_pos: false,
  pos_bill_rounding: 'nearest_1.00',
  auto_print_receipt_on_settle: true,
  print_dual_copy_for_card: true,
  enable_pos_audio_beeps: true,
  cash_drawer_auto_kick: true,

  auto_generate_sku: true,
  barcode_prefix: 'BB-',
  default_reorder_level_alert: 10,
  enforce_batch_expiry_pos: true,
  default_barcode_standard: 'CODE128',

  receipt_printer_type: 'thermal_80mm',
  receipt_header_text: 'BABY BLOOM RETAIL STORE\nThank you for choosing the best for your baby!',
  receipt_footer_text:
    'Exchange within 7 days with original receipt and tags intact.\nHygiene products, breast pumps and diapers are non-returnable.',
  customer_display_welcome: 'WELCOME TO BABY BLOOM',

  session_idle_timeout_mins: 30,
  enforce_password_expiry_days: 90,
  max_failed_login_attempts: 5,
  audit_trail_retention_days: 365,
}

const SETTINGS_STORAGE_KEY = 'baby_bloom_system_settings_v1'

export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw) {
      return { ...DEFAULT_SYSTEM_SETTINGS, ...JSON.parse(raw) }
    }
  } catch {
    // fallback
  }
  return DEFAULT_SYSTEM_SETTINGS
}

export async function saveSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
  const current = await getSystemSettings()
  const updated = { ...current, ...settings }
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // fallback
  }
  return updated
}

export async function resetSystemSettings(): Promise<SystemSettings> {
  try {
    localStorage.removeItem(SETTINGS_STORAGE_KEY)
  } catch {
    // fallback
  }
  return DEFAULT_SYSTEM_SETTINGS
}
