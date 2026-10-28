import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useUiStore } from '../../stores/uiStore'
import { Header } from './Header'
import { MobileSidebar } from './MobileSidebar'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)

  // Global Ctrl+B shortcut to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar])

  return (
    <div className={`app-shell ${collapsed ? 'shell-collapsed' : ''}`}>
      <div className="desktop-sidebar"><Sidebar /></div>
      <div className="app-column">
        <Header />
        <main className="app-content"><Outlet /></main>
        <footer className="app-footer">Baby Bloom Business Suite</footer>
      </div>
      <MobileSidebar />
    </div>
  )
}