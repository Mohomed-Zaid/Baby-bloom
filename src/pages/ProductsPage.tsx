import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Barcode, CheckCircle2, Eye, ImagePlus, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { DataTable, type DataTableColumn } from '../components/common/DataTable'
import { PageHeader } from '../components/common/PageHeader'
import { SearchInput } from '../components/common/SearchInput'
import { StatusBadge } from '../components/common/StatusBadge'
import { formatLkr } from '../lib/currency'
import { getErrorMessage } from '../lib/errors'
import { addVariantOpeningStock } from '../services/inventory'
import { requireSupabase, throwOnError } from '../services/client'
import { createMasterRecord, createProductWithVariant, getMasterRecord, listLookup, listMasterPage, resolveBarcode, updateMasterRecord, type MasterRecord } from '../services/masterData'
import { listProductVariants, type ProductVariantWithStock } from '../services/productVariants'
import { useAuthStore } from '../stores/authStore'

const schema=z.object({product_code:z.string().trim().min(1),name:z.string().trim().min(1),description:z.string().optional(),category_id:z.string().uuid(),brand_id:z.string().optional(),base_unit_id:z.string().uuid(),product_status:z.enum(['active','inactive','discontinued']),has_variants:z.boolean(),track_stock:z.boolean(),allow_negative_stock:z.boolean(),minimum_stock:z.number().nonnegative(),reorder_level:z.number().nonnegative(),default_warranty_days:z.number().int().nonnegative(),preferred_vendor_id:z.string().optional(),image_url:z.string().url().optional().or(z.literal('')),notes:z.string().optional(),sku:z.string().trim().min(1),barcode:z.string().optional(),variant_name:z.string().trim().min(1),purchase_price:z.number().nonnegative(),average_cost:z.number().nonnegative(),retail_price:z.number().nonnegative(),wholesale_price:z.number().nonnegative(),special_price:z.number().nonnegative(),minimum_price:z.number().nonnegative(),commission_percentage:z.number().min(0).max(100),default_discount_percentage:z.number().min(0).max(100),initial_stock:z.number().nonnegative().optional()})
type Values=z.infer<typeof schema>
const defaults:Values={product_code:'',name:'',description:'',category_id:'',brand_id:'',base_unit_id:'',product_status:'active',has_variants:false,track_stock:true,allow_negative_stock:false,minimum_stock:0,reorder_level:0,default_warranty_days:0,preferred_vendor_id:'',image_url:'',notes:'',sku:'',barcode:'',variant_name:'Default',purchase_price:0,average_cost:0,retail_price:0,wholesale_price:0,special_price:0,minimum_price:0,commission_percentage:0,default_discount_percentage:0,initial_stock:0}
const variantSchema=z.object({sku:z.string().trim().min(1),barcode:z.string().optional(),variant_name:z.string().trim().min(1),size:z.string().optional(),colour:z.string().optional(),retail_price:z.number().nonnegative(),wholesale_price:z.number().nonnegative(),special_price:z.number().nonnegative(),purchase_price:z.number().nonnegative(),average_cost:z.number().nonnegative(),minimum_price:z.number().nonnegative(),initial_stock:z.number().nonnegative().optional()})
type VariantValues=z.infer<typeof variantSchema>
const variantDefaults:VariantValues={sku:'',barcode:'',variant_name:'',size:'',colour:'',retail_price:0,wholesale_price:0,special_price:0,purchase_price:0,average_cost:0,minimum_price:0,initial_stock:0}

export function ProductsPage(){
  const {id}=useParams(),navigate=useNavigate(),queryClient=useQueryClient(),permissions=useAuthStore(s=>s.user?.permissions)
  const editingId=id&&id!=='new'?id:null,canCreate=permissions?.includes('products.create')??false,canUpdate=permissions?.includes('products.update')??false,canCost=permissions?.includes('products.view_cost')??false
  const [page,setPage]=useState(1),[search,setSearch]=useState(''),[category,setCategory]=useState('all'),[brand,setBrand]=useState('all'),[status,setStatus]=useState('all'),[barcodeResult,setBarcodeResult]=useState<string|null>(null)
  const [stockModalVariant,setStockModalVariant]=useState<ProductVariantWithStock|null>(null)
  const [stockModalQty,setStockModalQty]=useState<number>(10)
  const [stockModalCost,setStockModalCost]=useState<number>(0)
  const [stockNotice,setStockNotice]=useState<string|null>(null)
  const [modalBranchId, setModalBranchId] = useState('')
  const [modalWarehouseId, setModalWarehouseId] = useState('')
  const [modalLocationId, setModalLocationId] = useState('')

  const branches = useQuery({
    queryKey: ['lookup', 'branches'],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('branches')
        .select('id, name, is_head_office')
        .eq('is_active', true)
        .order('is_head_office', { ascending: false })
        .order('name', { ascending: true })
      throwOnError(error)
      return ((data ?? []) as { id: string; name: string; is_head_office: boolean }[]).map(b => ({
        value: b.id,
        label: b.is_head_office ? `🏢 ${b.name} (HQ)` : b.name,
      }))
    }
  })
  const effectiveModalBranchId = modalBranchId || branches.data?.[0]?.value || ''

  const modalWarehouses = useQuery({
    queryKey: ['lookup', 'warehouses', effectiveModalBranchId],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('warehouses')
        .select('id, name, is_default')
        .eq('branch_id', effectiveModalBranchId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true })
      throwOnError(error)
      return ((data ?? []) as { id: string; name: string; is_default: boolean }[]).map(w => ({
        value: w.id,
        label: w.is_default ? `⭐ ${w.name} (Default)` : w.name,
      }))
    },
    enabled: !!effectiveModalBranchId
  })
  const effectiveModalWarehouseId = modalWarehouseId || modalWarehouses.data?.[0]?.value || ''

  const modalLocations = useQuery({
    queryKey: ['lookup', 'locations', effectiveModalWarehouseId],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from('stock_locations')
        .select('id, name, code')
        .eq('warehouse_id', effectiveModalWarehouseId)
        .eq('is_active', true)
        .order('name', { ascending: true })
      throwOnError(error)
      return ((data ?? []) as { id: string; name: string; code: string }[]).map(l => ({
        value: l.id,
        label: `${l.name} (${l.code})`,
      }))
    },
    enabled: !!effectiveModalWarehouseId
  })
  const effectiveModalLocationId = modalLocationId || modalLocations.data?.[0]?.value || ''

  const form=useForm<Values>({resolver:zodResolver(schema),defaultValues:defaults})
  const variantForm=useForm<VariantValues>({resolver:zodResolver(variantSchema),defaultValues:variantDefaults})
  const categories=useQuery({queryKey:['lookup','categories'],queryFn:()=>listLookup('categories','name',{is_active:true})})
  const brands=useQuery({queryKey:['lookup','brands'],queryFn:()=>listLookup('brands','name',{is_active:true})})
  const units=useQuery({queryKey:['lookup','units'],queryFn:()=>listLookup('units','name',{is_active:true})})
  const vendors=useQuery({queryKey:['lookup','vendors'],queryFn:()=>listLookup('vendors','name',{status:'active'})})
  const filters:Record<string,string>={...(category!=='all'?{category_id:category}:{}),...(brand!=='all'?{brand_id:brand}:{}),...(status!=='all'?{product_status:status}:{}),...(barcodeResult?{id:barcodeResult}:{})}
  const list=useQuery({queryKey:['products',page,search,filters],queryFn:()=>listMasterPage({table:'products',page,pageSize:20,search,searchColumns:['product_code','name'],filters,orderBy:'name'}),placeholderData:keepPreviousData})
  const detail=useQuery({queryKey:['products','detail',editingId],queryFn:()=>getMasterRecord('products',editingId!),enabled:Boolean(editingId)})
  const variants=useQuery({queryKey:['variants',editingId],queryFn:()=>listProductVariants(editingId!),enabled:Boolean(editingId)})
  useEffect(()=>{if(detail.data){const d=detail.data;form.reset({...defaults,...Object.fromEntries(Object.keys(defaults).filter(key=>key in d).map(key=>[key,d[key]])),sku:'EXISTING',variant_name:'Default'} as Values)}else if(id==='new')form.reset(defaults)},[detail.data,form,id])
  const save=useMutation({mutationFn:async(values:Values)=>{const {sku,barcode,variant_name,purchase_price,average_cost,retail_price,wholesale_price,special_price,minimum_price,commission_percentage,default_discount_percentage,initial_stock,...product}=values;if(editingId){await updateMasterRecord('products',editingId,product);return}const createdId=await createProductWithVariant({product,variant:{sku,barcode,variant_name,purchase_price,average_cost,retail_price,wholesale_price,special_price,minimum_price,commission_percentage,default_discount_percentage,attributes:{}}});if(initial_stock&&initial_stock>0&&createdId){const vars=await listProductVariants(createdId);if(vars[0]?.id){await addVariantOpeningStock({variantId:vars[0].id,quantity:initial_stock,unitCost:purchase_price>0?purchase_price:(average_cost>0?average_cost:1),notes:`Opening stock for product ${product.name}`})}}},onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:['products']});navigate('/products')}})
  const addVariant=useMutation({mutationFn:async(values:VariantValues)=>{const {initial_stock,...variantData}=values;const newVariantId=await createMasterRecord('product_variants',{...variantData,product_id:editingId,attributes:{},commission_percentage:0,default_discount_percentage:0,is_default:false,is_active:true});if(initial_stock&&initial_stock>0){await addVariantOpeningStock({variantId:newVariantId,quantity:initial_stock,unitCost:values.purchase_price>0?values.purchase_price:(values.average_cost>0?values.average_cost:1),notes:`Opening stock for variant ${values.variant_name||values.sku}`})}},onSuccess:async()=>{variantForm.reset(variantDefaults);await queryClient.invalidateQueries({queryKey:['variants',editingId]});await queryClient.invalidateQueries({queryKey:['products']});setStockNotice('Variant and opening stock added successfully!')}})
  const addExistingStock=useMutation({mutationFn:async()=>{if(!stockModalVariant||stockModalQty<=0)return;await addVariantOpeningStock({variantId:stockModalVariant.id,quantity:stockModalQty,unitCost:stockModalCost>0?stockModalCost:(Number(stockModalVariant.purchase_price)||Number(stockModalVariant.average_cost)||1),branchId:effectiveModalBranchId,warehouseId:effectiveModalWarehouseId,locationId:effectiveModalLocationId,notes:`Added stock for variant ${stockModalVariant.sku}`})},onSuccess:async()=>{setStockNotice(`Successfully added ${stockModalQty} units to stock!`);setStockModalVariant(null);await queryClient.invalidateQueries({queryKey:['variants',editingId]});await queryClient.invalidateQueries({queryKey:['products']});await queryClient.invalidateQueries({queryKey:['current-stock']});await queryClient.invalidateQueries({queryKey:['pos-products']});await queryClient.invalidateQueries({queryKey:['cart-stock-state']})}})
  const barcodeSearch=async()=>{if(!search.trim()){setBarcodeResult(null);return}const result=await resolveBarcode(search.trim());setBarcodeResult(result[0]?.product_id??null);setPage(1)}
  const columns:DataTableColumn<MasterRecord>[]=[{key:'code',header:'Code',render:r=>String(r.product_code)},{key:'name',header:'Product',render:r=><button className="link-button" onClick={()=>navigate(`/products/${r.id}`)}>{String(r.name)}</button>},{key:'status',header:'Status',render:r=><StatusBadge status={String(r.product_status)==='active'?'active':'inactive'}/>},{key:'minimum',header:'Minimum',align:'right',render:r=>Number(r.minimum_stock).toFixed(4)},{key:'reorder',header:'Reorder',align:'right',render:r=>Number(r.reorder_level).toFixed(4)},{key:'warranty',header:'Warranty',render:r=>`${String(r.default_warranty_days)} days`},{key:'actions',header:'',align:'right',render:r=><button className="table-action" onClick={()=>navigate(`/products/${r.id}`)}><Eye size={14}/></button>}]
  const pages=Math.max(1,Math.ceil((list.data?.count??0)/20))

  return <div className="page-stack">
    <PageHeader title="Products" description="Product, pricing, variant and barcode masters." breadcrumbs={[{label:'Master data'},{label:'Products'}]} actions={canCreate&&<button className="button primary" onClick={()=>navigate('/products/new')}><Plus size={15}/>Add product</button>}/>
    
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">
          📦
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Products</p>
          <p className="text-xl font-bold text-gray-900">{list.data?.count ?? 0} registered</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg">
          ✅
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Catalog Status</p>
          <p className="text-xl font-bold text-blue-600">Active & Ready</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inventory Stock</p>
          <p className="text-xs text-gray-400 mt-0.5">Receive or adjust stock</p>
        </div>
        <button
          type="button"
          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200 transition-colors"
          onClick={() => navigate('/inventory/opening-stock')}
        >
          + Add Stock
        </button>
      </div>
    </div>

    <section className="content-panel master-panel"><div className="master-toolbar"><SearchInput value={search} onChange={e=>{setSearch(e.target.value);setBarcodeResult(null)}} onClear={()=>{setSearch('');setBarcodeResult(null)}} placeholder="Product code, name or barcode"/><button className="button secondary" onClick={()=>void barcodeSearch()}><Barcode size={15}/>Resolve barcode</button><Select value={category} set={setCategory} label="All categories" options={categories.data}/><Select value={brand} set={setBrand} label="All brands" options={brands.data}/><select className="compact-select" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="discontinued">Discontinued</option></select></div>
      {barcodeResult&&<div className="filter-chip">Barcode match applied <button onClick={()=>setBarcodeResult(null)}><X size={12}/></button></div>}
      {list.isLoading?<div className="panel-state"><span className="spinner"/>Loading products...</div>:list.isError?<div className="panel-state error-state">{getErrorMessage(list.error)}</div>:<DataTable rows={list.data?.rows??[]} columns={columns} rowKey={r=>r.id} emptyTitle="No products found" emptyDescription="Create a product or change the filters."/>}
      <div className="pagination"><button className="button secondary" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {pages}</span><button className="button secondary" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Next</button></div>
    </section>
    {id&&<div className="drawer-layer"><section className="record-drawer product-drawer" role="dialog" aria-modal="true"><header><div><span className="eyebrow">Product master</span><h2>{editingId?'Product details':'Add product'}</h2></div><button className="icon-button" onClick={()=>navigate('/products')}><X size={18}/></button></header>
      <form className="master-form" onSubmit={e=>void form.handleSubmit(v=>save.mutate(v))(e)}><div className="form-section-title">Product identity</div><div className="form-grid">
        <Field label="Product code" error={form.formState.errors.product_code?.message}><input className="text-input" {...form.register('product_code')}/></Field><Field label="Name" error={form.formState.errors.name?.message}><input className="text-input" {...form.register('name')}/></Field><Field label="Category"><select className="text-input" {...form.register('category_id')}><option value="">Select...</option>{categories.data?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></Field><Field label="Brand"><select className="text-input" {...form.register('brand_id')}><option value="">None</option>{brands.data?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></Field><Field label="Base unit"><select className="text-input" {...form.register('base_unit_id')}><option value="">Select...</option>{units.data?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></Field><Field label="Preferred vendor"><select className="text-input" {...form.register('preferred_vendor_id')}><option value="">None</option>{vendors.data?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
      </div><ProductSettings form={form}/>
      {!editingId&&<><div className="form-section-title">Required default variant</div><div className="form-grid"><Field label="SKU"><input className="text-input" {...form.register('sku')}/></Field><Field label="Barcode"><input className="text-input" {...form.register('barcode')}/></Field><Field label="Variant name"><input className="text-input" {...form.register('variant_name')}/></Field><Money label="Retail price" name="retail_price" form={form}/><Money label="Wholesale price" name="wholesale_price" form={form}/><Money label="Special price" name="special_price" form={form}/>{canCost&&<><Money label="Purchase price" name="purchase_price" form={form}/><Money label="Average cost" name="average_cost" form={form}/><Money label="Minimum price" name="minimum_price" form={form}/></>}<Money label="Commission %" name="commission_percentage" form={form}/><Money label="Default discount %" name="default_discount_percentage" form={form}/><Field label="Opening Stock (Qty)"><input className="text-input" type="number" step="1" min="0" placeholder="0" {...form.register('initial_stock',{valueAsNumber:true})}/></Field></div></>}
      {editingId&&<div className="variant-panel">
        <div className="form-section-title">Sellable variants, barcodes and stock</div>
        {stockNotice&&<div style={{background:'#f0fdf4',border:'1px solid #86efac',padding:'8px 12px',borderRadius:6,color:'#15803d',fontSize:13,display:'flex',alignItems:'center',gap:6,marginBottom:10}}><CheckCircle2 size={16}/>{stockNotice}</div>}
        {variants.isLoading?<div className="panel-state">Loading variants...</div>:<table className="mini-table">
          <thead><tr><th>SKU</th><th>Variant</th><th>Barcode</th><th>Stock on hand</th>{canCost&&<th>Average cost</th>}<th>Retail</th><th>Wholesale</th><th>Actions</th></tr></thead>
          <tbody>{variants.data?.map(v=><tr key={v.id}>
            <td>{v.sku}</td>
            <td>{v.variant_name}</td>
            <td>{v.barcode??'-'}</td>
            <td>
              {Number(v.quantity_on_hand ?? 0) > 0 ? (
                <span style={{ color: '#047857', fontWeight: 700 }}>
                  {Number(v.quantity_on_hand).toFixed(0)} in stock
                </span>
              ) : (
                <span style={{ color: '#dc2626', fontWeight: 600, background: '#fef2f2', padding: '2px 6px', borderRadius: 4 }}>
                  0 (Out of stock)
                </span>
              )}
            </td>
            {canCost&&<td>{v.average_cost==null?'Restricted':formatLkr(v.average_cost)}</td>}
            <td>{formatLkr(v.retail_price)}</td>
            <td>{formatLkr(v.wholesale_price)}</td>
            <td>
              <button
                type="button"
                className="button secondary"
                style={{ padding: '2px 8px', fontSize: 11, background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}
                onClick={() => {
                  setStockModalVariant(v)
                  setStockModalQty(10)
                  setStockModalCost(Number(v.purchase_price) || Number(v.average_cost) || 0)
                }}
              >
                + Add Stock
              </button>
            </td>
          </tr>)}</tbody>
        </table>}
        {Number(variants.data?.[0]?.quantity_on_hand ?? 0) === 0 && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: 8, marginTop: 10, fontSize: 13, color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>💡 Current stock on hand is <strong>0</strong>. Add stock directly to this variant?</span>
            <button
              type="button"
              className="button primary"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => {
                if (variants.data?.[0]) {
                  setStockModalVariant(variants.data[0])
                  setStockModalQty(10)
                  setStockModalCost(Number(variants.data[0].purchase_price) || Number(variants.data[0].average_cost) || 0)
                }
              }}
            >
              + Add Stock Now
            </button>
          </div>
        )}
        <details className="variant-create" open><summary>Add another variant</summary><div className="form-grid"><Field label="SKU"><input className="text-input" {...variantForm.register('sku')}/></Field><Field label="Variant name"><input className="text-input" {...variantForm.register('variant_name')}/></Field><Field label="Barcode"><input className="text-input" {...variantForm.register('barcode')}/></Field><Field label="Size"><input className="text-input" {...variantForm.register('size')}/></Field><Field label="Colour"><input className="text-input" {...variantForm.register('colour')}/></Field><VariantMoney label="Retail price" name="retail_price" form={variantForm}/><VariantMoney label="Wholesale price" name="wholesale_price" form={variantForm}/><VariantMoney label="Special price" name="special_price" form={variantForm}/>{canCost&&<><VariantMoney label="Purchase price" name="purchase_price" form={variantForm}/><VariantMoney label="Average cost" name="average_cost" form={variantForm}/><VariantMoney label="Minimum price" name="minimum_price" form={variantForm}/></>}<Field label="Initial stock quantity"><input className="text-input" type="number" step="1" min="0" placeholder="0" {...variantForm.register('initial_stock',{valueAsNumber:true})}/></Field></div>{addVariant.isError&&<div className="inline-error">{getErrorMessage(addVariant.error)}</div>}<button className="button primary" type="button" disabled={addVariant.isPending} onClick={()=>void variantForm.handleSubmit(value=>addVariant.mutate(value))()}><Plus size={14}/>{addVariant.isPending?'Adding variant & stock...':'Add variant'}</button></details><p className="helper-text"><Barcode size={13}/> Additional barcodes resolve through the company-wide barcode registry. Cost values remain null unless products.view_cost is granted.</p></div>}
      {save.isError&&<div className="inline-error">{getErrorMessage(save.error)}</div>}<footer><button className="button secondary" type="button" onClick={()=>navigate('/products')}>Cancel</button>{(editingId?canUpdate:canCreate)&&<button className="button primary" disabled={save.isPending}>{save.isPending?'Saving...':'Save product'}</button>}</footer></form>
    </section></div>}

    {stockModalVariant && (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '420px', maxWidth: '90vw', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>Add Stock to Variant</h3>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>
                {stockModalVariant.variant_name} · SKU: {stockModalVariant.sku}
              </p>
            </div>
            <button type="button" onClick={() => setStockModalVariant(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Target Branch, Warehouse &amp; Location
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(branches.data?.length ?? 0) > 1 && (
                  <select
                    className="text-input"
                    style={{ padding: '6px 8px', fontSize: 13, gridColumn: 'span 2' }}
                    value={effectiveModalBranchId}
                    onChange={(e) => { setModalBranchId(e.target.value); setModalWarehouseId(''); setModalLocationId('') }}
                  >
                    {branches.data?.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                )}
                <select
                  className="text-input"
                  style={{ padding: '6px 8px', fontSize: 13 }}
                  value={effectiveModalWarehouseId}
                  onChange={(e) => { setModalWarehouseId(e.target.value); setModalLocationId('') }}
                >
                  {modalWarehouses.data?.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
                <select
                  className="text-input"
                  style={{ padding: '6px 8px', fontSize: 13 }}
                  value={effectiveModalLocationId}
                  onChange={(e) => setModalLocationId(e.target.value)}
                >
                  {modalLocations.data?.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              <span style={{ fontSize: 11, color: '#059669', marginTop: 4, display: 'block' }}>
                ✓ Stock will be immediately sellable at POS under this location.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                Quantity to Add (Units)
              </label>
              <input
                className="text-input"
                type="number"
                min="1"
                step="1"
                value={stockModalQty}
                onChange={(e) => setStockModalQty(Math.max(1, Number(e.target.value)))}
                style={{ width: '100%' }}
              />
            </div>

            {canCost && (
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Unit Cost (Rs.)
                </label>
                <input
                  className="text-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={stockModalCost}
                  onChange={(e) => setStockModalCost(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  Recorded in inventory cost layers and general ledger.
                </span>
              </div>
            )}

            <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#475569' }}>
              Estimated Inventory Value: <strong>Rs. {(stockModalQty * (stockModalCost || 1)).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>

          {addExistingStock.isError && (
            <div className="inline-error" style={{ marginTop: 12 }}>
              {getErrorMessage(addExistingStock.error)}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => setStockModalVariant(null)}
              disabled={addExistingStock.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => addExistingStock.mutate()}
              disabled={addExistingStock.isPending || stockModalQty <= 0}
            >
              {addExistingStock.isPending ? 'Posting Stock...' : 'Confirm & Add Stock'}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
}

function ProductSettings({form}:{form:ReturnType<typeof useForm<Values>>}){return <><div className="form-section-title">Inventory and warranty settings</div><div className="form-grid"><Field label="Status"><select className="text-input" {...form.register('product_status')}><option value="active">Active</option><option value="inactive">Inactive</option><option value="discontinued">Discontinued</option></select></Field><Money label="Minimum stock" name="minimum_stock" form={form}/><Money label="Reorder level" name="reorder_level" form={form}/><Money label="Warranty days" name="default_warranty_days" form={form}/><Field label="Image URL"><div className="input-with-icon"><ImagePlus size={15}/><input className="text-input" {...form.register('image_url')} placeholder="Upload integration URL"/></div></Field><Field label="Description"><textarea className="text-input text-area" {...form.register('description')}/></Field><label className="check-field"><input type="checkbox" {...form.register('has_variants')}/>Has visible variants</label><label className="check-field"><input type="checkbox" {...form.register('track_stock')}/>Track stock</label><label className="check-field"><input type="checkbox" {...form.register('allow_negative_stock')}/>Allow negative stock</label></div></>}
function Field({label,children,error}:{label:string;children:React.ReactNode;error?:string}){return <label className="form-field"><span>{label}</span>{children}{error&&<em>{error}</em>}</label>}
function Money({label,name,form}:{label:string;name:keyof Values;form:ReturnType<typeof useForm<Values>>}){return <Field label={label}><input className="text-input" type="number" step="0.01" {...form.register(name,{valueAsNumber:true})}/></Field>}
function VariantMoney({label,name,form}:{label:string;name:keyof VariantValues;form:ReturnType<typeof useForm<VariantValues>>}){return <Field label={label}><input className="text-input" type="number" step="0.01" {...form.register(name,{valueAsNumber:true})}/></Field>}function Select({value,set,label,options}:{value:string;set:(value:string)=>void;label:string;options?:{value:string;label:string}[]}){return <select className="compact-select" value={value} onChange={e=>set(e.target.value)}><option value="all">{label}</option>{options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}
