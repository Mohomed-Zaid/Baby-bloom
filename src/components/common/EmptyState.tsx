import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps { title: string; description: string; action?: ReactNode }

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Inbox aria-hidden="true" size={24} /></div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}