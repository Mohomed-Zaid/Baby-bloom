import { create } from 'zustand'
import type { ActiveShiftMetrics } from '../types/shift'

interface ShiftStore {
  activeShift: ActiveShiftMetrics | null
  setActiveShift: (shift: ActiveShiftMetrics | null) => void
  isDrawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  lastZReport: Record<string, unknown> | null
  setLastZReport: (report: Record<string, unknown> | null) => void
}

export const useShiftStore = create<ShiftStore>((set) => ({
  activeShift: null,
  setActiveShift: (activeShift) => set({ activeShift }),
  isDrawerOpen: false,
  setDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
  lastZReport: null,
  setLastZReport: (lastZReport) => set({ lastZReport }),
}))
