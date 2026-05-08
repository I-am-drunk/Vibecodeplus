import { create } from 'zustand'

export type MigrationStage =
  | 'queued'
  | 'creating_target'
  | 'reusing_target'
  | 'cleaning_orphan_target'
  | 'acquiring_target'
  | 'transferring_snapshot'
  | 'verifying_target'
  | 'completed'
  | 'failed'

export type MigrationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial_failed'

interface ContinuationState {
  differentKey: boolean
  snapshotAt: string | null
  showDialog: boolean
  checkingStatus: boolean
  migrating: boolean
  migrateError: string | null
  migrationId: string | null
  migrationStage: MigrationStage | null
  migrationStatus: MigrationStatus | null
  migrationMessage: string
  migrationTargetProjectId: string | null
  sourcePreserved: boolean

  setDifferentKey: (value: boolean, snapshotAt?: string | null) => void
  setShowDialog: (value: boolean) => void
  setCheckingStatus: (value: boolean) => void
  setMigrating: (value: boolean) => void
  setMigrateError: (error: string | null) => void
  setMigrationState: (payload: {
    migrationId: string | null
    migrationStage: MigrationStage | null
    migrationStatus: MigrationStatus | null
    migrationMessage?: string
    migrationTargetProjectId?: string | null
    sourcePreserved?: boolean
  }) => void
  reset: () => void
}

export const useContinuationStore = create<ContinuationState>((set) => ({
  differentKey: false,
  snapshotAt: null,
  showDialog: false,
  checkingStatus: false,
  migrating: false,
  migrateError: null,
  migrationId: null,
  migrationStage: null,
  migrationStatus: null,
  migrationMessage: '',
  migrationTargetProjectId: null,
  sourcePreserved: true,

  setDifferentKey: (value, snapshotAt) => set({ differentKey: value, snapshotAt: snapshotAt ?? null }),
  setShowDialog: (value) => set({ showDialog: value, migrateError: null }),
  setCheckingStatus: (value) => set({ checkingStatus: value }),
  setMigrating: (value) => set({ migrating: value }),
  setMigrateError: (error) => set({ migrateError: error }),
  setMigrationState: (payload) =>
    set({
      migrationId: payload.migrationId,
      migrationStage: payload.migrationStage,
      migrationStatus: payload.migrationStatus,
      migrationMessage: payload.migrationMessage ?? '',
      migrationTargetProjectId: payload.migrationTargetProjectId ?? null,
      sourcePreserved: payload.sourcePreserved ?? true,
    }),
  reset: () =>
    set({
      differentKey: false,
      snapshotAt: null,
      showDialog: false,
      checkingStatus: false,
      migrating: false,
      migrateError: null,
      migrationId: null,
      migrationStage: null,
      migrationStatus: null,
      migrationMessage: '',
      migrationTargetProjectId: null,
      sourcePreserved: true,
    }),
}))
