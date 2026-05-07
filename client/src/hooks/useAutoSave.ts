import { useEffect, useRef } from 'react'
import { useWorkspaceStore } from '../store/workspace'
import { useFiles } from './useFiles'

export function useAutoSave(projectId: string | null, delayMs = 2000) {
  const { dirtyFiles, fileContents } = useWorkspaceStore()
  const { saveFile } = useFiles(projectId)
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    for (const path of dirtyFiles) {
      if (timers.current.has(path)) clearTimeout(timers.current.get(path)!)
      timers.current.set(path, setTimeout(async () => {
        const content = fileContents[path]
        if (content !== undefined) await saveFile(path, content)
        timers.current.delete(path)
      }, delayMs))
    }
  }, [dirtyFiles, fileContents])
}
