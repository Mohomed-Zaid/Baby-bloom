import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LockKeyhole, ShieldAlert, Sparkles, UserCheck, Store, CreditCard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { branding } from '../config/branding'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useBranchStore } from '../stores/branchStore'
import { logLoginEvent } from '../services/auditService'
import { permissions } from '../config/permissions'
import { MOCK_BRANCHES } from '../services/mockData'
import type { AuthUser } from '../types/auth'

const loginSchema = z.object({
  identity: z.string().trim().min(1, 'Enter your email or username.'),
  password: z.string().min(1, 'Enter your password.'),
  remember: z.boolean(),
})
type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const isInitialized = useAuthStore((state) => state.isInitialized)
  const setUser = useAuthStore((state) => state.setUser)
  const setBranch = useBranchStore((state) => state.setBranch)
  const [showPassword, setShowPassword] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identity: 'admin@babybloom.lk', password: 'password123', remember: false },
  })

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (isInitialized && user) {
      navigate('/dashboard', { replace: true })
    }
  }, [isInitialized, user, navigate])

  const loginAsDemoRole = (role: 'admin' | 'manager' | 'cashier') => {
    let demoUser: AuthUser
    if (role === 'admin') {
      demoUser = {
        id: 'user-admin',
        email: 'admin@babybloom.lk',
        displayName: 'Zaid (System Administrator)',
        permissions: Object.values(permissions),
      }
    } else if (role === 'manager') {
      demoUser = {
        id: 'user-manager',
        email: 'manager@babybloom.lk',
        displayName: 'Kamal Perera (Store Manager)',
        permissions: Object.values(permissions),
      }
    } else {
      demoUser = {
        id: 'user-cashier',
        email: 'cashier@babybloom.lk',
        displayName: 'Saman Kumara (Cashier)',
        permissions: Object.values(permissions),
      }
    }

    const defaultBranch = MOCK_BRANCHES[0] ?? { id: 'colombo-main', name: 'Colombo Main Branch' }
    localStorage.setItem('bb_demo_user', JSON.stringify(demoUser))
    sessionStorage.removeItem('bb_logged_out')
    setUser(demoUser)
    setBranch(defaultBranch.id, defaultBranch.name)
    void logLoginEvent({
      userId: demoUser.id,
      email: demoUser.email,
      fullName: demoUser.displayName,
      role,
    })
    navigate('/dashboard', { replace: true })
  }

  const submit = async (values: LoginValues) => {
    setNotice(null)
    const normalizedEmail = values.identity.trim().toLowerCase()
    const defaultBranch = MOCK_BRANCHES[0] ?? { id: 'colombo-main', name: 'Colombo Main Branch' }

    // Try Supabase auth if configured and available
    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: values.password,
        })
        if (!error && data?.user) {
          const authUser = data.user
          const isAdminEmail = normalizedEmail === 'zaidn2848@gmail.com' || normalizedEmail === 'babybloom@gmail.com'
          const { data: rawProfile } = await supabase
            .from('profiles')
            .select('id, full_name, status')
            .eq('id', authUser.id)
            .maybeSingle()
          const profile = rawProfile as unknown as { id: string; full_name: string; status?: string } | null

          const loggedInUser: AuthUser = {
            id: authUser.id,
            email: normalizedEmail,
            displayName: profile?.full_name || (isAdminEmail ? 'System Administrator' : (normalizedEmail.split('@')[0] ?? normalizedEmail)),
            permissions: Object.values(permissions),
          }
          localStorage.setItem('bb_demo_user', JSON.stringify(loggedInUser))
          sessionStorage.removeItem('bb_logged_out')
          setUser(loggedInUser)
          setBranch(defaultBranch.id, defaultBranch.name)
          void logLoginEvent({
            userId: authUser.id,
            email: normalizedEmail,
            fullName: loggedInUser.displayName,
            role: isAdminEmail ? 'admin' : 'staff',
          })
          navigate('/dashboard', { replace: true })
          return
        }
      } catch (err) {
        console.warn('Supabase sign-in bypassed for UI mode:', err)
      }
    }

    // UI-First Fallback Login: always allow signing in with the entered credentials
    const fallbackUser: AuthUser = {
      id: `user-${normalizedEmail.replace(/[^a-zA-Z0-9]/g, '_')}`,
      email: normalizedEmail,
      displayName: (normalizedEmail.split('@')[0] ?? normalizedEmail).toUpperCase(),
      permissions: Object.values(permissions),
    }
    localStorage.setItem('bb_demo_user', JSON.stringify(fallbackUser))
    sessionStorage.removeItem('bb_logged_out')
    setUser(fallbackUser)
    setBranch(defaultBranch.id, defaultBranch.name)
    void logLoginEvent({
      userId: fallbackUser.id,
      email: normalizedEmail,
      fullName: fallbackUser.displayName,
      role: 'staff',
    })
    navigate('/dashboard', { replace: true })
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand"><img className="brand-logo brand-logo-large" src={branding.logoPath} alt={branding.name} /><span><strong>{branding.name}</strong><small>{branding.productName}</small></span></div>
        <div className="login-message"><span className="eyebrow light">One connected workspace</span><h1>Run your business with clarity.</h1><p>Sales, inventory, finance, accounting, and reporting - organized for fast, focused work.</p></div>
        <p className="login-footer-note">Secure access foundation - Asia/Colombo business time</p>
      </section>
      <section className="login-form-panel">
        <div className="login-form-wrap">
          <div className="mobile-login-brand"><img className="brand-logo brand-logo-mobile" src={branding.logoPath} alt={branding.name} /><strong>{branding.name}</strong></div>
          
          <div className="flex items-center justify-between mb-1">
            <span className="eyebrow">Welcome back</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Sparkles size={11} /> UI Mode Ready
            </span>
          </div>
          
          <h2>Sign in to your workspace</h2>
          <p className="form-intro">Use your credentials or click a role below for instant UI access.</p>

          {/* Quick Demo Access Roles */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            <button
              type="button"
              onClick={() => loginAsDemoRole('admin')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-teal-950/60 border border-teal-700/40 hover:border-teal-400 hover:bg-teal-900/40 text-teal-200 transition text-xs font-semibold group cursor-pointer"
            >
              <UserCheck size={18} className="text-emerald-400 mb-1 group-hover:scale-110 transition" />
              <span>Admin</span>
            </button>
            <button
              type="button"
              onClick={() => loginAsDemoRole('manager')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-teal-950/60 border border-teal-700/40 hover:border-teal-400 hover:bg-teal-900/40 text-teal-200 transition text-xs font-semibold group cursor-pointer"
            >
              <Store size={18} className="text-teal-400 mb-1 group-hover:scale-110 transition" />
              <span>Manager</span>
            </button>
            <button
              type="button"
              onClick={() => loginAsDemoRole('cashier')}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-teal-950/60 border border-teal-700/40 hover:border-teal-400 hover:bg-teal-900/40 text-teal-200 transition text-xs font-semibold group cursor-pointer"
            >
              <CreditCard size={18} className="text-cyan-400 mb-1 group-hover:scale-110 transition" />
              <span>Cashier</span>
            </button>
          </div>

          <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
            <label className="field-label" htmlFor="identity">Email or username</label>
            <input className="text-input" id="identity" autoComplete="username" autoFocus {...register('identity')} aria-invalid={Boolean(errors.identity)} />
            {errors.identity && <p className="field-error">{errors.identity.message}</p>}
            <label className="field-label" htmlFor="password">Password</label>
            <div className="password-field"><input className="text-input" id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...register('password')} aria-invalid={Boolean(errors.password)} /><button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {errors.password && <p className="field-error">{errors.password.message}</p>}
            <div className="form-options"><label className="checkbox-label"><input type="checkbox" {...register('remember')} /> Remember me</label><a href="#forgotten-password" onClick={(event) => event.preventDefault()}>Forgotten password?</a></div>
            <button className="button primary login-button" type="submit" disabled={isSubmitting}>Sign in</button>
            {notice && (
              <p className="login-notice" role="status" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                <span>{notice}</span>
              </p>
            )}
          </form>
          <div className="two-step"><LockKeyhole size={18} /><span><strong>Instant UI Mode</strong><small>Seamless front-end exploration &amp; full ERP testing.</small></span></div>
        </div>
      </section>
    </main>
  )
}

