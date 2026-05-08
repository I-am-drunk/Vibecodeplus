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
      set({ projects: projects as Project[], loading: false, error: null })
    } catch (error) {
      set((state) => ({
        projects: state.projects,
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      }))
    }
  },

  createProject: async (body) => {
    const { project } = await api.createProject(body)
    set((state) => ({ projects: [project as Project, ...state.projects] }))
    return project as Project
  },

  deleteProject: async (id) => {
    await api.deleteProject(id)
    set((state) => ({ projects: state.projects.filter((project) => project.id !== id) }))
  },
}))
