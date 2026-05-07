import { create } from 'zustand'
import { api } from '../lib/api'

export interface Project {
  id: string
  name: string
  description?: string
  sandbox: { status: 'running' | 'stopped' | 'provisioning' | 'error'; region?: string }
  defaultModel: string
  lastOpenedAt: string | null
  differentKey: boolean
  snapshotAt?: string | null
  created_at?: string
  updated_at?: string
}

interface ProjectsState {
  projects: Project[]
  loading: boolean
  error: string | null
  load: () => Promise<void>
  createProject: (body: { name: string; description?: string; template?: string; defaultModel?: string }) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const { projects } = await api.listProjects()
      console.log(`[projects] loaded ${projects.length} projects`)
      set({ projects: projects as Project[], loading: false })
    } catch (err) {
      console.error('[projects] load failed', err)
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  createProject: async (body) => {
    const { project } = await api.createProject(body)
    console.log('[projects] created', project.id)
    set(s => ({ projects: [project as Project, ...s.projects] }))
    return project as Project
  },

  deleteProject: async (id) => {
    await api.deleteProject(id)
    set(s => ({ projects: s.projects.filter(p => p.id !== id) }))
  },
}))
