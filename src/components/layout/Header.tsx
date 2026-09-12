import { Bell, Expand, Home, Menu, RefreshCw, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useBranchStore } from '../../stores/branchStore'
import { useUiStore } from '../../stores/uiStore'

export function Header() {
  const navigate = useNavigate()
  const branchName = useBranchStore((state) => state.branchName)
  const staffName = useAuthStore((state) => state.user?.displayName)
  const openMobileSidebar = useUiStore((state) => state.setMobileSidebarOpen)

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  }

  return (
    <header className="app-header">
      <button type="button" className="icon-button mobile-menu-button" onClick={() => openMobileSidebar(true)} aria-label="Open navigation"><Menu size={20} /></button>
      <div className="branch-context">
        <span className="context-label">Current branch</span>
        <strong>{branchName ?? 'No branch selected'}</strong>
      </div>
      <div className="subscription-context">
        <span>Subscription</span>
        <strong>Not configured</strong>
      </div>
      <div className="header-actions">
        <button className="icon-button" type="button" onClick={() => window.location.reload()} aria-label="Refresh application" title="Refresh"><RefreshCw size={17} /></button>
        <button className="icon-button hide-on-small" type="button" onClick={() => void toggleFullscreen()} aria-label="Toggle full screen" title="Full screen"><Expand size={17} /></button>
        <button className="icon-button hide-on-small" type="button" onClick={() => navigate('/dashboard')} aria-label="Go to dashboard" title="Home"><Home size={17} /></button>
        <button className="icon-button" type="button" aria-label="Notifications" title="Notifications"><Bell size={17} /></button>
        <details className="user-menu">
          <summary><span className="user-avatar"><UserRound size={16} /></span><span className="staff-name">{staffName ?? 'Guest user'}</span></summary>
          <div className="user-menu-popover">
            <span>Signed in as</span><strong>{staffName ?? 'Guest user'}</strong>
            <button type="button" onClick={() => navigate('/login')}>Go to login</button>
          </div>
        </details>
      </div>
    </header>
  )
}