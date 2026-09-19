import { create } from 'zustand'
import type { AuthUser } from '../types/auth'

interface AuthStore {
  user: AuthUser | null
  isInitialized: boolean
  setUser: (user: AuthUser | null) => void
  clearUser: () => void
  setInitialized: (initialized: boolean) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isInitialized: false,
  setUser: (user) => set({ user, isInitialized: true }),
  clearUser: () => set({ user: null, isInitialized: true }),
  setInitialized: (isInitialized) => set({ isInitialized }),
}))