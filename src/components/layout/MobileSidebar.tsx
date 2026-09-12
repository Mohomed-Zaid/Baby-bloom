import { X } from 'lucide-react'
import { useUiStore } from '../../stores/uiStore'
import { Sidebar } from './Sidebar'

export function MobileSidebar() {
  const open = useUiStore((state) => state.mobileSidebarOpen)
  const setOpen = useUiStore((state) => state.setMobileSidebarOpen)
  if (!open) return null

  return (
    <div className="mobile-sidebar-layer" role="presentation">
      <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />
      <div className="mobile-sidebar-panel" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <button className="mobile-close" type="button" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button>
        <Sidebar mobile onNavigate={() => setOpen(false)} />
      </div>
    </div>
  )
}