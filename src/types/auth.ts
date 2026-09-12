export interface AuthUser {
  id: string
  displayName: string
  email: string
  permissions: string[]
}

export interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
}