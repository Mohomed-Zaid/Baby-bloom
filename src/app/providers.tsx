import { useState, useEffect, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import { supabase } from '../lib/supabase'
import { permissions } from '../config/permissions'
import { MOCK_BRANCHES } from '../services/mockData'
import type { AuthUser } from '../types/auth'

interface AppProvidersProps { children: ReactNode }

const DEMO_ADMIN_USER: AuthUser = {
  id: 'user-admin',
  email: 'admin@babybloom.lk',
  displayName: 'Baby Bloom Administrator',
  permissions: Object.values(permissions),
}

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, gcTime: 300_000, retry: false, refetchOnWindowFocus: false },
      mutations: { retry: 0 },
    },
  }))

  return <QueryClientProvider client={queryClient}><AuthBootstrap />{children}</QueryClientProvider>
}

function AuthBootstrap() {
  const setUser = useAuthStore(state => state.setUser)
  const clearUser = useAuthStore(state => state.clearUser)
  const setInitialized = useAuthStore(state => state.setInitialized)
  const setBranch = useBranchStore(state => state.setBranch)
  const clearBranch = useBranchStore(state => state.clearBranch)
  const defaultBranch = MOCK_BRANCHES[0] ?? { id: '00000000-0000-0000-0000-000000000001', name: 'Main Flagship Store - Colombo 03' }

  useEffect(() => {
    // Check if user actively logged in via UI demo mode
    const storedDemo = localStorage.getItem('bb_demo_user')
    if (storedDemo) {
      try {
        const parsed = JSON.parse(storedDemo) as AuthUser
        setUser(parsed)
        setBranch(defaultBranch.id, defaultBranch.name)
        setInitialized(true)
        return
      } catch {
        // continue
      }
    }

    const client = supabase
    if (!client) {
      // Default to demo admin in offline/UI-first mode
      setUser(DEMO_ADMIN_USER)
      setBranch(defaultBranch.id, defaultBranch.name)
      setInitialized(true)
      return
    }

    const applyDemoFallback = () => {
      const stored = localStorage.getItem('bb_demo_user')
      if (stored) {
        try {
          const u = JSON.parse(stored) as AuthUser
          setUser(u)
          setBranch(defaultBranch.id, defaultBranch.name)
          setInitialized(true)
          return
        } catch { }
      }
      if (sessionStorage.getItem('bb_logged_out')) {
        clearUser()
        clearBranch()
        setInitialized(true)
        return
      }
      // UI-first mode default
      setUser(DEMO_ADMIN_USER)
      setBranch(defaultBranch.id, defaultBranch.name)
      setInitialized(true)
    }

    const hydrate = async (userId: string, email: string) => {
      try {
        const normalizedEmail = email.toLowerCase().trim()
        const isAdminEmail = normalizedEmail === 'zaidn2848@gmail.com' || normalizedEmail === 'babybloom@gmail.com'

        await client.from('permissions').select('*')

        const { data: rawProfile } = await client.from('profiles').select('*').eq('id', userId).maybeSingle()
        const profile = rawProfile as unknown as { full_name: string; default_branch_id: string | null; status?: string } | null

        if ((!profile || (profile.status && profile.status !== 'active')) && !isAdminEmail) {
          applyDemoFallback()
          return
        }

        const displayName = profile?.full_name || (isAdminEmail ? (normalizedEmail.startsWith('zaid') ? 'Zaid Admin' : 'Baby Bloom Admin') : 'Staff User')

        setUser({
          id: userId,
          email,
          displayName,
          permissions: Object.values(permissions),
        })

        if (profile?.default_branch_id) {
          const { data: rawBranch } = await client.from('branches').select('*').eq('id', profile.default_branch_id).maybeSingle()
          const branch = rawBranch as unknown as { id: string; name: string } | null
          if (branch) setBranch(branch.id, branch.name)
          else setBranch(defaultBranch.id, defaultBranch.name)
        } else {
          setBranch(defaultBranch.id, defaultBranch.name)
        }
      } catch (err) {
        console.warn('Error hydrating user from Supabase, applying demo fallback:', err)
        applyDemoFallback()
      } finally {
        setInitialized(true)
      }
    }

    void client.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (user) void hydrate(user.id, user.email ?? '')
      else {
        applyDemoFallback()
      }
    }).catch(() => {
      applyDemoFallback()
    })

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      if (user) void hydrate(user.id, user.email ?? '')
      else {
        applyDemoFallback()
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [clearBranch, clearUser, setBranch, setInitialized, setUser])

  return null
}
