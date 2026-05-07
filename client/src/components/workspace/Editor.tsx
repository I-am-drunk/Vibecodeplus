import { useEffect, useRef, useCallback } from 'react'
import MonacoEditor from '@monaco-editor/react'
import { X, Circle, FileCode } from 'lucide-react'
import { useWorkspaceStore } from '../../store/workspace'
import { useFiles } from '../../hooks/useFiles'
import { fileLanguage, cn } from '../../lib/utils'

export function Editor({ projectId }: { projectId: string }) {
  const {
    activeFile, openFiles, fileContents, dirtyFiles,
    setFileContent, markDirty, closeFile, setActiveFile,
  } = useWorkspaceStore()
  const { loadFile, saveFile } = useFiles(projectId)
  const editorRef = useRef<any>(null)

  useEffect(() => {
    if (!activeFile || fileContents[activeFile] !== undefined) return
    loadFile(activeFile)
  }, [activeFile])

  const handleChange = useCallback((value: string | undefined) => {
    if (!activeFile || value === undefined) return
    setFileContent(activeFile, value)
    markDirty(activeFile)
  }, [activeFile])

  const handleSave = useCallback(async () => {
    if (!activeFile) return
    const content = fileContents[activeFile]
    if (content !== undefined) await saveFile(activeFile, content)
  }, [activeFile, fileContents])

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, handleSave)

    monaco.editor.defineTheme('vibecode-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '636366', fontStyle: 'italic' },
        { token: 'string', foreground: 'ff9f0a' },
        { token: 'keyword', foreground: 'ff375f' },
        { token: 'number', foreground: '30d158' },
        { token: 'type', foreground: '5ac8fa' },
        { token: 'function', foreground: '409cff' },
      ],
      colors: {
        'editor.background': '#0d0d0d',
        'editor.foreground': '#eeeef0',
        'editorLineNumber.foreground': '#3a3a3c',
        'editorLineNumber.activeForeground': '#8e8e93',
        'editor.selectionBackground': '#0a84ff28',
        'editor.lineHighlightBackground': '#1c1c1e60',
        'editorCursor.foreground': '#0a84ff',
        'editorIndentGuide.background1': '#2c2c2e',
        'editorGutter.background': '#0d0d0d',
        'editorWidget.background': '#1c1c1e',
        'editorSuggestWidget.background': '#1c1c1e',
        'editorSuggestWidget.border': '#3a3a3c',
      },
    })
    monaco.editor.setTheme('vibecode-dark')
  }

  if (openFiles.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#0d0d0d] gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] flex items-center justify-center">
          <FileCode size={22} className="text-[rgba(235,235,245,0.2)]" />
        </div>
        <p className="text-[13px] text-[rgba(235,235,245,0.25)]">Select a file to edit</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[#0d0d0d]">
      {/* Tab bar */}
      <div className="flex overflow-x-auto bg-[#0a0a0a] border-b border-[rgba(255,255,255,0.07)] flex-shrink-0"
           style={{ scrollbarWidth: 'none' }}>
        {openFiles.map(path => {
          const name = path.split('/').pop() ?? path
          const isDirty = dirtyFiles.has(path)
          const isActive = path === activeFile
          return (
            <div
              key={path}
              onClick={() => setActiveFile(path)}
              className={cn(
                'group flex items-center gap-2 px-3.5 h-9 border-r border-[rgba(255,255,255,0.06)]',
                'cursor-pointer flex-shrink-0 max-w-[200px] select-none transition-colors',
                isActive
                  ? 'bg-[#0d0d0d] text-white relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#0a84ff]'
                  : 'text-[rgba(235,235,245,0.4)] hover:text-[rgba(235,235,245,0.75)] hover:bg-[rgba(255,255,255,0.04)]'
              )}
            >
              {isDirty
                ? <Circle size={6} className="flex-shrink-0 fill-[#ff9f0a] text-[#ff9f0a]" />
                : <span className="w-1.5 flex-shrink-0" />
              }
              <span className="text-[12px] truncate">{name}</span>
              <button
                onClick={e => { e.stopPropagation(); closeFile(path) }}
                className={cn(
                  'flex-shrink-0 w-4 h-4 rounded flex items-center justify-center transition-all',
                  'opacity-0 group-hover:opacity-100 hover:bg-[rgba(255,255,255,0.12)]',
                  isActive && 'opacity-60'
                )}
              >
                <X size={10} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Monaco */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeFile && (
          <MonacoEditor
            key={activeFile}
            value={fileContents[activeFile] ?? ''}
            language={fileLanguage(activeFile)}
            onChange={handleChange}
            onMount={handleEditorMount}
            loading={
              <div className="h-full bg-[#0d0d0d] flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-[#0a84ff] border-t-transparent animate-spin" />
              </div>
            }
            options={{
              fontSize: 13,
              fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Cascadia Code', monospace",
              fontLigatures: true,
              lineHeight: 1.7,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              padding: { top: 16, bottom: 16 },
              renderLineHighlight: 'gutter',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              bracketPairColorization: { enabled: true },
              guides: { indentation: true },
              suggest: { showStatusBar: false },
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            }}
          />
        )}
      </div>
    </div>
  )
}
