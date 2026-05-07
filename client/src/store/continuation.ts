import { create } from 'zustand'

interface ContinuationState {
  differentKey: boolean
  snapshotAt: string | null
  showDialog: boolean
  migrating: boolean
  migrateError: string | null
  migrateProgress: string

  setDifferentKey: (v: boolean, snapshotAt?: string | null) => void
  setShowDialog: (v: boolean) => void
  setMigrating: (v: boolean) => void
  setMigrateError: (e: string | null) => void
  setMigrateProgress: (s: string) => void
  reset: () => void
}

export const useContinuationStore = create<ContinuationState>((set) => ({
  differentKey: false,
  snapshotAt: null,
  showDialog: false,
  migrating: false,
  migrateError: null,
  migrateProgress: '',

  setDifferentKey: (v, snapshotAt) => set({ differentKey: v, snapshotAt: snapshotAt ?? null }),
  setShowDialog: (v) => set({ showDialog: v, migrateError: null }),
  setMigrating: (v) => set({ migrating: v }),
  setMigrateError: (e) => set({ migrateError: e }),
  setMigrateProgress: (s) => set({ migrateProgress: s }),
  reset: () => set({ differentKey: false, snapshotAt: null, showDialog: false, migrating: false, migrateError: null, migrateProgress: '' }),
}))
