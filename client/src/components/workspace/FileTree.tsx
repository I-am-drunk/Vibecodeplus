import { useEffect, useState, useCallback, useRef } from 'react'
import { ChevronRight, File, Folder, FolderOpen, Plus, FolderPlus, Pencil, Trash2, Download, ChevronsDownUp } from 'lucide-react'
import { api } from '../../lib/api'
import { useWorkspaceStore, type FileEntry } from '../../store/workspace'
import { ContextMenu, type MenuItem } from '../ui/ContextMenu'
import { cn } from '../../lib/utils'
import { useFiles } from '../../hooks/useFiles'

type TreeNode = FileEntry

function sort(entries: FileEntry[]): TreeNode[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function TreeItem({ node, depth, projectId, expanded, children, childrenLoading, onToggle, onRefreshDir }: {
  node: TreeNode; depth: number; projectId: string
  expanded: boolean; children: TreeNode[]; childrenLoading: boolean
  onToggle: (path: string) => void
  onRefreshDir: (path: string) => void
}) {
  const { activeFile } = useWorkspaceStore()
  const { loadFile, createFile, createDir, deleteEntry, renameEntry } = useFiles(projectId)
  const parentPath = node.path.split('/').slice(0, -1).join('/') || '/'

  const menuItems: MenuItem[] = node.type === 'dir' ? [
    { label: 'New File', icon: <Plus size={13} />, onClick: async () => {
      const name = prompt('File name:'); if (!name) return
      await createFile(`${node.path}/${name}`); onRefreshDir(node.path)
    }},
    { label: 'New Folder', icon: <FolderPlus size={13} />, onClick: async () => {
      const name = prompt('Folder name:'); if (!name) return
      await createDir(`${node.path}/${name}`); onRefreshDir(node.path)
    }},
    { separator: true },
    { label: 'Rename', icon: <Pencil size={13} />, onClick: async () => {
      const n = prompt('New name:', node.name); if (!n || n === node.name) return
      await renameEntry(node.path, node.path.replace(/[^/]+$/, n)); onRefreshDir(parentPath)
    }},
    { label: 'Delete', icon: <Trash2 size={13} />, destructive: true, onClick: async () => {
      if (!confirm(`Delete ${node.name}?`)) return
      await deleteEntry(node.path); onRefreshDir(parentPath)
    }},
  ] : [
    { label: 'Rename', icon: <Pencil size={13} />, onClick: async () => {
      const n = prompt('New name:', node.name); if (!n || n === node.name) return
      await renameEntry(node.path, node.path.replace(/[^/]+$/, n)); onRefreshDir(parentPath)
    }},
    { label: 'Download', icon: <Download size={13} />, onClick: () => {
      const a = document.createElement('a'); a.href = api.downloadUrl(projectId, node.path); a.download = node.name; a.click()
    }},
    { separator: true },
    { label: 'Delete', icon: <Trash2 size={13} />, destructive: true, onClick: async () => {
      if (!confirm(`Delete ${node.name}?`)) return
      await deleteEntry(node.path); onRefreshDir(parentPath)
    }},
  ]

  const isActive = activeFile === node.path

  return (
    <>
      <ContextMenu items={menuItems}>
        <button
          onClick={() => node.type === 'dir' ? onToggle(node.path) : loadFile(node.path)}
          className={cn(
            'flex items-center gap-2 w-full text-left py-1.5 rounded-lg text-[13px] transition-colors',
            'hover:bg-white/[0.05]',
            isActive ? 'bg-[#0a84ff]/15 text-[#409cff]' : 'text-white/85'
          )}
          style={{ paddingLeft: 10 + depth * 16, paddingRight: 10 }}
        >
          {node.type === 'dir'
            ? <ChevronRight size={13} className={cn('flex-shrink-0 transition-transform duration-100 text-white/30', expanded && 'rotate-90')} />
            : <span className="w-[13px] flex-shrink-0" />}
          {node.type === 'dir'
            ? (expanded ? <FolderOpen size={15} className="flex-shrink-0 text-[#ff9f0a]" /> : <Folder size={15} className="flex-shrink-0 text-[#ff9f0a]" />)
            : <File size={15} className="flex-shrink-0 text-white/30" />}
          <span className="truncate">{node.name}</span>
          {childrenLoading && <span className="ml-auto w-2.5 h-2.5 rounded-full border border-[#0a84ff] border-t-transparent animate-spin flex-shrink-0" />}
        </button>
      </ContextMenu>

      {expanded && children.map(child => (
        <TreeItem key={child.path} node={child} depth={depth + 1} projectId={projectId}
          expanded={false} children={[]} childrenLoading={false}
          onToggle={onToggle} onRefreshDir={onRefreshDir}
          // These get overridden by the wrapper below — but we need a self-contained recursive component
          // so we pass a wrapper instead
        />
      ))}
    </>
  )
}

// Wrapper that injects expanded/children from the stable refs
function TreeItemConnected({ node, depth, projectId, expandedSet, childrenMap, loadingSet, onToggle, onRefreshDir }: {
  node: TreeNode; depth: number; projectId: string
  expandedSet: Set<string>; childrenMap: Map<string, TreeNode[]>; loadingSet: Set<string>
  onToggle: (path: string) => void; onRefreshDir: (path: string) => void
}) {
  const { activeFile } = useWorkspaceStore()
  const { loadFile, createFile, createDir, deleteEntry, renameEntry } = useFiles(projectId)
  const expanded = expandedSet.has(node.path)
  const children = childrenMap.get(node.path) ?? []
  const childrenLoading = loadingSet.has(node.path)
  const parentPath = node.path.split('/').slice(0, -1).join('/') || '/'
  const isActive = activeFile === node.path

  const menuItems: MenuItem[] = node.type === 'dir' ? [
    { label: 'New File', icon: <Plus size={13} />, onClick: async () => {
      const name = prompt('File name:'); if (!name) return
      await createFile(`${node.path}/${name}`); onRefreshDir(node.path)
    }},
    { label: 'New Folder', icon: <FolderPlus size={13} />, onClick: async () => {
      const name = prompt('Folder name:'); if (!name) return
      await createDir(`${node.path}/${name}`); onRefreshDir(node.path)
    }},
    { separator: true },
    { label: 'Rename', icon: <Pencil size={13} />, onClick: async () => {
      const n = prompt('New name:', node.name); if (!n || n === node.name) return
      await renameEntry(node.path, node.path.replace(/[^/]+$/, n)); onRefreshDir(parentPath)
    }},
    { label: 'Delete', icon: <Trash2 size={13} />, destructive: true, onClick: async () => {
      if (!confirm(`Delete ${node.name}?`)) return
      await deleteEntry(node.path); onRefreshDir(parentPath)
    }},
  ] : [
    { label: 'Rename', icon: <Pencil size={13} />, onClick: async () => {
      const n = prompt('New name:', node.name); if (!n || n === node.name) return
      await renameEntry(node.path, node.path.replace(/[^/]+$/, n)); onRefreshDir(parentPath)
    }},
    { label: 'Download', icon: <Download size={13} />, onClick: () => {
      const a = document.createElement('a'); a.href = api.downloadUrl(projectId, node.path); a.download = node.name; a.click()
    }},
    { separator: true },
    { label: 'Delete', icon: <Trash2 size={13} />, destructive: true, onClick: async () => {
      if (!confirm(`Delete ${node.name}?`)) return
      await deleteEntry(node.path); onRefreshDir(parentPath)
    }},
  ]

  return (
    <>
      <ContextMenu items={menuItems}>
        <button
          onClick={() => node.type === 'dir' ? onToggle(node.path) : loadFile(node.path)}
          className={cn(
            'flex items-center gap-2 w-full text-left py-1.5 rounded-lg text-[13px] transition-colors',
            'hover:bg-white/[0.05]',
            isActive ? 'bg-[#0a84ff]/15 text-[#409cff]' : 'text-white/85'
          )}
          style={{ paddingLeft: 10 + depth * 16, paddingRight: 10 }}
        >
          {node.type === 'dir'
            ? <ChevronRight size={13} className={cn('flex-shrink-0 transition-transform duration-100 text-white/30', expanded && 'rotate-90')} />
            : <span className="w-[13px] flex-shrink-0" />}
          {node.type === 'dir'
            ? (expanded ? <FolderOpen size={15} className="flex-shrink-0 text-[#ff9f0a]" /> : <Folder size={15} className="flex-shrink-0 text-[#ff9f0a]" />)
            : <File size={15} className="flex-shrink-0 text-white/30" />}
          <span className="truncate">{node.name}</span>
          {childrenLoading && <span className="ml-auto w-2.5 h-2.5 rounded-full border border-[#0a84ff] border-t-transparent animate-spin flex-shrink-0" />}
        </button>
      </ContextMenu>

      {expanded && children.map(child => (
        <TreeItemConnected key={child.path} node={child} depth={depth + 1} projectId={projectId}
          expandedSet={expandedSet} childrenMap={childrenMap} loadingSet={loadingSet}
          onToggle={onToggle} onRefreshDir={onRefreshDir} />
      ))}
    </>
  )
}

export function FileTree({ projectId }: { projectId: string }) {
  const [roots, setRoots] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tick, setTick] = useState(0) // force re-render when refs change
  const rerender = () => setTick(t => t + 1)

  // Stable refs — survive setRoots() without losing state
  const expandedSet = useRef(new Set<string>()).current
  const childrenMap = useRef(new Map<string, TreeNode[]>()).current
  const loadingSet = useRef(new Set<string>()).current

  const { createFile, createDir } = useFiles(projectId)
  const fileChangedAt = useWorkspaceStore(s => s.fileChangedAt)
  const prevChangedAt = useRef(0)

  const fetchDir = useCallback(async (path: string) => {
    const { entries } = await api.listDir(projectId, path)
    childrenMap.set(path, sort(entries))
  }, [projectId])

  const onToggle = useCallback(async (path: string) => {
    if (expandedSet.has(path)) {
      expandedSet.delete(path)
      rerender()
    } else {
      expandedSet.add(path)
      if (!childrenMap.has(path)) {
        loadingSet.add(path)
        rerender()
        try { await fetchDir(path) } finally { loadingSet.delete(path) }
      }
      rerender()
    }
  }, [fetchDir])

  const onRefreshDir = useCallback(async (path: string) => {
    if (path === '/') {
      const { entries } = await api.listDir(projectId, '/')
      setRoots(sort(entries))
    } else {
      await fetchDir(path)
      rerender()
    }
  }, [projectId, fetchDir])

  const loadRoot = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const { entries } = await api.listDir(projectId, '/')
      setRoots(sort(entries))
      // Refresh all open dirs without collapsing them
      await Promise.all([...expandedSet].map(p => fetchDir(p).catch(() => {})))
      rerender()
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [projectId, fetchDir])

  useEffect(() => { loadRoot(false) }, [loadRoot])

  useEffect(() => {
    if (!fileChangedAt || fileChangedAt === prevChangedAt.current) return
    prevChangedAt.current = fileChangedAt
    loadRoot(true)
  }, [fileChangedAt])

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <div className="flex items-center justify-between px-3 h-11 border-b border-white/[0.05] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Explorer</span>
          <button onClick={() => { expandedSet.clear(); rerender() }} title="Collapse all"
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.06] text-white/30 hover:text-white transition-colors">
            <ChevronsDownUp size={13} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => loadRoot(true)} title="Refresh"
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={refreshing ? 'animate-spin' : ''}>
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
            </svg>
          </button>
          <button onClick={async () => { const n = prompt('File name:'); if (!n) return; await createFile(`/${n}`); loadRoot(true) }}
            title="New file" className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors">
            <Plus size={14} />
          </button>
          <button onClick={async () => { const n = prompt('Folder name:'); if (!n) return; await createDir(`/${n}`); loadRoot(true) }}
            title="New folder" className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/[0.06] text-white/40 hover:text-white transition-colors">
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {loading ? (
          <div className="flex justify-center pt-10">
            <div className="w-4 h-4 rounded-full border-2 border-[#0a84ff] border-t-transparent animate-spin" />
          </div>
        ) : roots.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-10 gap-2 px-4 text-center">
            <p className="text-[12px] text-[rgba(235,235,245,0.25)]">Empty workspace</p>
            <p className="text-[11px] text-[rgba(235,235,245,0.15)]">Ask the agent to create files</p>
          </div>
        ) : roots.map(node => (
          <TreeItemConnected key={node.path} node={node} depth={0} projectId={projectId}
            expandedSet={expandedSet} childrenMap={childrenMap} loadingSet={loadingSet}
            onToggle={onToggle} onRefreshDir={onRefreshDir} />
        ))}
      </div>
    </div>
  )
}
