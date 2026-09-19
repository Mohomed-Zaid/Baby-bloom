import { useEffect, useState } from 'react'
import { Bell, Clock, Expand, Home, LogOut, Menu, RefreshCw, ShieldCheck, UserRound, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useBranchStore } from '../../stores/branchStore'
import { useUiStore } from '../../stores/uiStore'
import { fetchActiveShiftSession } from '../../services/shiftService'

function useShiftTimer(openedAt?: string | null) {
  const [elapsed, setElapsed] = useState('')

  useEffect(() => {
    if (!openedAt) return

    const timer = setInterval(() => {
      const diffSecs = Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000))
      const hrs = Math.floor(diffSecs / 3600)
      const mins = Math.floor((diffSecs % 3600) / 60)
      const secs = diffSecs % 60
      setElapsed(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`)
    }, 1000)

    return () => clearInterval(timer)
  }, [openedAt])

  return elapsed
}

export function Header() {
  const navigate = useNavigate()
  const branchId = useBranchStore((state) => state.branchId)
  const branchName = useBranchStore((state) => state.branchName)
  const staffName = useAuthStore((state) => state.user?.displayName)
  const clearUser = useAuthStore((state) => state.clearUser)
  const clearBranch = useBranchStore((state) => state.clearBranch)
  const openMobileSidebar = useUiStore((state) => state.setMobileSidebarOpen)

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
    clearUser()
    clearBranch()
    navigate('/login', { replace: true })
  }

  // Query active POS shift session
  const { data: activeShift } = useQuery({
    queryKey: ['active-pos-shift', branchId],
    queryFn: () => fetchActiveShiftSession(branchId || undefined),
    refetchInterval: 15000,
  })

  const elapsed = useShiftTimer(activeShift?.opened_at)

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  }

  return (
    <header className="app-header">
      <button type="button" className="icon-button mobile-menu-button" onClick={() => openMobileSidebar(true)} aria-label="Open navigation">
        <Menu size={20} />
      </button>

      <div className="branch-context">
        <span className="context-label">Current branch</span>
        <strong>{branchName ?? 'No branch selected'}</strong>
      </div>

      {/* Active Shift Indicator */}
      <div className="shift-header-indicator hide-on-small">
        {activeShift ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer shadow-xs"
            onClick={() => navigate('/pos/shift')}
            title="Click to manage shift and cash drawer"
          >
            <span className="shift-pulse-dot" />
            <span className="font-bold text-emerald-900">{activeShift.terminal_name}</span>
            <span className="text-emerald-300">•</span>
            <span className="inline-flex items-center gap-1 font-mono text-emerald-700">
              <Clock size={12} />
              {elapsed || '00:00:00'}
            </span>
            <span className="text-emerald-300">•</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-800">
              <Wallet size={12} />
              Rs. {Number(activeShift.current_drawer_cash || 0).toLocaleString('en-LK', { minimumFractionDigits: 0 })}
            </span>
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 text-gray-700 hover:text-emerald-800 transition-all cursor-pointer"
            onClick={() => navigate('/pos/shift')}
            title="No active shift. Click to open shift before checkout."
          >
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="font-semibold">Open Shift</span>
          </button>
        )}
      </div>

      <div className="subscription-context hide-on-small">
        <span>Suite</span>
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ShieldCheck size={14} color="#10b981" />
          Enterprise
        </strong>
      </div>

      <div className="header-actions">
        <button className="icon-button" type="button" onClick={() => window.location.reload()} aria-label="Refresh application" title="Refresh">
          <RefreshCw size={17} />
        </button>
        <button className="icon-button hide-on-small" type="button" onClick={() => void toggleFullscreen()} aria-label="Toggle full screen" title="Full screen">
          <Expand size={17} />
        </button>
        <button className="icon-button hide-on-small" type="button" onClick={() => navigate('/dashboard')} aria-label="Go to dashboard" title="Home">
          <Home size={17} />
        </button>
        <button className="icon-button" type="button" aria-label="Notifications" title="Notifications">
          <Bell size={17} />
        </button>
        <details className="user-menu">
          <summary>
            <span className="user-avatar"><UserRound size={16} /></span>
            <span className="staff-name">{staffName || 'Staff Member'}</span>
          </summary>
          <div className="user-menu-popover">
            <span>Signed in as</span>
            <strong>{staffName || 'Staff Member'}</strong>
            <button type="button" onClick={() => navigate('/pos/shift')}>Cashier Shifts</button>
            <button type="button" onClick={() => navigate('/finance/petty-cash')}>Petty Cash</button>
            <button type="button" onClick={() => navigate('/admin/audit-trail')}>Audit Trail</button>
            <button
              type="button"
              style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
              onClick={() => void handleSignOut()}
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </details>
      </div>
    </header>
  )
}