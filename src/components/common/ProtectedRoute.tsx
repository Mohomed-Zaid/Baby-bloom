import { type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { branding } from '../../config/branding'
import { useAuthStore } from '../../stores/authStore'

interface ProtectedRouteProps {
  children?: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isInitialized = useAuthStore((state) => state.isInitialized)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()

  if (!isInitialized) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#0d1512',
          color: '#e6f3ed',
          gap: '16px',
        }}
      >
        <img
          src={branding.logoPath}
          alt={branding.name}
          style={{ width: '56px', height: '56px', borderRadius: '12px' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              border: '2px solid rgba(16, 185, 129, 0.2)',
              borderTopColor: '#10b981',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ fontSize: '14px', color: '#9abfad' }}>Verifying authentication...</span>
        </div>
      </div>
    )
  }

  if (!user) {
    // Guest or unauthenticated users cannot access protected routes
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children ?? <Outlet />}</>
}
