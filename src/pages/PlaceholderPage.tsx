import { Construction, Database, LockKeyhole } from 'lucide-react'
import type { PermissionKey } from '../config/permissions'
import { EmptyState } from '../components/common/EmptyState'
import { PageHeader } from '../components/common/PageHeader'

interface PlaceholderPageProps { title: string; section: string; permission?: PermissionKey }

export function PlaceholderPage({ title, section, permission }: PlaceholderPageProps) {
  return (
    <div className="page-stack">
      <PageHeader title={title} description={`${section} workspace`} breadcrumbs={[{ label: section }, { label: title }]} />
      <section className="content-panel placeholder-panel">
        <EmptyState title={`${title} is ready for the next phase`} description="The route, navigation, responsive shell, and permission metadata are in place. Business records and transaction logic will be connected after the database design is approved." />
        <div className="foundation-notes" aria-label="Foundation status">
          <span><Construction size={15} /> Interface placeholder</span>
          <span><Database size={15} /> Supabase-ready</span>
          <span><LockKeyhole size={15} /> {permission ?? 'No permission required'}</span>
        </div>
      </section>
    </div>
  )
}