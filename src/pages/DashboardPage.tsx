import { ArrowRight, Boxes, Database, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { isSupabaseConfigured } from '../lib/supabase'

const workspaces = [
  { title: 'Sales & invoices', description: 'Billing, history, returns and held bills.', path: '/invoice/new-invoice', icon: ReceiptText },
  { title: 'Inventory control', description: 'Stock, purchases, transfers and adjustments.', path: '/inventory/current-stock', icon: Boxes },
  { title: 'Finance', description: 'Receivables, payables, books and reconciliation.', path: '/finance/receivables', icon: WalletCards },
]

export function DashboardPage() {
  return (
    <div className="page-stack">
      <PageHeader title="Dashboard" description="Your business workspace is ready to be configured." breadcrumbs={[{ label: 'Dashboard' }]} />
      <section className="dashboard-hero">
        <div><span className="eyebrow">Baby Bloom Business Suite</span><h2>A clean foundation for daily operations.</h2><p>Core navigation, permissions, responsive layouts, and service boundaries are prepared for your business modules.</p></div>
        <div className="readiness-badge"><ShieldCheck size={22} /><span><strong>Foundation ready</strong><small>Transactions intentionally disabled</small></span></div>
      </section>
      <div className="workspace-grid">
        {workspaces.map(({ title, description, path, icon: Icon }) => (
          <Link className="workspace-card" to={path} key={title}><span className="workspace-icon"><Icon size={20} /></span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={17} /></Link>
        ))}
      </div>
      <section className="content-panel setup-panel">
        <div className="panel-heading"><div><span className="eyebrow">System status</span><h2>Configuration checklist</h2></div></div>
        <div className="setup-row"><span className="setup-icon"><Database size={18} /></span><div><strong>Supabase connection</strong><p>{isSupabaseConfigured ? 'Environment variables are present. Schema setup remains pending.' : 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY after the database design phase.'}</p></div><span className={`status-pill ${isSupabaseConfigured ? 'ready' : ''}`}>{isSupabaseConfigured ? 'Configured' : 'Pending'}</span></div>
      </section>
    </div>
  )
}