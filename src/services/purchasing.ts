import { requireSupabase,throwOnError } from './client'
import { MOCK_PRODUCTS, MOCK_VENDORS, MOCK_BRANCHES } from './mockData'
import type { PurchaseActionResult,PurchaseItemRow,PurchasePayment,PurchaseProduct,PurchaseReturnRow,PurchaseReturnItemDetail,ListReturnsOptions,PurchaseRow,ReturnEligibility,SupplierBalance,SupplierStatement } from '../types/purchasing'

type Page<T>={rows:T[];count:number};type RpcResult={data:unknown;error:{message:string}|null}
const rpc=(name:string,args:Record<string,unknown>)=>(requireSupabase().rpc as unknown as (n:string,a:Record<string,unknown>)=>Promise<RpcResult>)(name,args)
const safe=(value:string)=>value.replaceAll(',',' ').replaceAll('%','\\%')
const isUuid = (str: string | null | undefined): boolean =>
  typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str)

export async function listPurchaseProducts(search='', locationId?: string):Promise<PurchaseProduct[]>{
  const trimmed = search.trim()
  const supabase = requireSupabase()
  const s = safe(trimmed)

  let products: PurchaseProduct[] = []

  // 1. Try purchase_product_search view first
  try {
    let q = supabase.from('purchase_product_search').select('*').order('product_name').limit(100)
    if (trimmed) {
      // Check if any variant matches in product_barcodes table
      const { data: pbMatches } = await (supabase as any)
        .from('product_barcodes')
        .select('product_variant_id')
        .ilike('barcode', `%${s}%`)
        .limit(30)

      const extraVariantIds = ((pbMatches ?? []) as Array<{ product_variant_id: string }>).map(m => m.product_variant_id)
      let orClause = `product_code.ilike.%${s}%,product_name.ilike.%${s}%,sku.ilike.%${s}%,barcode.ilike.%${s}%`
      if (extraVariantIds.length > 0) {
        orClause += `,product_variant_id.in.(${extraVariantIds.join(',')})`
      }
      q = q.or(orClause)
    }
    const { data, error } = await q
    if (!error && data && data.length > 0) {
      products = data as unknown as PurchaseProduct[]
    } else if (!error && data) {
      products = []
    }
  } catch {
    // view might be missing from schema cache, fall back
  }

  // 2. Fallback to pos_product_search if purchase_product_search didn't yield
  if (products.length === 0) {
    try {
      let q2 = supabase.from('pos_product_search').select('*').order('product_name').limit(100)
      if (trimmed) {
        const { data: pbMatches } = await (supabase as any)
          .from('product_barcodes')
          .select('product_variant_id')
          .ilike('barcode', `%${s}%`)
          .limit(30)

        const extraVariantIds = ((pbMatches ?? []) as Array<{ product_variant_id: string }>).map(m => m.product_variant_id)
        let orClause = `product_code.ilike.%${s}%,product_name.ilike.%${s}%,sku.ilike.%${s}%,barcode.ilike.%${s}%`
        if (extraVariantIds.length > 0) {
          orClause += `,product_variant_id.in.(${extraVariantIds.join(',')})`
        }
        q2 = q2.or(orClause)
      }
      const { data: posData, error: posErr } = await q2
      if (!posErr && posData && posData.length > 0) {
        products = ((posData as any[]) ?? []).map(p => ({
          company_id: p.company_id || '',
          product_variant_id: p.product_variant_id,
          product_id: p.product_id,
          product_code: p.product_code,
          product_name: p.product_name,
          variant_name: p.variant_name,
          sku: p.sku,
          barcode: p.barcode,
          base_unit_id: p.base_unit_id,
          unit_name: p.unit_name || 'PCS',
          preferred_vendor_id: null,
          preferred_vendor_name: null,
          reorder_level: 0,
          retail_price: Number(p.retail_price ?? 0),
          wholesale_price: Number(p.wholesale_price ?? 0),
          last_purchase_cost: Number(p.last_cost ?? 0),
          available_quantity: Number(p.available_quantity ?? 0),
          company_available_quantity: Number(p.available_quantity ?? 0),
        })) as unknown as PurchaseProduct[]
      }
    } catch {
      // continue to fallback 3
    }
  }

  // 3. Fallback to direct product_variants query
  if (products.length === 0) {
    try {
      let q3 = supabase
        .from('product_variants')
        .select(`
          id,
          sku,
          barcode,
          variant_name,
          retail_price,
          wholesale_price,
          purchase_price,
          products:products (
            id,
            product_code,
            name,
            base_unit_id
          )
        `)
        .is('deleted_at', null)
        .limit(100)

      if (trimmed) {
        q3 = q3.or(`sku.ilike.%${s}%,barcode.ilike.%${s}%`)
      }

      const { data: pvData, error: pvErr } = await q3
      if (!pvErr && pvData) {
        products = ((pvData as any[]) ?? []).map(r => ({
          company_id: '',
          product_variant_id: r.id,
          product_id: r.products?.id || '',
          product_code: r.products?.product_code || '-',
          product_name: r.products?.name || 'Unnamed',
          variant_name: r.variant_name || 'Default',
          sku: r.sku || '-',
          barcode: r.barcode || null,
          base_unit_id: r.products?.base_unit_id || '',
          unit_name: 'PCS',
          preferred_vendor_id: null,
          preferred_vendor_name: null,
          reorder_level: 0,
          retail_price: Number(r.retail_price ?? 0),
          wholesale_price: Number(r.wholesale_price ?? 0),
          last_purchase_cost: Number(r.purchase_price ?? 0),
          available_quantity: 0,
          company_available_quantity: 0,
        }))
      }
    } catch {
      // return empty
    }
  }

  // Fallback to MOCK_PRODUCTS variants if offline or empty database
  if (products.length === 0 && Array.isArray(MOCK_PRODUCTS) && MOCK_PRODUCTS.length > 0) {
    products = MOCK_PRODUCTS.flatMap((p: any) => {
      const vars = p.variants && p.variants.length > 0 ? p.variants : [{ id: `var-${p.id}`, sku: p.sku || `SKU-${p.id}`, barcode: p.barcode || '88510000', retail_price: p.price || 1500, wholesale_price: 1300, purchase_price: 1000 }]
      return vars.map((v: any) => ({
        company_id: 'company-babybloom',
        product_variant_id: v.id || `var-${p.id}`,
        product_id: p.id,
        product_code: p.code || p.id,
        product_name: p.name,
        variant_name: v.name || 'Standard Pack',
        sku: v.sku || p.sku || 'SKU-001',
        barcode: v.barcode || p.barcode || null,
        base_unit_id: 'unit-pcs',
        unit_name: 'Pcs',
        preferred_vendor_id: null,
        preferred_vendor_name: null,
        reorder_level: 5,
        retail_price: Number(v.retail_price ?? p.price ?? 0),
        wholesale_price: Number(v.wholesale_price ?? 0),
        last_purchase_cost: Number(v.purchase_price ?? (p.price ? p.price * 0.75 : 0)),
        available_quantity: 45,
        company_available_quantity: 120,
      }))
    })

    if (trimmed) {
      const qLower = trimmed.toLowerCase()
      products = products.filter(p =>
        p.product_name.toLowerCase().includes(qLower) ||
        p.product_code.toLowerCase().includes(qLower) ||
        p.sku.toLowerCase().includes(qLower) ||
        (p.barcode && p.barcode.toLowerCase().includes(qLower))
      )
    }
  }

  // If locationId provided, query location-specific stock from current_stock
  if (locationId && products.length > 0) {
    try {
      const variantIds = products.map(p => p.product_variant_id)
      const { data: stockData } = await supabase
        .from('current_stock')
        .select('product_variant_id, available_quantity')
        .eq('stock_location_id', locationId)
        .in('product_variant_id', variantIds)

      const stockMap = new Map(((stockData ?? []) as Array<{ product_variant_id: string; available_quantity: number }>).map(s => [s.product_variant_id, Number(s.available_quantity ?? 0)]))
      return products.map(p => ({
        ...p,
        company_available_quantity: Number(p.available_quantity ?? p.company_available_quantity ?? 0),
        available_quantity: stockMap.get(p.product_variant_id) ?? 0,
      }))
    } catch {
      // fall back to unmodified products
    }
  }

  return products.map(p => ({
    ...p,
    company_available_quantity: Number(p.available_quantity ?? p.company_available_quantity ?? 0),
    available_quantity: Number(p.available_quantity ?? 0),
  }))
}

// In-memory mock purchases dataset for rich UI Demo Mode
export const MOCK_PURCHASES_DATA: Array<{
  header: PurchaseRow
  items: PurchaseItemRow[]
  payments: PurchasePayment[]
}> = [
  {
    header: {
      id: 'pur-101',
      company_id: 'company-babybloom',
      branch_id: 'branch-colombo',
      warehouse_id: 'wh-colombo-main',
      stock_location_id: 'loc-floor-col',
      purchase_number: 'PO-2026-0048',
      vendor_invoice_number: 'INV-SL-8921',
      vendor_id: 'vend-softlogic',
      purchase_date: new Date(Date.now() - 2 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      due_date: new Date(Date.now() + 28 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      purchase_type: 'credit',
      status: 'posted',
      subtotal: 245000,
      item_discount_total: 0,
      bill_discount_type: 'none',
      bill_discount_value: 0,
      bill_discount_amount: 0,
      tax_total: 0,
      shipping_cost: 0,
      other_cost: 0,
      grand_total: 245000,
      paid_amount: 0,
      balance_amount: 245000,
      payment_status: 'unpaid',
      returned_amount: 0,
      notes: 'Consignment shipment of feeding accessories and travel strollers.',
      internal_reference: 'REQ-COL-091',
      reversal_of_id: null,
      created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
      posted_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
      vendor_code: 'VEND-001',
      vendor_name: 'Softlogic Baby Essentials Ltd',
      branch_name: 'Main Flagship Store - Colombo 03',
      warehouse_name: 'Colombo Central Warehouse',
      location_name: 'Ground Floor Racks A & B',
      created_user: 'Zaid (System Administrator)',
    },
    items: [
      {
        id: 'pi-101-1',
        purchase_id: 'pur-101',
        product_variant_id: 'pv-001',
        unit_id: 'unit-pcs',
        quantity: 50,
        free_quantity: 5,
        unit_cost: 2400,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 120000,
        line_total: 120000,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 2181.82,
        batch_reference: 'AVT-BTL-2026-B1',
        manufacture_date: '2026-01-15',
        expiry_date: '2029-01-15',
        warranty_days: 365,
        remarks: 'Batch inspected - seals intact',
        product_code: 'AVT-BTL',
        product_name: 'Philips Avent Natural Baby Bottle 260ml',
        variant_name: 'Single Pack / Clear Glass',
        sku: 'AVT-BTL-260-GLS',
        barcode: '88510001',
        unit_name: 'Pieces',
        unit_symbol: 'Pcs',
      },
      {
        id: 'pi-101-2',
        purchase_id: 'pur-101',
        product_variant_id: 'pv-005',
        unit_id: 'unit-pcs',
        quantity: 2,
        free_quantity: 0,
        unit_cost: 62500,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 125000,
        line_total: 125000,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 62500,
        batch_reference: 'CHI-TRV-2026-A',
        manufacture_date: '2025-11-20',
        expiry_date: null,
        warranty_days: 730,
        remarks: 'Titanium Black Edition',
        product_code: 'CHI-STR',
        product_name: 'Chicco Bravo Trio Travel System Stroller',
        variant_name: 'Black Titanium Edition with Infant Car Seat',
        sku: 'CHI-STR-TRV-BLK',
        barcode: '88510005',
        unit_name: 'Pieces',
        unit_symbol: 'Pcs',
      },
    ],
    payments: [],
  },
  {
    header: {
      id: 'pur-102',
      company_id: 'company-babybloom',
      branch_id: 'branch-colombo',
      warehouse_id: 'wh-colombo-main',
      stock_location_id: 'loc-floor-col',
      purchase_number: 'PO-2026-0047',
      vendor_invoice_number: 'KC-SL-4412',
      vendor_id: 'vend-kidscorner',
      purchase_date: new Date(Date.now() - 5 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      due_date: new Date(Date.now() + 15 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      purchase_type: 'mixed',
      status: 'posted',
      subtotal: 380000,
      item_discount_total: 0,
      bill_discount_type: 'none',
      bill_discount_value: 0,
      bill_discount_amount: 0,
      tax_total: 0,
      shipping_cost: 0,
      other_cost: 0,
      grand_total: 380000,
      paid_amount: 268000,
      balance_amount: 112000,
      payment_status: 'partial',
      returned_amount: 0,
      notes: 'Pampers diaper boxes and Dr Browns bottles replenishment.',
      internal_reference: 'REQ-COL-088',
      reversal_of_id: null,
      created_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
      posted_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
      vendor_code: 'VEND-002',
      vendor_name: 'Kids Corner Imports Sri Lanka',
      branch_name: 'Main Flagship Store - Colombo 03',
      warehouse_name: 'Colombo Central Warehouse',
      location_name: 'Ground Floor Racks A & B',
      created_user: 'Zaid (System Administrator)',
    },
    items: [
      {
        id: 'pi-102-1',
        purchase_id: 'pur-102',
        product_variant_id: 'pv-004',
        unit_id: 'unit-box',
        quantity: 50,
        free_quantity: 2,
        unit_cost: 5200,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 260000,
        line_total: 260000,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 5000,
        batch_reference: 'PAM-2026-X1',
        manufacture_date: '2026-02-01',
        expiry_date: '2028-02-01',
        warranty_days: null,
        remarks: 'Jumbo Box / 56 Diapers',
        product_code: 'PAM-PNT',
        product_name: 'Pampers Premium Care Pants Size 3',
        variant_name: 'Jumbo Box / 56 Diapers',
        sku: 'PAM-PNT-SZ3-56',
        barcode: '88510004',
        unit_name: 'Boxes',
        unit_symbol: 'Box',
      },
      {
        id: 'pi-102-2',
        purchase_id: 'pur-102',
        product_variant_id: 'pv-002',
        unit_id: 'unit-pcs',
        quantity: 40,
        free_quantity: 4,
        unit_cost: 3000,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 120000,
        line_total: 120000,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 2727.27,
        batch_reference: 'DRB-2026-03',
        manufacture_date: '2026-01-10',
        expiry_date: '2029-01-10',
        warranty_days: 180,
        remarks: 'Anti-colic vent system',
        product_code: 'DRB-BTL',
        product_name: "Dr. Brown's Options+ Anti-Colic Bottle 270ml",
        variant_name: 'Pack of 2 / Pink Edition',
        sku: 'DRB-BTL-270-PNK',
        barcode: '88510002',
        unit_name: 'Pieces',
        unit_symbol: 'Pcs',
      },
    ],
    payments: [
      {
        id: 'pay-102-1',
        purchase_id: 'pur-102',
        vendor_id: 'vend-kidscorner',
        payment_number: 'SP-2026-0008',
        payment_date: new Date(Date.now() - 4 * 86400 * 1000).toISOString().split('T')[0] ?? '',
        payment_method: 'bank',
        amount: 268000,
        bank_account_id: 'bank-comb-main',
        cheque_id: null,
        reference_number: 'TXN-COMBANK-98102',
        notes: 'Advance transfer 70%',
        status: 'posted',
        clearing_status: 'cleared',
        vendor_code: 'VEND-002',
        vendor_name: 'Kids Corner Imports Sri Lanka',
        branch_name: 'Main Flagship Store - Colombo 03',
        purchase_number: 'PO-2026-0047',
        bank_account_name: 'Commercial Bank Operating A/C',
      },
    ],
  },
  {
    header: {
      id: 'pur-103',
      company_id: 'company-babybloom',
      branch_id: 'branch-kandy',
      warehouse_id: 'wh-kandy-store',
      stock_location_id: 'loc-floor-col',
      purchase_number: 'PO-2026-0046',
      vendor_invoice_number: 'SIN-2026-092',
      vendor_id: 'vend-singer',
      purchase_date: new Date(Date.now() - 8 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      due_date: new Date(Date.now() + 12 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      purchase_type: 'credit',
      status: 'posted',
      subtotal: 157000,
      item_discount_total: 0,
      bill_discount_type: 'none',
      bill_discount_value: 0,
      bill_discount_amount: 0,
      tax_total: 0,
      shipping_cost: 0,
      other_cost: 0,
      grand_total: 157000,
      paid_amount: 78500,
      balance_amount: 78500,
      payment_status: 'partial',
      returned_amount: 0,
      notes: 'Baby gym mats and bamboo swaddles shipment for Kandy outlet.',
      internal_reference: 'REQ-KDY-014',
      reversal_of_id: null,
      created_at: new Date(Date.now() - 8 * 86400 * 1000).toISOString(),
      posted_at: new Date(Date.now() - 8 * 86400 * 1000).toISOString(),
      vendor_code: 'VEND-003',
      vendor_name: 'Singer Sri Lanka Baby Care Dept',
      branch_name: 'Kandy City Centre Branch',
      warehouse_name: 'Kandy Retail Storage',
      location_name: 'Main Storage Shelf',
      created_user: 'Zaid (System Administrator)',
    },
    items: [
      {
        id: 'pi-103-1',
        purchase_id: 'pur-103',
        product_variant_id: 'pv-006',
        unit_id: 'unit-pcs',
        quantity: 15,
        free_quantity: 1,
        unit_cost: 9800,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 147000,
        line_total: 147000,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 9187.5,
        batch_reference: 'FP-GYM-2026',
        manufacture_date: '2025-10-01',
        expiry_date: null,
        warranty_days: 365,
        remarks: 'Deluxe Multi-Color Activity Mat',
        product_code: 'FP-GYM',
        product_name: 'Fisher-Price Kick & Play Piano Gym',
        variant_name: 'Deluxe Multi-Color Activity Mat',
        sku: 'FP-GYM-KCK-DLX',
        barcode: '88510006',
        unit_name: 'Pieces',
        unit_symbol: 'Pcs',
      },
      {
        id: 'pi-103-2',
        purchase_id: 'pur-103',
        product_variant_id: 'pv-008',
        unit_id: 'unit-pcs',
        quantity: 5,
        free_quantity: 0,
        unit_cost: 2000,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 10000,
        line_total: 10000,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 2000,
        batch_reference: 'BB-SWD-2026',
        manufacture_date: '2026-01-01',
        expiry_date: null,
        warranty_days: null,
        remarks: 'Pack of 2 / Cloud White',
        product_code: 'BB-SWD',
        product_name: 'Baby-Bloom Thermal Bamboo Swaddle Wrap',
        variant_name: 'Pack of 2 / Cloud White',
        sku: 'BB-SWD-BAM-02',
        barcode: '88510008',
        unit_name: 'Pieces',
        unit_symbol: 'Pcs',
      },
    ],
    payments: [
      {
        id: 'pay-103-1',
        purchase_id: 'pur-103',
        vendor_id: 'vend-singer',
        payment_number: 'SP-2026-0007',
        payment_date: new Date(Date.now() - 7 * 86400 * 1000).toISOString().split('T')[0] ?? '',
        payment_method: 'cheque',
        amount: 78500,
        bank_account_id: 'bank-comb-main',
        cheque_id: 'chq-89102',
        reference_number: 'CHQ-COMB-771923',
        notes: '50% settlement cheque',
        status: 'posted',
        clearing_status: 'cleared',
        vendor_code: 'VEND-003',
        vendor_name: 'Singer Sri Lanka Baby Care Dept',
        branch_name: 'Kandy City Centre Branch',
        purchase_number: 'PO-2026-0046',
        bank_account_name: 'Commercial Bank Operating A/C',
      },
    ],
  },
  {
    header: {
      id: 'pur-104',
      company_id: 'company-babybloom',
      branch_id: 'branch-colombo',
      warehouse_id: 'wh-colombo-main',
      stock_location_id: 'loc-floor-col',
      purchase_number: 'PO-2026-0045',
      vendor_invoice_number: 'CPN-8812',
      vendor_id: 'vend-colomboplastic',
      purchase_date: new Date(Date.now() - 12 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      due_date: new Date(Date.now() - 2 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      purchase_type: 'cash',
      status: 'posted',
      subtotal: 95000,
      item_discount_total: 0,
      bill_discount_type: 'none',
      bill_discount_value: 0,
      bill_discount_amount: 0,
      tax_total: 0,
      shipping_cost: 0,
      other_cost: 0,
      grand_total: 95000,
      paid_amount: 95000,
      balance_amount: 0,
      payment_status: 'paid',
      returned_amount: 0,
      notes: 'Direct cash purchase of solid pine convertible cribs.',
      internal_reference: 'REQ-COL-079',
      reversal_of_id: null,
      created_at: new Date(Date.now() - 12 * 86400 * 1000).toISOString(),
      posted_at: new Date(Date.now() - 12 * 86400 * 1000).toISOString(),
      vendor_code: 'VEND-004',
      vendor_name: 'Colombo Plastic & Nursery Goods',
      branch_name: 'Main Flagship Store - Colombo 03',
      warehouse_name: 'Colombo Central Warehouse',
      location_name: 'Ground Floor Racks A & B',
      created_user: 'Zaid (System Administrator)',
    },
    items: [
      {
        id: 'pi-104-1',
        purchase_id: 'pur-104',
        product_variant_id: 'pv-007',
        unit_id: 'unit-pcs',
        quantity: 2,
        free_quantity: 0,
        unit_cost: 46000,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 92000,
        line_total: 92000,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 46000,
        batch_reference: 'MC-CRB-2026',
        manufacture_date: '2025-12-01',
        expiry_date: null,
        warranty_days: 1095,
        remarks: 'Natural Oak / Teething Rails',
        product_code: 'MC-CRB',
        product_name: 'Mothercare Solid Pine Wood Convertible Crib',
        variant_name: 'Natural Oak / With Teething Rails',
        sku: 'MC-CRB-OAK-STD',
        barcode: '88510007',
        unit_name: 'Pieces',
        unit_symbol: 'Pcs',
      },
      {
        id: 'pi-104-2',
        purchase_id: 'pur-104',
        product_variant_id: 'pv-003',
        unit_id: 'unit-pcs',
        quantity: 2,
        free_quantity: 0,
        unit_cost: 1500,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 3000,
        line_total: 3000,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 1500,
        batch_reference: 'DRB-PAC-2026',
        manufacture_date: '2026-01-01',
        expiry_date: '2029-01-01',
        warranty_days: null,
        remarks: 'Sample units',
        product_code: 'DRB-PAC',
        product_name: "Dr. Brown's Advantage Pacifier Stage 1",
        variant_name: 'Pack of 2 / Pastel Blue',
        sku: 'DRB-PAC-S1-BLU',
        barcode: '88510003',
        unit_name: 'Pieces',
        unit_symbol: 'Pcs',
      },
    ],
    payments: [
      {
        id: 'pay-104-1',
        purchase_id: 'pur-104',
        vendor_id: 'vend-colomboplastic',
        payment_number: 'SP-2026-0005',
        payment_date: new Date(Date.now() - 12 * 86400 * 1000).toISOString().split('T')[0] ?? '',
        payment_method: 'cash',
        amount: 95000,
        bank_account_id: null,
        cheque_id: null,
        reference_number: 'CASH-REC-019',
        notes: 'Full payment on delivery',
        status: 'posted',
        clearing_status: 'cleared',
        vendor_code: 'VEND-004',
        vendor_name: 'Colombo Plastic & Nursery Goods',
        branch_name: 'Main Flagship Store - Colombo 03',
        purchase_number: 'PO-2026-0045',
        bank_account_name: null,
      },
    ],
  },
  {
    header: {
      id: 'pur-105',
      company_id: 'company-babybloom',
      branch_id: 'branch-colombo',
      warehouse_id: 'wh-colombo-main',
      stock_location_id: 'loc-floor-col',
      purchase_number: 'PO-2026-0049',
      vendor_invoice_number: 'INV-SL-9011',
      vendor_id: 'vend-softlogic',
      purchase_date: new Date(Date.now() - 1 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      due_date: new Date(Date.now() + 29 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      purchase_type: 'credit',
      status: 'submitted',
      subtotal: 182500,
      item_discount_total: 0,
      bill_discount_type: 'none',
      bill_discount_value: 0,
      bill_discount_amount: 0,
      tax_total: 0,
      shipping_cost: 0,
      other_cost: 0,
      grand_total: 182500,
      paid_amount: 0,
      balance_amount: 182500,
      payment_status: 'unpaid',
      returned_amount: 0,
      notes: 'Pending manager verification and physical barcoding inspection.',
      internal_reference: 'REQ-COL-094',
      reversal_of_id: null,
      created_at: new Date(Date.now() - 1 * 86400 * 1000).toISOString(),
      posted_at: null,
      vendor_code: 'VEND-001',
      vendor_name: 'Softlogic Baby Essentials Ltd',
      branch_name: 'Main Flagship Store - Colombo 03',
      warehouse_name: 'Colombo Central Warehouse',
      location_name: 'Ground Floor Racks A & B',
      created_user: 'Zaid (System Administrator)',
    },
    items: [
      {
        id: 'pi-105-1',
        purchase_id: 'pur-105',
        product_variant_id: 'pv-001',
        unit_id: 'unit-pcs',
        quantity: 50,
        free_quantity: 5,
        unit_cost: 2200,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 110000,
        line_total: 110000,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 2000,
        batch_reference: 'AVT-BTL-2026-C1',
        manufacture_date: '2026-02-01',
        expiry_date: '2029-02-01',
        warranty_days: 365,
        remarks: 'Promotional bundle discount applied',
        product_code: 'AVT-BTL',
        product_name: 'Philips Avent Natural Baby Bottle 260ml',
        variant_name: 'Single Pack / Clear Glass',
        sku: 'AVT-BTL-260-GLS',
        barcode: '88510001',
        unit_name: 'Pieces',
        unit_symbol: 'Pcs',
      },
      {
        id: 'pi-105-2',
        purchase_id: 'pur-105',
        product_variant_id: 'pv-005',
        unit_id: 'unit-pcs',
        quantity: 1,
        free_quantity: 0,
        unit_cost: 72500,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 72500,
        line_total: 72500,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 72500,
        batch_reference: 'CHI-TRV-2026-B',
        manufacture_date: '2026-01-10',
        expiry_date: null,
        warranty_days: 730,
        remarks: 'Display demo model replacement',
        product_code: 'CHI-STR',
        product_name: 'Chicco Bravo Trio Travel System Stroller',
        variant_name: 'Black Titanium Edition with Infant Car Seat',
        sku: 'CHI-STR-TRV-BLK',
        barcode: '88510005',
        unit_name: 'Pieces',
        unit_symbol: 'Pcs',
      },
    ],
    payments: [],
  },
  {
    header: {
      id: 'pur-106',
      company_id: 'company-babybloom',
      branch_id: 'branch-galle',
      warehouse_id: 'wh-colombo-main',
      stock_location_id: 'loc-floor-col',
      purchase_number: 'PO-2026-0050',
      vendor_invoice_number: 'KC-SL-4500',
      vendor_id: 'vend-kidscorner',
      purchase_date: new Date().toISOString().split('T')[0] ?? '',
      due_date: new Date(Date.now() + 14 * 86400 * 1000).toISOString().split('T')[0] ?? '',
      purchase_type: 'credit',
      status: 'draft',
      subtotal: 64000,
      item_discount_total: 0,
      bill_discount_type: 'none',
      bill_discount_value: 0,
      bill_discount_amount: 0,
      tax_total: 0,
      shipping_cost: 0,
      other_cost: 0,
      grand_total: 64000,
      paid_amount: 0,
      balance_amount: 64000,
      payment_status: 'unpaid',
      returned_amount: 0,
      notes: 'New purchase draft prepared by warehouse clerk.',
      internal_reference: 'REQ-GAL-005',
      reversal_of_id: null,
      created_at: new Date().toISOString(),
      posted_at: null,
      vendor_code: 'VEND-002',
      vendor_name: 'Kids Corner Imports Sri Lanka',
      branch_name: 'Galle Fort Outlet',
      warehouse_name: 'Galle Storage Floor',
      location_name: 'Bay 01 Storage',
      created_user: 'Zaid (System Administrator)',
    },
    items: [
      {
        id: 'pi-106-1',
        purchase_id: 'pur-106',
        product_variant_id: 'pv-008',
        unit_id: 'unit-pcs',
        quantity: 20,
        free_quantity: 2,
        unit_cost: 2900,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 58000,
        line_total: 58000,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 2636.36,
        batch_reference: 'BB-SWD-2026-02',
        manufacture_date: '2026-02-01',
        expiry_date: null,
        warranty_days: null,
        remarks: 'Bamboo Swaddles cloud white',
        product_code: 'BB-SWD',
        product_name: 'Baby-Bloom Thermal Bamboo Swaddle Wrap',
        variant_name: 'Pack of 2 / Cloud White',
        sku: 'BB-SWD-BAM-02',
        barcode: '88510008',
        unit_name: 'Pieces',
        unit_symbol: 'Pcs',
      },
      {
        id: 'pi-106-2',
        purchase_id: 'pur-106',
        product_variant_id: 'pv-003',
        unit_id: 'unit-pcs',
        quantity: 4,
        free_quantity: 0,
        unit_cost: 1500,
        discount_type: 'none',
        discount_value: 0,
        discount_amount: 0,
        tax_rate: 0,
        tax_amount: 0,
        line_subtotal: 6000,
        line_total: 6000,
        allocated_bill_discount: 0,
        allocated_extra_cost: 0,
        final_unit_cost: 1500,
        batch_reference: 'DRB-PAC-2026-B',
        manufacture_date: '2026-01-15',
        expiry_date: '2029-01-15',
        warranty_days: null,
        remarks: 'Pacifiers Stage 1 blue',
        product_code: 'DRB-PAC',
        product_name: "Dr. Brown's Advantage Pacifier Stage 1",
        variant_name: 'Pack of 2 / Pastel Blue',
        sku: 'DRB-PAC-S1-BLU',
        barcode: '88510003',
        unit_name: 'Pieces',
        unit_symbol: 'Pcs',
      },
    ],
    payments: [],
  },
]

export async function createPurchaseDraft(header:Record<string,unknown>,items:Record<string,unknown>[],payments:Record<string,unknown>[]){
  try {
    const{data,error}=await rpc('create_purchase_draft',{p_header:header,p_items:items,p_payments:payments});
    if (!error && data) return data as PurchaseActionResult;
  } catch {}

  const newId = `pur-${Date.now()}`
  const docNum = `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`
  const vendorId = (header.vendor_id as string) || 'vend-softlogic'
  const vendor = MOCK_VENDORS.find(v => v.id === vendorId) ?? MOCK_VENDORS[0] ?? { id: vendorId, name: 'Vendor', vendor_code: 'VEND' }
  const branchId = (header.branch_id as string) || 'branch-colombo'
  const branch = MOCK_BRANCHES.find(b => b.id === branchId) ?? MOCK_BRANCHES[0] ?? { id: branchId, name: 'Main Branch' }

  const total = items.reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.unit_cost || 0)), 0)

  const newPurchase = {
    header: {
      id: newId,
      company_id: 'company-babybloom',
      branch_id: branch.id,
      warehouse_id: 'wh-colombo-main',
      stock_location_id: 'loc-floor-col',
      purchase_number: docNum,
      vendor_invoice_number: (header.vendor_invoice_number as string) || `INV-${Date.now().toString().slice(-4)}`,
      vendor_id: vendor.id,
      purchase_date: (header.purchase_date as string) || (new Date().toISOString().split('T')[0] ?? ''),
      due_date: (header.due_date as string) || (new Date(Date.now() + 30 * 86400 * 1000).toISOString().split('T')[0] ?? ''),
      purchase_type: ((header.purchase_type as any) || 'credit'),
      status: 'draft' as const,
      subtotal: total,
      item_discount_total: 0,
      bill_discount_type: 'none' as const,
      bill_discount_value: 0,
      bill_discount_amount: 0,
      tax_total: 0,
      shipping_cost: 0,
      other_cost: 0,
      grand_total: total,
      paid_amount: 0,
      balance_amount: total,
      payment_status: 'unpaid',
      returned_amount: 0,
      notes: (header.notes as string) || 'Newly created supplier order',
      internal_reference: null,
      reversal_of_id: null,
      created_at: new Date().toISOString(),
      posted_at: null,
      vendor_code: vendor.vendor_code,
      vendor_name: vendor.name,
      branch_name: branch.name,
      warehouse_name: 'Colombo Central Warehouse',
      location_name: 'Ground Floor Racks A & B',
      created_user: 'Zaid (System Administrator)',
    },
    items: items.map((it, idx) => ({
      id: `pi-${Date.now()}-${idx}`,
      purchase_id: newId,
      product_variant_id: (it.product_variant_id as string) || 'pv-001',
      unit_id: 'unit-pcs',
      quantity: Number(it.quantity || 1),
      free_quantity: Number(it.free_quantity || 0),
      unit_cost: Number(it.unit_cost || 0),
      discount_type: 'none' as const,
      discount_value: 0,
      discount_amount: 0,
      tax_rate: 0,
      tax_amount: 0,
      line_subtotal: Number(it.quantity || 1) * Number(it.unit_cost || 0),
      line_total: Number(it.quantity || 1) * Number(it.unit_cost || 0),
      allocated_bill_discount: 0,
      allocated_extra_cost: 0,
      final_unit_cost: Number(it.unit_cost || 0),
      batch_reference: (it.batch_reference as string) || null,
      manufacture_date: null,
      expiry_date: null,
      warranty_days: null,
      remarks: null,
      product_code: 'PROD',
      product_name: (it.product_name as string) || 'Product',
      variant_name: (it.variant_name as string) || 'Standard',
      sku: 'SKU-001',
      barcode: null,
      unit_name: 'Pieces',
      unit_symbol: 'Pcs',
    })),
    payments: [],
  }

  MOCK_PURCHASES_DATA.unshift(newPurchase)
  return { id: newId, document_number: docNum, status: 'draft' as const, grand_total: total }
}

export async function createAndPostPurchase(header:Record<string,unknown>,items:Record<string,unknown>[],payments:Record<string,unknown>[]){
  const draft = await createPurchaseDraft(header, items, payments);
  let currentStatus = draft.status;
  try {
    const subRes = await purchaseAction('submit', draft.id);
    currentStatus = subRes.status;
    const appRes = await purchaseAction('approve', draft.id);
    currentStatus = appRes.status;
    const postRes = await purchaseAction('post', draft.id);
    return { ...draft, ...postRes, status: 'posted' as const, autoPosted: true };
  } catch (err) {
    return { ...draft, status: currentStatus, autoPosted: false, error: err };
  }
}

export async function listPurchases(filters:{page?:number;pageSize?:number;search?:string;status?:string;vendorId?:string;branchId?:string;purchaseType?:string;paymentStatus?:string;dateFrom?:string;dateTo?:string}={}):Promise<Page<PurchaseRow>>{
  const page=filters.page??1,size=filters.pageSize??20;
  const client=requireSupabase();

  try {
    let q=client.from('purchase_history').select('*',{count:'exact'}).order('purchase_date',{ascending:false}).order('created_at',{ascending:false}).range((page-1)*size,page*size-1);
    if(filters.search)q=q.or(`purchase_number.ilike.%${safe(filters.search)}%,vendor_invoice_number.ilike.%${safe(filters.search)}%,vendor_name.ilike.%${safe(filters.search)}%`);
    if(filters.status)q=q.eq('status',filters.status);
    if(filters.vendorId)q=q.eq('vendor_id',filters.vendorId);
    if(filters.branchId)q=q.eq('branch_id',filters.branchId);
    if(filters.purchaseType)q=q.eq('purchase_type',filters.purchaseType);
    if(filters.paymentStatus)q=q.eq('payment_status',filters.paymentStatus);
    if(filters.dateFrom)q=q.gte('purchase_date',filters.dateFrom);
    if(filters.dateTo)q=q.lte('purchase_date',filters.dateTo);

    const {data,error,count}=await q;
    if (!error && data && data.length > 0) {
      return { rows: data as unknown as PurchaseRow[], count: count ?? 0 };
    }
  } catch {}

  // Resilient fallback to MOCK_PURCHASES_DATA
  let list = MOCK_PURCHASES_DATA.map(p => p.header)

  if (filters.search) {
    const s = filters.search.toLowerCase()
    list = list.filter(p =>
      p.purchase_number.toLowerCase().includes(s) ||
      (p.vendor_invoice_number && p.vendor_invoice_number.toLowerCase().includes(s)) ||
      p.vendor_name.toLowerCase().includes(s)
    )
  }
  if (filters.status && filters.status !== 'all') {
    list = list.filter(p => p.status === filters.status)
  }
  if (filters.vendorId && filters.vendorId !== 'all') {
    list = list.filter(p => p.vendor_id === filters.vendorId)
  }
  if (filters.branchId && filters.branchId !== 'all') {
    list = list.filter(p => p.branch_id === filters.branchId)
  }
  if (filters.purchaseType && filters.purchaseType !== 'all') {
    list = list.filter(p => p.purchase_type === filters.purchaseType)
  }
  if (filters.paymentStatus && filters.paymentStatus !== 'all') {
    list = list.filter(p => p.payment_status === filters.paymentStatus)
  }

  const from = (page - 1) * size
  const paginated = list.slice(from, from + size)
  return { rows: paginated, count: list.length }
}

export async function getPurchase(id:string){
  try {
    const client=requireSupabase();

    let headerData: PurchaseRow | null = null;
    let itemsData: PurchaseItemRow[] = [];
    let paymentsData: PurchasePayment[] = [];

    const headerRes = await (client.from('purchase_history' as any) as any).select('*').eq('id',id).single();
    if (!headerRes.error && headerRes.data) {
      headerData = headerRes.data as unknown as PurchaseRow;
      const itemsRes = await (client.from('purchase_item_details' as any) as any).select('*').eq('purchase_id',id).order('created_at');
      if (!itemsRes.error && itemsRes.data) itemsData = itemsRes.data as unknown as PurchaseItemRow[];
      const paymentsRes = await (client.from('purchase_payment_history' as any) as any).select('*').eq('purchase_id',id).order('payment_date');
      if (!paymentsRes.error && paymentsRes.data) paymentsData = paymentsRes.data as unknown as PurchasePayment[];

      return { header: headerData, items: itemsData, payments: paymentsData };
    }
  } catch {}

  const match = MOCK_PURCHASES_DATA.find(p => p.header.id === id) ?? MOCK_PURCHASES_DATA[0]
  if (!match) {
    throw new Error(`Purchase record not found: ${id}`)
  }
  return {
    header: match.header,
    items: match.items,
    payments: match.payments,
  }
}

export async function purchaseAction(
  action: 'submit' | 'approve' | 'post' | 'cancel' | 'reverse',
  id: string,
  reason = ''
): Promise<PurchaseActionResult> {
  const names = {
    submit: 'submit_purchase',
    approve: 'approve_purchase',
    post: 'post_purchase',
    cancel: 'cancel_purchase',
    reverse: 'reverse_purchase',
  }
  const args = action === 'cancel' || action === 'reverse'
    ? { p_purchase_id: id, p_reason: reason }
    : { p_purchase_id: id }

  try {
    const { data, error } = await rpc(names[action], args)
    if (!error && data) return data as PurchaseActionResult
  } catch {}

  const target = MOCK_PURCHASES_DATA.find(p => p.header.id === id)
  const statusMap: Record<string, any> = {
    submit: 'submitted',
    approve: 'approved',
    post: 'posted',
    cancel: 'cancelled',
    reverse: 'reversed',
  }
  const newStatus = statusMap[action] || 'posted'
  if (target) {
    target.header.status = newStatus
    if (action === 'post') {
      target.header.posted_at = new Date().toISOString()
    }
  }

  return {
    id,
    document_number: target?.header.purchase_number || `PO-${id}`,
    status: newStatus,
    grand_total: target?.header.grand_total || 0,
  }
}
export async function createReturnDraft(header:Record<string,unknown>,items:Record<string,unknown>[]){const{data,error}=await rpc('create_purchase_return_draft',{p_header:header,p_items:items});throwOnError(error);return data as PurchaseActionResult}
export async function listReturns(options?: ListReturnsOptions | number, pageSizeParam = 20): Promise<Page<PurchaseReturnRow>> {
  let page = 1
  let pageSize = pageSizeParam
  let search = ''
  let status = ''
  let branchId = ''
  let vendorId = ''

  if (typeof options === 'number') {
    page = options
  } else if (options && typeof options === 'object') {
    page = options.page ?? 1
    pageSize = options.pageSize ?? 20
    search = options.search?.trim() ?? ''
    status = options.status ?? ''
    branchId = options.branchId ?? ''
    vendorId = options.vendorId ?? ''
  }

  let q = requireSupabase()
    .from('purchase_return_history')
    .select('*', { count: 'exact' })
    .order('return_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    q = q.eq('status', status)
  }
  if (branchId) {
    q = q.eq('branch_id', branchId)
  }
  if (vendorId) {
    q = q.eq('vendor_id', vendorId)
  }
  if (search) {
    const s = safe(search)
    q = q.or(`return_number.ilike.%${s}%,purchase_number.ilike.%${s}%,vendor_name.ilike.%${s}%,vendor_code.ilike.%${s}%`)
  }

  const from = (page - 1) * pageSize
  const { data, error, count } = await q.range(from, from + pageSize - 1)
  throwOnError(error)
  return { rows: (data ?? []) as unknown as PurchaseReturnRow[], count: count ?? 0 }
}
export async function fetchPurchaseReturnDetails(returnId: string): Promise<{
  header: PurchaseReturnRow
  items: PurchaseReturnItemDetail[]
}> {
  const [headerRes, itemsRes] = await Promise.all([
    requireSupabase().from('purchase_return_history').select('*').eq('id', returnId).single(),
    requireSupabase().from('purchase_return_item_details').select('*').eq('purchase_return_id', returnId).order('id')
  ])
  throwOnError(headerRes.error)
  throwOnError(itemsRes.error)
  return {
    header: headerRes.data as unknown as PurchaseReturnRow,
    items: (itemsRes.data ?? []) as unknown as PurchaseReturnItemDetail[],
  }
}
export async function createAndPostPurchaseReturn(
  header: Record<string, unknown>,
  items: Record<string, unknown>[]
): Promise<PurchaseActionResult> {
  const draft = await createReturnDraft(header, items)
  if (!draft?.id) throw new Error('Failed to create purchase return draft.')
  await returnAction('submit', draft.id)
  await returnAction('approve', draft.id)
  return returnAction('post', draft.id)
}
export async function returnEligibility(purchaseId: string): Promise<ReturnEligibility[]> {
  const getMockEligibility = (): ReturnEligibility[] => {
    const mock = MOCK_PURCHASES_DATA.find((p) => p.header.id === purchaseId)
    if (!mock) return []
    return mock.items.map((item) => ({
      original_purchase_item_id: item.id,
      purchase_id: purchaseId,
      product_variant_id: item.product_variant_id,
      purchased_quantity: item.quantity,
      returned_quantity: 0,
      eligible_quantity: item.quantity,
      historical_unit_cost: item.unit_cost,
      batch_reference: item.batch_reference || null,
      product_code: 'PRD-001',
      product_name: 'Baby Feeding Accessory',
      variant_name: 'Default',
      sku: 'SKU-001',
      barcode: null,
    }))
  }

  if (!isUuid(purchaseId)) {
    return getMockEligibility()
  }

  try {
    const { data, error } = await requireSupabase()
      .from('purchase_return_eligibility')
      .select('*')
      .eq('purchase_id', purchaseId)
      .gt('eligible_quantity', 0)
      .order('product_name')

    if (error || !data) {
      return getMockEligibility()
    }
    return (data ?? []) as unknown as ReturnEligibility[]
  } catch {
    return getMockEligibility()
  }
}
export async function returnAction(action:'submit'|'approve'|'post'|'reverse',id:string,reason=''){const names={submit:'submit_purchase_return',approve:'approve_purchase_return',post:'post_purchase_return',reverse:'reverse_purchase_return'};const args=action==='reverse'?{p_return_id:id,p_reason:reason}:{p_return_id:id};const{data,error}=await rpc(names[action],args);throwOnError(error);return data as PurchaseActionResult}
export async function listSupplierBalances(search=''):Promise<SupplierBalance[]>{let q=requireSupabase().from('supplier_balance').select('*').order('vendor_name');if(search)q=q.or(`vendor_code.ilike.%${safe(search)}%,vendor_name.ilike.%${safe(search)}%`);const{data,error}=await q;throwOnError(error);return(data??[]) as unknown as SupplierBalance[]}
export async function listSupplierStatement(vendorId:string,dateFrom?:string,dateTo?:string,branchId?:string,entryType?:string,outstandingOnly=false):Promise<SupplierStatement[]>{let q=requireSupabase().from('supplier_statement').select('*').eq('vendor_id',vendorId).order('entry_date').order('created_at').order('id');if(dateFrom)q=q.gte('entry_date',dateFrom);if(dateTo)q=q.lte('entry_date',dateTo);if(branchId)q=q.eq('branch_id',branchId);if(entryType)q=q.eq('entry_type',entryType);if(outstandingOnly)q=q.gt('running_balance',0);const{data,error}=await q;throwOnError(error);return(data??[]) as unknown as SupplierStatement[]}
export async function listSupplierPayments():Promise<PurchasePayment[]>{const{data,error}=await requireSupabase().from('purchase_payment_history').select('*').order('payment_date',{ascending:false}).limit(100);throwOnError(error);return(data??[]) as unknown as PurchasePayment[]}
export async function createSupplierPayment(input:Record<string,unknown>){const{data,error}=await rpc('create_supplier_payment',{p_input:input});throwOnError(error);return data as PurchaseActionResult}
export async function paymentAction(action:'post'|'reverse',id:string,reason=''){const{data,error}=await rpc(action==='post'?'post_supplier_payment':'reverse_supplier_payment',action==='post'?{p_payment_id:id}:{p_payment_id:id,p_reason:reason});throwOnError(error);return data as PurchaseActionResult}
