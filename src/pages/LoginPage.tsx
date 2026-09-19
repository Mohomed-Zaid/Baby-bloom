import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LockKeyhole, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { branding } from '../config/branding'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

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
  const [showPassword, setShowPassword] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identity: '', password: '', remember: false },
  })

  // If already authenticated as a real user, redirect to dashboard
  useEffect(() => {
    if (isInitialized && user) {
      navigate('/dashboard', { replace: true })
    }
  }, [isInitialized, user, navigate])

  const submit = async (values: LoginValues) => {
    setNotice(null)
    if (!supabase) {
      setNotice('Supabase is not configured for this environment.')
      return
    }
    if (!values.identity.includes('@')) {
      setNotice('Enter the email linked to this staff account.')
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.identity.trim(),
      password: values.password,
    })

    if (error) {
      setNotice(error.message)
      return
    }

    const authUser = data.user
    if (!authUser) {
      setNotice('Unable to authenticate credentials.')
      return
    }

    const normalizedEmail = (authUser.email ?? values.identity).toLowerCase().trim()
    const isAdminEmail = normalizedEmail === 'zaidn2848@gmail.com' || normalizedEmail === 'babybloom@gmail.com'

    // Strict validation: Only real registered staff accounts (in public.profiles) or designated admins are permitted
    const { data: rawProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, status')
      .eq('id', authUser.id)
      .maybeSingle()

    const profile = rawProfile as unknown as { id: string; full_name: string; status?: string } | null

    if ((!profile || profileError) && !isAdminEmail) {
      await supabase.auth.signOut()
      setNotice('Access denied: Guest or unregistered accounts cannot log in. Only registered staff members are permitted.')
      return
    }

    if (profile && profile.status && profile.status !== 'active' && !isAdminEmail) {
      await supabase.auth.signOut()
      setNotice('Access denied: Your staff account is deactivated. Please contact your system administrator.')
      return
    }

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
          <span className="eyebrow">Welcome back</span><h2>Sign in to your workspace</h2><p className="form-intro">Use your registered staff account to continue.</p>
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
          <div className="two-step"><LockKeyhole size={18} /><span><strong>Two-step verification</strong><small>Staff authentication required. Guest logins disabled.</small></span></div>
        </div>
      </section>
    </main>
  )
}

