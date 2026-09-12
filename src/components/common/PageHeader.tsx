import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface BreadcrumbItem { label: string; path?: string }
interface PageHeaderProps { title: string; description?: string; breadcrumbs?: BreadcrumbItem[]; actions?: ReactNode }

export function PageHeader({ title, description, breadcrumbs = [], actions }: PageHeaderProps) {
  return (
    <header className="page-heading">
      <div>
        {breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="breadcrumbs">
            <Link to="/dashboard">Home</Link>
            {breadcrumbs.map((item) => (
              <span key={`${item.label}-${item.path ?? ''}`} className="breadcrumb-item">
                <ChevronRight aria-hidden="true" size={13} />
                {item.path ? <Link to={item.path}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}