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
    const hydrate = async (userId: string, email: string) => {
      const normalizedEmail = email.toLowerCase().trim()
      const isAdminEmail = normalizedEmail === 'zaidn2848@gmail.com' || normalizedEmail === 'babybloom@gmail.com'

      const { data: rawCatalogue } = await client.from('permissions').select('*')
      const catalogue = (rawCatalogue ?? []) as unknown as { id: string; permission_key: string }[]

      const { data: rawProfile } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()
      const profile = rawProfile as unknown as { full_name: string; default_branch_id: string | null } | null

      if (!profile && !isAdminEmail) {
        clearUser()
        clearBranch()
        return
      }

      const displayName = profile?.full_name || (isAdminEmail ? (normalizedEmail.startsWith('zaid') ? 'Zaid Admin' : 'Baby Bloom Admin') : 'Staff User')

      // Fetch user roles
      const { data: rawAssignments } = await client.from('user_roles').select('*, roles(code)').eq('user_id', userId)
      const assignments = (rawAssignments ?? []) as unknown as Array<{ role_id: string; roles?: { code?: string } }>
      const isRoleAdmin = assignments.some((a) => a.roles?.code === 'OWNER' || a.roles?.code === 'ADMIN')

      if (isAdminEmail || isRoleAdmin) {
        // Grant all permissions
        setUser({
          id: userId,
          email,
          displayName,
          permissions: catalogue.map((item) => item.permission_key),
        })
      } else {
        const roleIds = assignments.map((row) => row.role_id)
        const { data: rawAllowances } = roleIds.length
          ? await client.from('role_permissions').select('*').in('role_id', roleIds).eq('is_allowed', true)
          : { data: [] }
        const allowances = (rawAllowances ?? []) as unknown as { permission_id: string }[]
        const permissionIds = new Set(allowances.map((row) => row.permission_id))

        // Check user_permissions overrides
        const { data: rawUserPerms } = await client.from('user_permissions' as 'customers').select('*').eq('user_id', userId)
        const userPerms = (rawUserPerms ?? []) as unknown as Array<{ permission_id: string; is_allowed: boolean }>
        userPerms.forEach((up) => {
          if (up.is_allowed) permissionIds.add(up.permission_id)
          else permissionIds.delete(up.permission_id)
        })

        setUser({
          id: userId,
          email,
          displayName,
          permissions: catalogue.filter((item) => permissionIds.has(item.id)).map((item) => item.permission_key),
        })
      }

      if (profile?.default_branch_id) {
        const { data: rawBranch } = await client.from('branches').select('*').eq('id', profile.default_branch_id).maybeSingle()
        const branch = rawBranch as unknown as { id: string; name: string } | null
        if (branch) setBranch(branch.id, branch.name)
      } else {
        // Fetch first active branch
        const { data: rawBranch } = await client.from('branches').select('*').eq('is_active', true).limit(1).maybeSingle()
        const branch = rawBranch as unknown as { id: string; name: string } | null
        if (branch) setBranch(branch.id, branch.name)
      }
    }
    void client.auth.getSession().then(({data})=>{const user=data.session?.user;if(user)void hydrate(user.id,user.email??'');else{clearUser();clearBranch()}})
    const {data:listener}=client.auth.onAuthStateChange((_event,session)=>{const user=session?.user;if(user)void hydrate(user.id,user.email??'');else{clearUser();clearBranch()}})
    return()=>listener.subscription.unsubscribe()
  },[clearBranch,clearUser,setBranch,setUser])
  return null
}
