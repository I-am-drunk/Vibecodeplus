import { create } from 'zustand'

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
}

interface WorkspaceState {
  projectId: string | null
  connected: boolean
  activeFile: string | null
  openFiles: string[]
  fileContents: Record<string, string>
  dirtyFiles: Set<string>
  previewUrl: string | null
  previewPort: number | null
  showPreview: boolean
  showTerminal: boolean
  sidebarWidth: number
  chatWidth: number
  fileChangedAt: number

  setProject: (id: string) => void
  setConnected: (v: boolean) => void
  openFile: (path: string) => void
  closeFile: (path: string) => void
  setActiveFile: (path: string) => void
  setFileContent: (path: string, content: string) => void
  markDirty: (path: string) => void
  markClean: (path: string) => void
  setPreview: (url: string | null, port: number | null) => void
  togglePreview: () => void
  toggleTerminal: () => void
  setSidebarWidth: (w: number) => void
  setChatWidth: (w: number) => void
  notifyFileChanged: () => void
  reset: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projectId: null,
  connected: false,
  activeFile: null,
  openFiles: [],
  fileContents: {},
  dirtyFiles: new Set(),
  previewUrl: null,
  previewPort: null,
  showPreview: false,
  showTerminal: false,
  sidebarWidth: 240,
  chatWidth: 340,
  fileChangedAt: 0,

  setProject: (id) => set({ projectId: id }),
  setConnected: (v) => set({ connected: v }),

  openFile: (path) => set(s => {
    const openFiles = s.openFiles.includes(path) ? s.openFiles : [...s.openFiles, path]
    return { openFiles, activeFile: path }
  }),

  closeFile: (path) => set(s => {
    const openFiles = s.openFiles.filter(f => f !== path)
    const activeFile = s.activeFile === path ? (openFiles[openFiles.length - 1] ?? null) : s.activeFile
    const fileContents = { ...s.fileContents }
    delete fileContents[path]
    const dirtyFiles = new Set(s.dirtyFiles)
    dirtyFiles.delete(path)
    return { openFiles, activeFile, fileContents, dirtyFiles }
  }),

  setActiveFile: (path) => set({ activeFile: path }),
  setFileContent: (path, content) => set(s => ({ fileContents: { ...s.fileContents, [path]: content } })),
  markDirty: (path) => set(s => { const d = new Set(s.dirtyFiles); d.add(path); return { dirtyFiles: d } }),
  markClean: (path) => set(s => { const d = new Set(s.dirtyFiles); d.delete(path); return { dirtyFiles: d } }),
  setPreview: (url, port) => set({ previewUrl: url, previewPort: port }),
  togglePreview: () => set(s => ({ showPreview: !s.showPreview })),
  toggleTerminal: () => set(s => ({ showTerminal: !s.showTerminal })),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setChatWidth: (w) => set({ chatWidth: w }),
  notifyFileChanged: () => set({ fileChangedAt: Date.now() }),
  reset: () => set({
    projectId: null, connected: false, activeFile: null,
    openFiles: [], fileContents: {}, dirtyFiles: new Set(),
    previewUrl: null, previewPort: null, showPreview: false, showTerminal: false,
  }),
}))

