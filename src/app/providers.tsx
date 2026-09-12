import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'

interface AppProvidersProps { children: ReactNode }

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  }))

  return <QueryClientProvider client={queryClient}><AuthBootstrap />{children}</QueryClientProvider>
}

function AuthBootstrap() {
  const setUser=useAuthStore(state=>state.setUser),clearUser=useAuthStore(state=>state.clearUser)
  const setBranch=useBranchStore(state=>state.setBranch),clearBranch=useBranchStore(state=>state.clearBranch)
  useEffect(()=>{
    const client=supabase
    if(!client)return
    const hydrate=async(userId:string,email:string)=>{
      const {data:rawProfile}=await client.from('profiles').select('*').eq('id',userId).maybeSingle()
      const profile=rawProfile as unknown as {full_name:string;default_branch_id:string|null}|null
      if(!profile){clearUser();clearBranch();return}
      const {data:rawAssignments}=await client.from('user_roles').select('*').eq('user_id',userId)
      const assignments=(rawAssignments??[]) as unknown as {role_id:string}[]
      const roleIds=assignments.map(row=>row.role_id)
      const {data:rawAllowances}=roleIds.length?await client.from('role_permissions').select('*').in('role_id',roleIds).eq('is_allowed',true):{data:[]}
      const allowances=(rawAllowances??[]) as unknown as {permission_id:string}[]
      const permissionIds=new Set(allowances.map(row=>row.permission_id))
      const {data:rawCatalogue}=await client.from('permissions').select('*')
      const catalogue=(rawCatalogue??[]) as unknown as {id:string;permission_key:string}[]
      setUser({id:userId,email,displayName:profile.full_name,permissions:catalogue.filter(item=>permissionIds.has(item.id)).map(item=>item.permission_key)})
      if(profile.default_branch_id){const {data:rawBranch}=await client.from('branches').select('*').eq('id',profile.default_branch_id).maybeSingle();const branch=rawBranch as unknown as {id:string;name:string}|null;if(branch)setBranch(branch.id,branch.name)}
    }
    void client.auth.getSession().then(({data})=>{const user=data.session?.user;if(user)void hydrate(user.id,user.email??'');else{clearUser();clearBranch()}})
    const {data:listener}=client.auth.onAuthStateChange((_event,session)=>{const user=session?.user;if(user)void hydrate(user.id,user.email??'');else{clearUser();clearBranch()}})
    return()=>listener.subscription.unsubscribe()
  },[clearBranch,clearUser,setBranch,setUser])
  return null
}
