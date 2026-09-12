import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Eye, Plus, Power, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch, type UseFormRegister } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { masterModules, type MasterField, type SelectOption } from '../config/masterData'
import { DataTable, type DataTableColumn } from '../components/common/DataTable'
import { PageHeader } from '../components/common/PageHeader'
import { SearchInput } from '../components/common/SearchInput'
import { StatusBadge } from '../components/common/StatusBadge'
import { formatLkr } from '../lib/currency'
import { getErrorMessage } from '../lib/errors'
import { createMasterRecord, getMasterRecord, listLookup, listMasterPage, nextMasterCode, setMasterActive, updateMasterRecord, type MasterRecord } from '../services/masterData'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'

const PAGE_SIZE = 20
const active = (row: MasterRecord, field: string) => field === 'status' || field === 'product_status' ? row[field] === 'active' : Boolean(row[field])
const clean = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([key,value]) => [key, value === '' ? null : value]))

export function MasterDataPage({ moduleKey, basePath }: { moduleKey: string; basePath: string }) {
  const config = masterModules[moduleKey]!
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const selectedBranch = useBranchStore(state=>state.branchId)
  const permissions = useAuthStore(state=>state.user?.permissions)
  const editingId = id && id !== 'new' ? id : null
  const [page,setPage] = useState(1)
  const [search,setSearch] = useState('')
  const [term,setTerm] = useState('')
  const [status,setStatus] = useState('all')
  const [branch,setBranch] = useState(selectedBranch ?? 'all')
  const [lookups,setLookups] = useState<Record<string,SelectOption[]>>({})
  const [notice,setNotice] = useState<string|null>(null)
  const canCreate=permissions?.includes(`${config.permissionModule}.create`) ?? false
  const canUpdate=permissions?.includes(`${config.permissionModule}.update`) ?? false
  const canDelete=permissions?.includes(`${config.permissionModule}.delete`) ?? false
  const canExport=permissions?.includes(`${config.permissionModule}.export`) ?? false
  const form = useForm<Record<string,unknown>>({ resolver:zodResolver(config.schema as never), defaultValues:config.defaults })
  const branchValue=useWatch({control:form.control,name:'branch_id'})
  const bankValue=useWatch({control:form.control,name:'bank_id'})

  useEffect(()=>{const timer=window.setTimeout(()=>{setTerm(search);setPage(1)},300);return()=>window.clearTimeout(timer)},[search])
  useEffect(()=>{
    const fields=config.fields.filter(field=>field.lookup)
    void Promise.all(fields.map(async field=>{
      const lookup=field.lookup!, filters:Record<string,string|boolean>={}
      if(lookup.activeField) filters[lookup.activeField]=true
      if(lookup.dependsOn){
        const value=form.getValues(lookup.dependsOn.field)
        if(!value)return[field.name,[]] as const
        filters[lookup.dependsOn.column]=String(value)
      }
      return[field.name,await listLookup(lookup.table,lookup.labelField,filters)] as const
    })).then(entries=>setLookups(Object.fromEntries(entries))).catch(()=>setLookups({}))
  },[bankValue,branchValue,config.fields,form])

  const filters=useMemo(()=>{
    const value:Record<string,string|boolean>={}
    if(config.branchField&&branch!=='all')value[config.branchField]=branch
    if(status!=='all')value[config.statusField]=config.statusField==='is_active'?status==='active':status
    return value
  },[branch,config.branchField,config.statusField,status])
  const list=useQuery({queryKey:['master-data',config.table,page,term,filters],queryFn:()=>listMasterPage({table:config.table,page,pageSize:PAGE_SIZE,search:term,searchColumns:config.searchColumns,filters,orderBy:config.orderBy}),placeholderData:keepPreviousData})
  const detail=useQuery({queryKey:['master-data',config.table,'detail',editingId],queryFn:()=>getMasterRecord(config.table,editingId!),enabled:Boolean(editingId)})
  useEffect(()=>{
    if(detail.data)form.reset(Object.fromEntries(config.fields.map(field=>[field.name,detail.data?.[field.name]??config.defaults[field.name]])))
    else if(id==='new')form.reset({...config.defaults,...(config.branchField&&selectedBranch?{[config.branchField]:selectedBranch}:{})})
  },[config.branchField,config.defaults,config.fields,detail.data,form,id,selectedBranch])
  const save=useMutation({mutationFn:async(raw:Record<string,unknown>)=>{
    const values=clean(raw)
    if(!editingId&&config.codeField&&!values[config.codeField]&&config.branchField){
      const sequence=config.key==='customers'?'customer':config.key==='vendors'?'vendor':null
      if(sequence)values[config.codeField]=await nextMasterCode(String(values[config.branchField]),sequence)
    }
    if(editingId)await updateMasterRecord(config.table,editingId,values)
    else await createMasterRecord(config.table,values)
  },onSuccess:async()=>{await queryClient.invalidateQueries({queryKey:['master-data',config.table]});setNotice(`${config.singular} saved.`);navigate(basePath)}})
  const toggle=useMutation({mutationFn:(row:MasterRecord)=>setMasterActive(config.table,row.id,!active(row,config.statusField),config.statusField),onSuccess:()=>queryClient.invalidateQueries({queryKey:['master-data',config.table]})})

  const columns:DataTableColumn<MasterRecord>[]=[
    ...config.columns.map(column=>({key:column.key,header:column.label,align:column.money?'right' as const:'left' as const,render:(row:MasterRecord)=>{
      const value=row[column.key]
      if(column.key===config.statusField)return <StatusBadge status={active(row,config.statusField)?'active':'inactive'}/>
      if(typeof value==='boolean')return value?'Yes':'No'
      return column.money?formatLkr(Number(value??0)):String(value??'-').replaceAll('_',' ')
    }})),
    {key:'actions',header:'Actions',align:'right',render:(row)=><div className="row-actions"><button className="table-action" onClick={()=>navigate(`${basePath}/${row.id}`)} title="View or edit"><Eye size={14}/></button>{(canDelete||canUpdate)&&!['sequences','mappings','barcodes'].includes(config.key)&&!(config.key==='customers'&&row.customer_code==='C-001')&&<button className="table-action" onClick={()=>toggle.mutate(row)} title={active(row,config.statusField)?'Deactivate':'Activate'}><Power size={14}/></button>}</div>},
  ]
  const totalPages=Math.max(1,Math.ceil((list.data?.count??0)/PAGE_SIZE))
  const exportPage=()=>{
    const rows=list.data?.rows??[]
    const csv=[config.columns.map(c=>c.label).join(','),...rows.map(row=>config.columns.map(c=>JSON.stringify(row[c.key]??'')).join(','))].join('\n')
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'})),a=document.createElement('a')
    a.href=url;a.download=`${config.key}-${page}.csv`;a.click();URL.revokeObjectURL(url)
  }


  return <div className="page-stack">
    <PageHeader title={config.title} description={config.description} breadcrumbs={[{label:'Master data'},{label:config.title}]} actions={<>
      {canExport&&<button className="button secondary" onClick={exportPage} disabled={!list.data?.rows.length}><Download size={15}/>Export page</button>}
      {canCreate&&<button className="button primary" onClick={()=>navigate(`${basePath}/new`)}><Plus size={15}/>Add {config.singular.toLowerCase()}</button>}
    </>}/>
    {notice&&<div className="inline-notice">{notice}<button onClick={()=>setNotice(null)}><X size={14}/></button></div>}
    <section className="content-panel master-panel">
      <div className="master-toolbar">
        <SearchInput value={search} onChange={event=>setSearch(event.target.value)} onClear={()=>setSearch('')} placeholder={`Search ${config.searchColumns.join(', ')}`}/>
        {config.branchField&&<select className="compact-select" value={branch} onChange={event=>{setBranch(event.target.value);setPage(1)}}><option value="all">All branches</option>{(lookups[config.branchField]??[]).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>}
        {!['sequences','mappings','barcodes'].includes(config.key)&&<select className="compact-select" value={status} onChange={event=>{setStatus(event.target.value);setPage(1)}}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>}
        <span className="record-count">{list.data?.count??0} records</span>
      </div>
      {list.isLoading?<PanelState text={`Loading ${config.title.toLowerCase()}…`}/>:list.isError?<PanelState text={getErrorMessage(list.error)} error/>:<DataTable rows={list.data?.rows??[]} columns={columns} rowKey={row=>row.id} emptyTitle={`No ${config.title.toLowerCase()} found`} emptyDescription="Change the filters or create the first record."/>}
      <div className="pagination"><button className="button secondary" disabled={page===1} onClick={()=>setPage(value=>value-1)}>Previous</button><span>Page {page} of {totalPages}</span><button className="button secondary" disabled={page>=totalPages} onClick={()=>setPage(value=>value+1)}>Next</button></div>
    </section>
    {id&&<div className="drawer-layer" onMouseDown={event=>{if(event.target===event.currentTarget)navigate(basePath)}}><section className="record-drawer" role="dialog" aria-modal="true">
      <header><div><span className="eyebrow">{editingId?'Details and edit':'New master record'}</span><h2>{editingId?'Edit':'Add'} {config.singular.toLowerCase()}</h2></div><button className="icon-button" onClick={()=>navigate(basePath)} aria-label="Close"><X size={18}/></button></header>
      {detail.isLoading?<PanelState text="Loading details…"/>:<form className="master-form" onSubmit={event=>void form.handleSubmit(values=>save.mutate(values))(event)}>
        <div className="form-grid">{config.fields.map(field=><Field key={field.name} field={field} options={lookups[field.name]??field.options??[]} register={form.register} error={form.formState.errors[field.name]?.message?.toString()} editing={Boolean(editingId)}/>)}</div>
        {!editingId&&!canCreate&&<div className="inline-error">You do not have {config.permissionModule}.create permission. Ask an administrator to enable it for your role.</div>}
        {save.isError&&<div className="inline-error">{getErrorMessage(save.error)}</div>}
        <footer><button className="button secondary" type="button" onClick={()=>navigate(basePath)}>Cancel</button>{(editingId?canUpdate:canCreate)&&<button className="button primary" disabled={save.isPending}>{save.isPending?'Saving…':editingId?'Save changes':'Add '+config.singular.toLowerCase()}</button>}</footer>
      </form>}
    </section></div>}
  </div>
}

function PanelState({text,error=false}:{text:string;error?:boolean}){
  return <div className={`panel-state ${error?'error-state':''}`}>{!error&&<span className="spinner"/>}{text}</div>
}
function Field({field,options,register,error,editing}:{field:MasterField;options:SelectOption[];register:UseFormRegister<Record<string,unknown>>;error?:string;editing:boolean}){
  const props=register(field.name,{valueAsNumber:field.type==='number'}),disabled=editing&&field.readOnlyOnEdit
  return <label className={`form-field ${field.type==='textarea'?'field-wide':''}`}><span>{field.label}</span>
    {field.type==='select'?<select className="text-input" disabled={disabled}{...props}><option value="">Select…</option>{options.map(option=><option key={option.value} value={option.value}>{option.label.replaceAll('_',' ')}</option>)}</select>
      :field.type==='textarea'?<textarea className="text-input text-area" disabled={disabled}{...props}/>
      :field.type==='checkbox'?<input className="form-checkbox" type="checkbox" disabled={disabled}{...register(field.name)}/>
      :<input className="text-input" type={field.type??'text'} step={field.step} placeholder={field.placeholder} disabled={disabled}{...props}/>}
    {field.help&&<small>{field.help}</small>}{error&&<em>{error}</em>}
  </label>
}


