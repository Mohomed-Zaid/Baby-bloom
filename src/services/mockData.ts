// Comprehensive Mock Data for Baby Bloom ERP (Offline / UI-First Mode)

export interface MockBranch {
  id: string
  name: string
  code: string
  is_active: boolean
  address?: string
  phone?: string
}

export interface MockWarehouse {
  id: string
  branch_id: string
  name: string
  code: string
  is_active: boolean
}

export interface MockLocation {
  id: string
  warehouse_id: string
  name: string
  code: string
  is_active: boolean
}

export interface MockCategory {
  id: string
  name: string
  code: string
  is_active: boolean
}

export interface MockBrand {
  id: string
  name: string
  code: string
  is_active: boolean
}

export interface MockCustomer {
  id: string
  customer_code: string
  name: string
  phone: string
  email: string
  credit_limit: number
  current_balance: number
  is_active: boolean
  address?: string
}

export interface MockVendor {
  id: string
  vendor_code: string
  name: string
  phone: string
  email: string
  current_balance: number
  is_active: boolean
}

export interface MockBankAccount {
  id: string
  bank_name: string
  account_name: string
  account_number: string
  branch_name: string
  current_balance: number
  is_active: boolean
}

export interface MockProductVariant {
  id: string
  product_id: string
  product_name: string
  variant_name: string
  sku: string
  barcode: string
  retail_price: number
  cost_price: number
  available_quantity: number
  category_name: string
  brand_name: string
}

export interface MockUnit {
  id: string
  name: string
  code: string
  symbol: string
  is_active: boolean
}

export const MOCK_UNITS: MockUnit[] = [
  { id: 'unit-pcs', name: 'Pieces (PCS)', code: 'PCS', symbol: 'pcs', is_active: true },
  { id: 'unit-box', name: 'Box (BOX)', code: 'BOX', symbol: 'box', is_active: true },
  { id: 'unit-pk', name: 'Pack (PK)', code: 'PK', symbol: 'pk', is_active: true },
  { id: 'unit-set', name: 'Set (SET)', code: 'SET', symbol: 'set', is_active: true },
  { id: 'unit-kg', name: 'Kilograms (KG)', code: 'KG', symbol: 'kg', is_active: true },
]

// ── Master Entities ──────────────────────────────────────────────────────────

export const MOCK_BRANCHES: MockBranch[] = [
  { id: 'branch-colombo', name: 'Main Flagship Store - Colombo 03', code: 'COL-01', is_active: true, address: '124 Galle Road, Colombo 03', phone: '+94 11 234 5678' },
  { id: 'branch-kandy', name: 'Kandy City Centre Branch', code: 'KDY-01', is_active: true, address: 'Level 2, KCC, Kandy', phone: '+94 81 223 4455' },
  { id: 'branch-galle', name: 'Galle Fort Outlet', code: 'GAL-01', is_active: true, address: '45 Church Street, Galle Fort', phone: '+94 91 224 8899' },
]

export const MOCK_WAREHOUSES: MockWarehouse[] = [
  { id: 'wh-colombo-main', branch_id: 'branch-colombo', name: 'Colombo Central Warehouse', code: 'WH-COL-MAIN', is_active: true },
  { id: 'wh-colombo-store', branch_id: 'branch-colombo', name: 'Colombo Retail Floor Shelf', code: 'WH-COL-STORE', is_active: true },
  { id: 'wh-kandy-store', branch_id: 'branch-kandy', name: 'Kandy Retail Storage', code: 'WH-KDY-STORE', is_active: true },
]

export const MOCK_LOCATIONS: MockLocation[] = [
  { id: 'loc-floor-col', warehouse_id: 'wh-colombo-store', name: 'Ground Floor Racks A & B', code: 'LOC-GF-AB', is_active: true },
  { id: 'loc-backroom-col', warehouse_id: 'wh-colombo-main', name: 'Backroom Storage Bay 01', code: 'LOC-BR-01', is_active: true },
]

export const MOCK_CATEGORIES: MockCategory[] = [
  { id: 'cat-clothing', name: 'Baby Apparel & Clothing', code: 'APP', is_active: true },
  { id: 'cat-furniture', name: 'Nursery & Baby Furniture', code: 'NUR', is_active: true },
  { id: 'cat-feeding', name: 'Feeding & Nursing Essentials', code: 'FED', is_active: true },
  { id: 'cat-toys', name: 'Baby Toys & Sensory', code: 'TOY', is_active: true },
  { id: 'cat-strollers', name: 'Strollers, Prams & Car Seats', code: 'STR', is_active: true },
  { id: 'cat-diapers', name: 'Diapers, Wipes & Hygiene', code: 'HYG', is_active: true },
]

export const MOCK_BRANDS: MockBrand[] = [
  { id: 'br-babybloom', name: 'Baby-Bloom Signature', code: 'BB-ORIG', is_active: true },
  { id: 'br-avent', name: 'Philips Avent', code: 'AVENT', is_active: true },
  { id: 'br-pampers', name: 'Pampers Premium', code: 'PAMP', is_active: true },
  { id: 'br-chicco', name: 'Chicco Italy', code: 'CHIC', is_active: true },
  { id: 'br-fisher', name: 'Fisher-Price', code: 'FISH', is_active: true },
  { id: 'br-mothercare', name: 'Mothercare', code: 'MOTH', is_active: true },
]

export const MOCK_CUSTOMERS: MockCustomer[] = [
  { id: 'cust-walkin', customer_code: 'CUST-000', name: 'Walk-in Cash Customer', phone: '+94 77 000 0000', email: 'cash@babybloom.lk', credit_limit: 0, current_balance: 0, is_active: true },
  { id: 'cust-nimalka', customer_code: 'CUST-101', name: 'Nimalka Perera', phone: '+94 77 123 4567', email: 'nimalka.perera@gmail.com', credit_limit: 50000, current_balance: 18500, is_active: true, address: 'No. 14, Havelock Road, Colombo 05' },
  { id: 'cust-kusal', customer_code: 'CUST-102', name: 'Kusal Fernando', phone: '+94 71 987 6543', email: 'kusal.fernando@outlook.com', credit_limit: 100000, current_balance: 42000, is_active: true, address: '45 Lake Drive, Rajagiriya' },
  { id: 'cust-sarah', customer_code: 'CUST-103', name: 'Sarah De Silva', phone: '+94 76 555 4321', email: 'sarah.desilva@yahoo.com', credit_limit: 75000, current_balance: 0, is_active: true, address: '88 Flower Road, Colombo 07' },
  { id: 'cust-dilshan', customer_code: 'CUST-104', name: 'Dilshan Rajapaksa', phone: '+94 70 888 9999', email: 'dilshan.raj@gmail.com', credit_limit: 150000, current_balance: 89000, is_active: true, address: '22 Ward Place, Colombo 07' },
]

export const MOCK_VENDORS: MockVendor[] = [
  { id: 'vend-softlogic', vendor_code: 'VEND-001', name: 'Softlogic Baby Essentials Ltd', phone: '+94 11 555 1111', email: 'orders@softlogicbaby.lk', current_balance: 245000, is_active: true },
  { id: 'vend-kidscorner', vendor_code: 'VEND-002', name: 'Kids Corner Imports Sri Lanka', phone: '+94 11 444 2222', email: 'supplies@kidscorner.lk', current_balance: 112000, is_active: true },
  { id: 'vend-singer', vendor_code: 'VEND-003', name: 'Singer Sri Lanka Baby Care Dept', phone: '+94 11 333 3333', email: 'corporate@singersl.com', current_balance: 78500, is_active: true },
  { id: 'vend-colomboplastic', vendor_code: 'VEND-004', name: 'Colombo Plastic & Nursery Goods', phone: '+94 11 222 4444', email: 'sales@colomboplastic.lk', current_balance: 35000, is_active: true },
]

export const MOCK_BANK_ACCOUNTS: MockBankAccount[] = [
  { id: 'bank-comb-main', bank_name: 'Commercial Bank of Ceylon', account_name: 'Baby Bloom Retail PVT LTD', account_number: '1000849204', branch_name: 'Kollupitiya Branch', current_balance: 1850400, is_active: true },
  { id: 'bank-hnb-ops', bank_name: 'Hatton National Bank', account_name: 'Baby Bloom Operations', account_number: '2001948271', branch_name: 'Colombo Fort Branch', current_balance: 942500, is_active: true },
  { id: 'bank-sampath', bank_name: 'Sampath Bank PLC', account_name: 'Baby Bloom Merchant Float', account_number: '0049281729', branch_name: 'Bambalapitiya Branch', current_balance: 412000, is_active: true },
]

export const MOCK_PRODUCTS: MockProductVariant[] = [
  {
    id: 'pv-001',
    product_id: 'prod-001',
    product_name: 'Baby Bloom Organic Cotton Romper 3-Pack',
    variant_name: '0-3 Months / Pastel Pink & Mint',
    sku: 'BB-RMP-03M-PNK',
    barcode: '88510001',
    retail_price: 3850,
    cost_price: 2200,
    available_quantity: 48,
    category_name: 'Baby Apparel & Clothing',
    brand_name: 'Baby-Bloom Signature',
  },
  {
    id: 'pv-002',
    product_id: 'prod-001',
    product_name: 'Baby Bloom Organic Cotton Romper 3-Pack',
    variant_name: '3-6 Months / Sky Blue & White',
    sku: 'BB-RMP-36M-BLU',
    barcode: '88510002',
    retail_price: 3950,
    cost_price: 2250,
    available_quantity: 36,
    category_name: 'Baby Apparel & Clothing',
    brand_name: 'Baby-Bloom Signature',
  },
  {
    id: 'pv-003',
    product_id: 'prod-002',
    product_name: 'Philips Avent Natural Baby Bottle 260ml',
    variant_name: 'Single Pack / Anti-Colic Teat',
    sku: 'AV-BOT-260-SGL',
    barcode: '88510003',
    retail_price: 4600,
    cost_price: 3100,
    available_quantity: 64,
    category_name: 'Feeding & Nursing Essentials',
    brand_name: 'Philips Avent',
  },
  {
    id: 'pv-004',
    product_id: 'prod-003',
    product_name: 'Pampers Premium Care Pants Size 3 (M)',
    variant_name: 'Jumbo Box / 56 Diapers',
    sku: 'PAM-PNT-SZ3-56',
    barcode: '88510004',
    retail_price: 6800,
    cost_price: 5200,
    available_quantity: 82,
    category_name: 'Diapers, Wipes & Hygiene',
    brand_name: 'Pampers Premium',
  },
  {
    id: 'pv-005',
    product_id: 'prod-004',
    product_name: 'Chicco Bravo Trio Travel System Stroller',
    variant_name: 'Black Titanium Edition with Infant Car Seat',
    sku: 'CHI-STR-TRV-BLK',
    barcode: '88510005',
    retail_price: 89500,
    cost_price: 68000,
    available_quantity: 12,
    category_name: 'Strollers, Prams & Car Seats',
    brand_name: 'Chicco Italy',
  },
  {
    id: 'pv-006',
    product_id: 'prod-005',
    product_name: 'Fisher-Price Kick & Play Piano Gym',
    variant_name: 'Deluxe Multi-Color Activity Mat',
    sku: 'FP-GYM-KCK-DLX',
    barcode: '88510006',
    retail_price: 14200,
    cost_price: 9800,
    available_quantity: 24,
    category_name: 'Baby Toys & Sensory',
    brand_name: 'Fisher-Price',
  },
  {
    id: 'pv-007',
    product_id: 'prod-006',
    product_name: 'Mothercare Solid Pine Wood Convertible Crib',
    variant_name: 'Natural Oak / With Teething Rails',
    sku: 'MC-CRB-OAK-STD',
    barcode: '88510007',
    retail_price: 64500,
    cost_price: 46000,
    available_quantity: 8,
    category_name: 'Nursery & Baby Furniture',
    brand_name: 'Mothercare',
  },
  {
    id: 'pv-008',
    product_id: 'prod-007',
    product_name: 'Baby-Bloom Thermal Bamboo Swaddle Wrap',
    variant_name: 'Pack of 2 / Cloud White',
    sku: 'BB-SWD-BAM-02',
    barcode: '88510008',
    retail_price: 4900,
    cost_price: 2900,
    available_quantity: 52,
    category_name: 'Baby Apparel & Clothing',
    brand_name: 'Baby-Bloom Signature',
  },
]

// ── POS Register Active Shift ────────────────────────────────────────────────

export const MOCK_ACTIVE_SHIFT = {
  id: 'shift-active-01',
  register_id: 'reg-01',
  register_name: 'POS Terminal 01 (Main Store)',
  branch_id: 'branch-colombo',
  branch_name: 'Main Flagship Store - Colombo 03',
  opened_by_user_id: 'user-admin',
  opened_by_name: 'Zaid (System Administrator)',
  opened_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  opening_cash_float: 15000,
  current_system_cash: 63500,
  cash_sales_total: 48500,
  card_sales_total: 32400,
  status: 'open' as const,
}

// ── Invoices Mock ────────────────────────────────────────────────────────────

export const MOCK_INVOICES = [
  {
    id: 'inv-1001',
    invoice_number: 'INV-2026-0042',
    invoice_date: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    branch_id: 'branch-colombo',
    branch_name: 'Main Flagship Store - Colombo 03',
    customer_id: 'cust-nimalka',
    customer_name: 'Nimalka Perera',
    total_amount: 12450,
    paid_amount: 12450,
    balance_amount: 0,
    payment_method: 'card',
    status: 'posted' as const,
    item_count: 3,
  },
  {
    id: 'inv-1002',
    invoice_number: 'INV-2026-0041',
    invoice_date: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    branch_id: 'branch-colombo',
    branch_name: 'Main Flagship Store - Colombo 03',
    customer_id: 'cust-walkin',
    customer_name: 'Walk-in Cash Customer',
    total_amount: 7700,
    paid_amount: 7700,
    balance_amount: 0,
    payment_method: 'cash',
    status: 'posted' as const,
    item_count: 2,
  },
  {
    id: 'inv-1003',
    invoice_number: 'INV-2026-0040',
    invoice_date: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    branch_id: 'branch-colombo',
    branch_name: 'Main Flagship Store - Colombo 03',
    customer_id: 'cust-kusal',
    customer_name: 'Kusal Fernando',
    total_amount: 42000,
    paid_amount: 0,
    balance_amount: 42000,
    payment_method: 'credit',
    status: 'posted' as const,
    item_count: 4,
  },
  {
    id: 'inv-1004',
    invoice_number: 'INV-2026-0039',
    invoice_date: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    branch_id: 'branch-kandy',
    branch_name: 'Kandy City Centre Branch',
    customer_id: 'cust-dilshan',
    customer_name: 'Dilshan Rajapaksa',
    total_amount: 89500,
    paid_amount: 0,
    balance_amount: 89500,
    payment_method: 'credit',
    status: 'posted' as const,
    item_count: 1,
  },
]

// ── Security Audit Log Mock ──────────────────────────────────────────────────

export const MOCK_AUDIT_LOGS = [
  {
    id: 'aud-001',
    company_id: 'company-babybloom',
    branch_id: 'branch-colombo',
    branch_name: 'Main Flagship Store - Colombo 03',
    user_id: 'user-admin',
    user_name: 'Zaid (System Administrator)',
    user_email: 'zaidn2848@gmail.com',
    event_type: 'login' as const,
    severity: 'info' as const,
    target_table: 'auth.users',
    target_id: 'user-admin',
    ip_address: '192.168.1.104',
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    metadata: {
      action: 'login',
      title: 'User Signed In',
      role: 'admin',
      device_type: 'desktop',
      user_agent: 'Chrome 128 on Windows 11',
    },
    old_values: null,
    new_values: { email: 'zaidn2848@gmail.com', role: 'admin' },
  },
  {
    id: 'aud-002',
    company_id: 'company-babybloom',
    branch_id: 'branch-colombo',
    branch_name: 'Main Flagship Store - Colombo 03',
    user_id: 'user-cashier',
    user_name: 'Saman Kumara (Cashier)',
    user_email: 'saman.k@babybloom.lk',
    event_type: 'session_open' as const,
    severity: 'info' as const,
    target_table: 'pos_register_sessions',
    target_id: 'shift-active-01',
    ip_address: '192.168.1.15',
    created_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    metadata: {
      action: 'session_open',
      title: 'Shift Opened on Counter 01',
      float_amount: 15000,
    },
    old_values: null,
    new_values: { register_id: 'reg-01', float: 15000 },
  },
  {
    id: 'aud-003',
    company_id: 'company-babybloom',
    branch_id: 'branch-colombo',
    branch_name: 'Main Flagship Store - Colombo 03',
    user_id: 'user-admin',
    user_name: 'Zaid (System Administrator)',
    user_email: 'zaidn2848@gmail.com',
    event_type: 'other' as const,
    severity: 'info' as const,
    target_table: 'customer_receipts',
    target_id: 'rec-1002',
    ip_address: '192.168.1.104',
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    metadata: {
      action: 'customer_receipt_posted',
      title: 'Customer Receipt #REC-1002 Posted',
      receipt_number: 'REC-1002',
      customer_name: 'Nimalka Perera',
      amount: 18500,
      payment_method: 'card',
    },
    old_values: null,
    new_values: { amount: 18500, customer_id: 'cust-nimalka' },
  },
  {
    id: 'aud-004',
    company_id: 'company-babybloom',
    branch_id: 'branch-colombo',
    branch_name: 'Main Flagship Store - Colombo 03',
    user_id: 'user-admin',
    user_name: 'Zaid (System Administrator)',
    user_email: 'zaidn2848@gmail.com',
    event_type: 'other' as const,
    severity: 'info' as const,
    target_table: 'inventory_documents',
    target_id: 'adj-001',
    ip_address: '192.168.1.104',
    created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    metadata: {
      action: 'stock_adjustment_posted',
      title: 'Stock Adjustment #SA-2026-0012 Posted',
      document_number: 'SA-2026-0012',
      type: 'stock_count',
      lines: 4,
    },
    old_values: null,
    new_values: { document_number: 'SA-2026-0012', status: 'posted' },
  },
  {
    id: 'aud-005',
    company_id: 'company-babybloom',
    branch_id: 'branch-colombo',
    branch_name: 'Main Flagship Store - Colombo 03',
    user_id: 'user-admin',
    user_name: 'Zaid (System Administrator)',
    user_email: 'zaidn2848@gmail.com',
    event_type: 'other' as const,
    severity: 'info' as const,
    target_table: 'supplier_payments',
    target_id: 'sp-001',
    ip_address: '192.168.1.104',
    created_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    metadata: {
      action: 'vendor_payment_posted',
      title: 'Supplier Payment #SP-2026-0089 Posted',
      vendor_name: 'Softlogic Baby Essentials Ltd',
      amount: 120000,
      payment_method: 'bank',
    },
    old_values: null,
    new_values: { amount: 120000, vendor_id: 'vend-softlogic' },
  },
  {
    id: 'aud-006',
    company_id: 'company-babybloom',
    branch_id: 'branch-colombo',
    branch_name: 'Main Flagship Store - Colombo 03',
    user_id: 'user-manager',
    user_name: 'Kamal Perera (Store Manager)',
    user_email: 'kamal.p@babybloom.lk',
    event_type: 'session_close' as const,
    severity: 'info' as const,
    target_table: 'auth.users',
    target_id: 'user-manager',
    ip_address: '192.168.1.55',
    created_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    metadata: {
      action: 'logout',
      title: 'User Signed Out',
      staff_name: 'Kamal Perera',
      reason: 'Manual header sign-out',
    },
    old_values: null,
    new_values: null,
  },
]
