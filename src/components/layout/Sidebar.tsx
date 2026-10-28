import { ChevronDown, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useMemo, useState, useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { branding } from '../../config/branding'
import { navigation, type NavigationItem } from '../../config/navigation'
import { useUiStore } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'

interface SidebarProps { mobile?: boolean; onNavigate?: () => void }

export function Sidebar({ mobile = false, onNavigate }: SidebarProps) {
  const location = useLocation()
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const user = useAuthStore((state) => state.user)
  const collapsed = mobile ? false : sidebarCollapsed

  // Find the active section corresponding to the current route
  const activeSections = useMemo(
    () => navigation.filter((item) => item.children?.some((child) => location.pathname === child.path || (child.path !== '/' && location.pathname.startsWith(`${child.path}/`)))).map((item) => item.title),
    [location.pathname]
  )
  const [expanded, setExpanded] = useState<string[]>(activeSections)
  const lastPathRef = useRef(location.pathname)

  // Auto-expand new section when navigating to a new route
  useEffect(() => {
    if (lastPathRef.current !== location.pathname) {
      lastPathRef.current = location.pathname
      setExpanded((prev) => {
        const missing = activeSections.filter((title) => !prev.includes(title))
        return missing.length > 0 ? [...prev, ...missing] : prev
      })
    }
  }, [location.pathname, activeSections])

  const toggleSection = (item: NavigationItem) => {
    if (collapsed) {
      toggleSidebar()
      setExpanded((items) => (items.includes(item.title) ? items : [...items, item.title]))
      return
    }
    // Allow closing and opening freely on user click!
    setExpanded((items) =>
      items.includes(item.title) ? items.filter((title) => title !== item.title) : [...items, item.title]
    )
  }

  const hasPermission = (perm?: string) => {
    if (!perm) return true
    if (!user) return true
    if (user.email === 'admin@babybloom.lk') return true
    if (!user.permissions || user.permissions.length === 0) return true
    return user.permissions.includes(perm)
  }

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`} aria-label="Primary navigation">
      <div className="brand-block">
        <div className="brand-identity">
          <img
            className="brand-logo brand-logo-small"
            src={branding.logoPath}
            alt={branding.name}
            onClick={collapsed ? toggleSidebar : undefined}
            style={collapsed ? { cursor: 'pointer' } : undefined}
            title={collapsed ? 'Click to expand sidebar' : undefined}
          />
          {!collapsed && (
            <span className="brand-copy">
              <strong>{branding.name}</strong>
              <small>{branding.productName}</small>
            </span>
          )}
        </div>
        {!mobile && (
          <button
            type="button"
            className="sidebar-header-toggle"
            onClick={toggleSidebar}
            title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        )}
      </div>
      <nav className="sidebar-nav">
        {navigation.filter((item) => hasPermission(item.permission) || item.children?.some((child) => hasPermission(child.permission))).map((item) => {
          const Icon = item.icon
          if (item.children) {
            const isOpen = expanded.includes(item.title)
            const isActive = item.children.some((child) => location.pathname === child.path)
            return (
              <div className="nav-section" key={item.title}>
                <button type="button" className={`nav-main ${isActive ? 'active' : ''}`} onClick={() => toggleSection(item)} aria-expanded={!collapsed && isOpen} title={collapsed ? item.title : undefined}>
                  {Icon && <Icon size={18} aria-hidden="true" />}
                  {!collapsed && <><span>{item.title}</span><ChevronDown className={isOpen ? 'chevron-open' : ''} size={15} /></>}
                </button>
                {!collapsed && isOpen && (
                  <div className="nav-children">
                    {item.children.filter((child) => hasPermission(child.permission)).map((child) => <NavLink key={`${item.title}-${child.title}-${child.path}`} to={child.path ?? '/'} onClick={onNavigate} className={({ isActive: childActive }) => childActive ? 'active' : ''}>{child.title}</NavLink>)}
                  </div>
                )}
              </div>
            )
          }
          return (
            <NavLink key={item.title} to={item.path ?? '/'} onClick={onNavigate} title={collapsed ? item.title : undefined} className={({ isActive }) => `nav-main ${isActive ? 'active' : ''}`}>
              {Icon && <Icon size={18} aria-hidden="true" />}
              {!collapsed && <span>{item.title}</span>}
            </NavLink>
          )
        })}
      </nav>
      {!mobile && (
        <button
          type="button"
          className="collapse-button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
        >
          {collapsed ? <ChevronRight size={17} /> : <><ChevronLeft size={17} /><span>Collapse menu</span></>}
        </button>
      )}
    </aside>
  )
}
