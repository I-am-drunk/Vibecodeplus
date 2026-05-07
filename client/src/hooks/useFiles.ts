import { useState, useCallback } from 'react'
import { api } from '../lib/api'
import { useWorkspaceStore } from '../store/workspace'
import type { FileEntry } from '../store/workspace'

export function useFiles(projectId: string | null) {
  const { setFileContent, markClean, markDirty, openFile } = useWorkspaceStore()
  const [saving, setSaving] = useState(false)

  const loadFile = useCallback(async (path: string) => {
    if (!projectId) return
    const content = await api.readFile(projectId, path)
    setFileContent(path, content)
    openFile(path)
    return content
  }, [projectId])

  const saveFile = useCallback(async (path: string, content: string) => {
    if (!projectId) return
    setSaving(true)
    try {
      await api.writeFile(projectId, path, content)
      markClean(path)
    } finally {
      setSaving(false)
    }
  }, [projectId])

  const createFile = useCallback(async (path: string) => {
    if (!projectId) return
    await api.writeFile(projectId, path, '')
  }, [projectId])

  const createDir = useCallback(async (path: string) => {
    if (!projectId) return
    await api.mkdir(projectId, path)
  }, [projectId])

  const deleteEntry = useCallback(async (path: string) => {
    if (!projectId) return
    await api.deleteFile(projectId, path)
  }, [projectId])

  const renameEntry = useCallback(async (from: string, to: string) => {
    if (!projectId) return
    await api.renameFile(projectId, from, to)
  }, [projectId])

  return { loadFile, saveFile, createFile, createDir, deleteEntry, renameEntry, saving }
}
