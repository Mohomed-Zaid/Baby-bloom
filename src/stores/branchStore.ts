import { create } from 'zustand'

interface BranchStore {
  branchId: string | null
  branchName: string | null
  setBranch: (branchId: string, branchName: string) => void
  clearBranch: () => void
}

export const useBranchStore = create<BranchStore>((set) => ({
  branchId: null,
  branchName: null,
  setBranch: (branchId, branchName) => set({ branchId, branchName }),
  clearBranch: () => set({ branchId: null, branchName: null }),
}))