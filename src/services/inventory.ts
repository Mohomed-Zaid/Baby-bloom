import type { CurrentStockRow, InventoryActionResult, InventoryDocument, InventoryDocumentType, InventoryDraftInput, StockMovementRow } from '../types/inventory'
import { currentCompanyId } from './masterData'
import { requireSupabase, throwOnError } from './client'

export interface InventoryFilters {page:number;pageSize:number;search?:string;branchId?:string;warehouseId?:string;locationId?:string;categoryId?:string;brandId?:string;status?:string;lowStock?:boolean;movementType?:string;dateFrom?:string;dateTo?:string;variantId?:string;sortBy?:string;sortAscending?:boolean}
export interface InventoryPage<T>{rows:T[];count:number}
type RpcResult={data:unknown;error:{message:string}|null}
const rpc=(name:string,args:Record<string,unknown>)=>(requireSupabase().rpc as unknown as (n:string,a:Record<string,unknown>)=>Promise<RpcResult>)(name,args)

export async function createInventoryDraft(input:InventoryDraftInput):Promise<string>{
 const client=requireSupabase(),companyId=await currentCompanyId()
 const sequence=input.document_type==='stock_transfer'?'stock_transfer':'stock_adjustment'
 const {data:number,error:numberError}=await rpc('next_document_number',{p_company_id:companyId,p_branch_id:input.branch_id,p_sequence_type:sequence})
 throwOnError(numberError);if(!number)throw new Error('Document number could not be generated.')
 const {data:document,error}=await client.from('inventory_documents').insert({company_id:companyId,branch_id:input.branch_id,warehouse_id:input.warehouse_id,document_number:number,document_type:input.document_type,document_date:input.document_date,destination_branch_id:input.destination_branch_id||null,destination_warehouse_id:input.destination_warehouse_id||null,reason:input.reason||null,notes:input.notes||null,supporting_reference:input.supporting_reference||null,negative_stock_override:input.negative_stock_override??false} as never).select('*').single()
 throwOnError(error);if(!document)throw new Error('Inventory document was not returned.')
 const documentId=(document as InventoryDocument).id
 const rows=input.items.map(item=>({company_id:companyId,inventory_document_id:documentId,product_variant_id:item.product_variant_id,source_location_id:item.source_location_id,destination_location_id:item.destination_location_id||null,quantity:item.quantity,unit_cost:item.unit_cost,expected_quantity:item.expected_quantity??null,counted_quantity:item.counted_quantity??null,batch_reference:item.batch_reference||null,expiry_date:item.expiry_date||null,remarks:item.remarks||null}))
 const {error:itemError}=await client.from('inventory_document_items').insert(rows as never);throwOnError(itemError);return documentId
}

export async function listInventoryDocuments(type:InventoryDocumentType,page=1,pageSize=20):Promise<InventoryPage<InventoryDocument>>{
 const from=(page-1)*pageSize
 let query=requireSupabase().from('inventory_documents').select('*',{count:'exact'}).order('created_at',{ascending:false}).range(from,from+pageSize-1)
 query=type==='stock_adjustment_in'?query.in('document_type',['stock_adjustment_in','stock_adjustment_out','stock_count']):query.eq('document_type',type);const {data,error,count}=await query
 throwOnError(error);return{rows:(data??[]) as InventoryDocument[],count:count??0}
}

export async function inventoryAction(action:'submit'|'approve'|'post'|'reverse'|'reject'|'cancel',document:InventoryDocument,reason?:string):Promise<InventoryActionResult>{
 let name:string,args:Record<string,unknown>
 if(action==='submit'){name='submit_inventory_document';args={p_document_id:document.id}}
 else if(action==='approve'){name='approve_inventory_document';args={p_document_id:document.id}}
 else if(action==='reject'){name='reject_inventory_document';args={p_document_id:document.id,p_reason:reason??''}}
 else if(action==='cancel'){name='cancel_inventory_document';args={p_document_id:document.id,p_reason:reason??''}}
 else if(action==='reverse'){name='reverse_inventory_document';args={document_id:document.id,reason:reason??''}}
 else {name=({opening_stock:'post_opening_stock',stock_transfer:'post_stock_transfer',stock_adjustment_in:'post_stock_adjustment',stock_adjustment_out:'post_stock_adjustment',stock_count:'post_stock_adjustment',damaged_stock:'post_damaged_stock',stock_write_off:'post_stock_write_off',reversal:'post_stock_adjustment'} as Record<InventoryDocumentType,string>)[document.document_type];args={document_id:document.id}}
 const {data,error}=await rpc(name,args);throwOnError(error);return data as InventoryActionResult
}

export async function listCurrentStock(filters:InventoryFilters):Promise<InventoryPage<CurrentStockRow>>{
 const from=(filters.page-1)*filters.pageSize;const allowedSort=['product_name','quantity_on_hand','available_quantity','inventory_value','reorder_level'];const sortBy=allowedSort.includes(filters.sortBy??'')?filters.sortBy!:'product_name';let query=requireSupabase().from('current_stock').select('*',{count:'exact'}).range(from,from+filters.pageSize-1).order(sortBy,{ascending:filters.sortAscending??true}).order('product_variant_id')
 if(filters.search){const safe=filters.search.replaceAll(',',' ').replaceAll('%','\\%');query=query.or(`product_code.ilike.%${safe}%,product_name.ilike.%${safe}%,sku.ilike.%${safe}%,barcode.ilike.%${safe}%`)}
 if(filters.branchId)query=query.eq('branch_id',filters.branchId);if(filters.warehouseId)query=query.eq('warehouse_id',filters.warehouseId);if(filters.locationId)query=query.eq('stock_location_id',filters.locationId)
 if(filters.categoryId)query=query.eq('category_id',filters.categoryId);if(filters.brandId)query=query.eq('brand_id',filters.brandId);if(filters.status)query=query.eq('product_status',filters.status);if(filters.variantId)query=query.eq('product_variant_id',filters.variantId);if(filters.lowStock)query=query.eq('low_stock',true)
 const {data,error,count}=await query;throwOnError(error);return{rows:(data??[]) as CurrentStockRow[],count:count??0}
}

export async function listLowStock(filters:InventoryFilters):Promise<InventoryPage<CurrentStockRow&{shortage_quantity:number}>>{
 const from=(filters.page-1)*filters.pageSize;const allowedSort=['product_name','available_quantity','shortage_quantity','reorder_level','inventory_value'];const sortBy=allowedSort.includes(filters.sortBy??'')?filters.sortBy!:'shortage_quantity';let query=requireSupabase().from('low_stock_products').select('*',{count:'exact'}).range(from,from+filters.pageSize-1).order(sortBy,{ascending:filters.sortAscending??false}).order('product_variant_id')
 if(filters.branchId)query=query.eq('branch_id',filters.branchId);if(filters.locationId)query=query.eq('stock_location_id',filters.locationId)
 const {data,error,count}=await query;throwOnError(error);return{rows:(data??[]) as (CurrentStockRow&{shortage_quantity:number})[],count:count??0}
}

export async function listStockMovements(filters:InventoryFilters):Promise<InventoryPage<StockMovementRow>>{
 const from=(filters.page-1)*filters.pageSize;let query=requireSupabase().from('stock_movement_history').select('*',{count:'exact'}).range(from,from+filters.pageSize-1).order('movement_date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false})
 if(filters.search){const safe=filters.search.replaceAll(',',' ').replaceAll('%','\\%');query=query.or(`product_code.ilike.%${safe}%,product_name.ilike.%${safe}%,sku.ilike.%${safe}%,barcode.ilike.%${safe}%,reference_number.ilike.%${safe}%`)}
 if(filters.branchId)query=query.eq('branch_id',filters.branchId);if(filters.warehouseId)query=query.eq('warehouse_id',filters.warehouseId);if(filters.locationId)query=query.eq('stock_location_id',filters.locationId);if(filters.movementType)query=query.eq('movement_type',filters.movementType);if(filters.dateFrom)query=query.gte('movement_date',filters.dateFrom);if(filters.dateTo)query=query.lte('movement_date',filters.dateTo)
 const {data,error,count}=await query;throwOnError(error);return{rows:(data??[]) as StockMovementRow[],count:count??0}
}
