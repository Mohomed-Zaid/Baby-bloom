import { requireSupabase,throwOnError } from './client'
import type { PurchaseActionResult,PurchaseItemRow,PurchasePayment,PurchaseProduct,PurchaseReturnRow,PurchaseReturnItemDetail,ListReturnsOptions,PurchaseRow,ReturnEligibility,SupplierBalance,SupplierStatement } from '../types/purchasing'

type Page<T>={rows:T[];count:number};type RpcResult={data:unknown;error:{message:string}|null}
const rpc=(name:string,args:Record<string,unknown>)=>(requireSupabase().rpc as unknown as (n:string,a:Record<string,unknown>)=>Promise<RpcResult>)(name,args)
const safe=(value:string)=>value.replaceAll(',',' ').replaceAll('%','\\%')

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
export async function createPurchaseDraft(header:Record<string,unknown>,items:Record<string,unknown>[],payments:Record<string,unknown>[]){const{data,error}=await rpc('create_purchase_draft',{p_header:header,p_items:items,p_payments:payments});throwOnError(error);return data as PurchaseActionResult}
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
    if (!error && data) {
      return { rows: data as unknown as PurchaseRow[], count: count ?? 0 };
    }
  } catch {
    // continue to fallback
  }

  // Fallback to purchases base table
  try {
    let fallbackQ = client
      .from('purchases')
      .select(`
        *,
        vendors:vendor_id(vendor_code, name),
        branches:branch_id(name),
        warehouses:warehouse_id(name),
        stock_locations:stock_location_id(name)
      `, { count: 'exact' })
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * size, page * size - 1);

    if (filters.status) fallbackQ = fallbackQ.eq('status', filters.status);
    if (filters.vendorId) fallbackQ = fallbackQ.eq('vendor_id', filters.vendorId);
    if (filters.branchId) fallbackQ = fallbackQ.eq('branch_id', filters.branchId);
    if (filters.purchaseType) fallbackQ = fallbackQ.eq('purchase_type', filters.purchaseType);
    if (filters.paymentStatus) fallbackQ = fallbackQ.eq('payment_status', filters.paymentStatus);
    if (filters.dateFrom) fallbackQ = fallbackQ.gte('purchase_date', filters.dateFrom);
    if (filters.dateTo) fallbackQ = fallbackQ.lte('purchase_date', filters.dateTo);

    const { data: fbData, error: fbError, count: fbCount } = await fallbackQ;
    if (!fbError && fbData) {
      const rows = (fbData as any[]).map(raw => ({
        ...raw,
        vendor_code: raw.vendors?.vendor_code || '',
        vendor_name: raw.vendors?.name || '',
        branch_name: raw.branches?.name || '',
        warehouse_name: raw.warehouses?.name || '',
        location_name: raw.stock_locations?.name || '',
        created_user: null,
      })) as PurchaseRow[];
      return { rows, count: fbCount ?? rows.length };
    }
  } catch {
    // ignore
  }

  return { rows: [], count: 0 };
}

export async function getPurchase(id:string){
  const client=requireSupabase();

  let headerData: PurchaseRow | null = null;
  let itemsData: PurchaseItemRow[] = [];
  let paymentsData: PurchasePayment[] = [];

  // 1. Header (try view, fallback to purchases base table)
  const headerRes = await client.from('purchase_history').select('*').eq('id',id).single();
  if (headerRes.error) {
    const fallbackHeader = await client
      .from('purchases')
      .select(`
        *,
        vendors:vendor_id(vendor_code, name),
        branches:branch_id(name),
        warehouses:warehouse_id(name),
        stock_locations:stock_location_id(name)
      `)
      .eq('id', id)
      .single();

    if (fallbackHeader.error) {
      throw fallbackHeader.error;
    }
    const raw = fallbackHeader.data as any;
    headerData = {
      ...raw,
      vendor_code: raw.vendors?.vendor_code || '',
      vendor_name: raw.vendors?.name || '',
      branch_name: raw.branches?.name || '',
      warehouse_name: raw.warehouses?.name || '',
      location_name: raw.stock_locations?.name || '',
      created_user: null,
    };
  } else {
    headerData = headerRes.data as unknown as PurchaseRow;
  }

  // 2. Items (try view, fallback to purchase_items base table)
  const itemsRes = await client.from('purchase_item_details').select('*').eq('purchase_id',id).order('created_at');
  if (itemsRes.error) {
    const fallbackItems = await client
      .from('purchase_items')
      .select(`
        *,
        product_variants:product_variant_id(
          variant_name,
          sku,
          barcode,
          products:product_id(product_code, name)
        ),
        units:unit_id(name, symbol)
      `)
      .eq('purchase_id', id)
      .order('created_at');

    if (!fallbackItems.error && fallbackItems.data) {
      itemsData = (fallbackItems.data as any[]).map(raw => ({
        ...raw,
        product_code: raw.product_variants?.products?.product_code || '',
        product_name: raw.product_variants?.products?.name || '',
        variant_name: raw.product_variants?.variant_name || '',
        sku: raw.product_variants?.sku || '',
        barcode: raw.product_variants?.barcode || null,
        unit_name: raw.units?.name || '',
        unit_symbol: raw.units?.symbol || '',
      }));
    }
  } else {
    itemsData = (itemsRes.data ?? []) as unknown as PurchaseItemRow[];
  }

  // 3. Payments (try view, fallback to purchase_payments base table)
  const paymentsRes = await client.from('purchase_payment_history').select('*').eq('purchase_id',id).order('payment_date');
  if (paymentsRes.error) {
    const fallbackPayments = await client
      .from('purchase_payments')
      .select(`
        *,
        vendors:vendor_id(vendor_code, name),
        branches:branch_id(name)
      `)
      .eq('purchase_id', id)
      .order('payment_date');

    if (!fallbackPayments.error && fallbackPayments.data) {
      paymentsData = (fallbackPayments.data as any[]).map(raw => ({
        ...raw,
        vendor_code: raw.vendors?.vendor_code || '',
        vendor_name: raw.vendors?.name || '',
        branch_name: raw.branches?.name || '',
        purchase_number: null,
        bank_account_name: null,
      }));
    }
  } else {
    paymentsData = (paymentsRes.data ?? []) as unknown as PurchasePayment[];
  }

  return {
    header: headerData as PurchaseRow,
    items: itemsData,
    payments: paymentsData,
  };
}
export async function purchaseAction(action:'submit'|'approve'|'post'|'cancel'|'reverse',id:string,reason=''){const names={submit:'submit_purchase',approve:'approve_purchase',post:'post_purchase',cancel:'cancel_purchase',reverse:'reverse_purchase'};const args=action==='cancel'?{p_purchase_id:id,p_reason:reason}:action==='reverse'?{p_purchase_id:id,p_reason:reason}:{p_purchase_id:id};const{data,error}=await rpc(names[action],args);throwOnError(error);return data as PurchaseActionResult}
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
export async function returnEligibility(purchaseId:string):Promise<ReturnEligibility[]>{const{data,error}=await requireSupabase().from('purchase_return_eligibility').select('*').eq('purchase_id',purchaseId).gt('eligible_quantity',0).order('product_name');throwOnError(error);return(data??[]) as unknown as ReturnEligibility[]}
export async function returnAction(action:'submit'|'approve'|'post'|'reverse',id:string,reason=''){const names={submit:'submit_purchase_return',approve:'approve_purchase_return',post:'post_purchase_return',reverse:'reverse_purchase_return'};const args=action==='reverse'?{p_return_id:id,p_reason:reason}:{p_return_id:id};const{data,error}=await rpc(names[action],args);throwOnError(error);return data as PurchaseActionResult}
export async function listSupplierBalances(search=''):Promise<SupplierBalance[]>{let q=requireSupabase().from('supplier_balance').select('*').order('vendor_name');if(search)q=q.or(`vendor_code.ilike.%${safe(search)}%,vendor_name.ilike.%${safe(search)}%`);const{data,error}=await q;throwOnError(error);return(data??[]) as unknown as SupplierBalance[]}
export async function listSupplierStatement(vendorId:string,dateFrom?:string,dateTo?:string,branchId?:string,entryType?:string,outstandingOnly=false):Promise<SupplierStatement[]>{let q=requireSupabase().from('supplier_statement').select('*').eq('vendor_id',vendorId).order('entry_date').order('created_at').order('id');if(dateFrom)q=q.gte('entry_date',dateFrom);if(dateTo)q=q.lte('entry_date',dateTo);if(branchId)q=q.eq('branch_id',branchId);if(entryType)q=q.eq('entry_type',entryType);if(outstandingOnly)q=q.gt('running_balance',0);const{data,error}=await q;throwOnError(error);return(data??[]) as unknown as SupplierStatement[]}
export async function listSupplierPayments():Promise<PurchasePayment[]>{const{data,error}=await requireSupabase().from('purchase_payment_history').select('*').order('payment_date',{ascending:false}).limit(100);throwOnError(error);return(data??[]) as unknown as PurchasePayment[]}
export async function createSupplierPayment(input:Record<string,unknown>){const{data,error}=await rpc('create_supplier_payment',{p_input:input});throwOnError(error);return data as PurchaseActionResult}
export async function paymentAction(action:'post'|'reverse',id:string,reason=''){const{data,error}=await rpc(action==='post'?'post_supplier_payment':'reverse_supplier_payment',action==='post'?{p_payment_id:id}:{p_payment_id:id,p_reason:reason});throwOnError(error);return data as PurchaseActionResult}
