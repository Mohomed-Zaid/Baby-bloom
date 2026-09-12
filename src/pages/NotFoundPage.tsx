import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { branding } from '../config/branding'

export function NotFoundPage() {
  return (
    <main className="not-found-page"><div className="not-found-card"><img className="brand-logo brand-logo-large" src={branding.logoPath} alt={branding.name} /><span className="error-code">404</span><h1>Page not found</h1><p>The page may have moved or the address may be incorrect.</p><Link className="button primary" to="/dashboard"><ArrowLeft size={16} /> Return to dashboard</Link></div></main>
  )
}