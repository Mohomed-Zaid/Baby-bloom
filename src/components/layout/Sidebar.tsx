import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
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
  const activeSections = useMemo(() => navigation.filter((item) => item.children?.some((child) => location.pathname === child.path)).map((item) => item.title), [location.pathname])
  const [expanded, setExpanded] = useState<string[]>(activeSections)

  const toggleSection = (item: NavigationItem) => {
    if (collapsed) { toggleSidebar(); return }
    setExpanded((items) => items.includes(item.title) ? items.filter((title) => title !== item.title) : [...items, item.title])
  }

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`} aria-label="Primary navigation">
      <div className="brand-block">
        <img className="brand-logo brand-logo-small" src={branding.logoPath} alt={branding.name} />
        {!collapsed && <span className="brand-copy"><strong>{branding.name}</strong><small>{branding.productName}</small></span>}
      </div>
      <nav className="sidebar-nav">
        {navigation.filter((item) => !item.permission || user?.permissions.includes(item.permission) || item.children?.some((child) => !child.permission || user?.permissions.includes(child.permission))).map((item) => {
          const Icon = item.icon
          if (item.children) {
            const isOpen = expanded.includes(item.title) || activeSections.includes(item.title)
            const isActive = item.children.some((child) => location.pathname === child.path)
            return (
              <div className="nav-section" key={item.title}>
                <button type="button" className={`nav-main ${isActive ? 'active' : ''}`} onClick={() => toggleSection(item)} aria-expanded={!collapsed && isOpen} title={collapsed ? item.title : undefined}>
                  {Icon && <Icon size={18} aria-hidden="true" />}
                  {!collapsed && <><span>{item.title}</span><ChevronDown className={isOpen ? 'chevron-open' : ''} size={15} /></>}
                </button>
                {!collapsed && isOpen && (
                  <div className="nav-children">
                    {item.children.filter((child) => !child.permission || user?.permissions.includes(child.permission)).map((child) => <NavLink key={child.path} to={child.path ?? '/'} onClick={onNavigate} className={({ isActive: childActive }) => childActive ? 'active' : ''}>{child.title}</NavLink>)}
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
        <button type="button" className="collapse-button" onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight size={17} /> : <><ChevronLeft size={17} /><span>Collapse menu</span></>}
        </button>
      )}
    </aside>
  )
}
