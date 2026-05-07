import { sshManager } from './manager.ts'
import type { FileNode } from '../cli/types.ts'

const IGNORE = new Set(['node_modules', '.git', '__pycache__', '.venv', '.next', 'dist', '.cache'])
const WS = '/home/user/workspace'

// List one directory level via a single find call (portable, BusyBox-safe)
export async function getFileTree(projectId: string, absPath: string): Promise<FileNode[]> {
  let output = ''
  try {
    // Single find: print type char + path for each direct child
    output = await sshManager.exec(projectId,
      `find '${absPath}' -maxdepth 1 -mindepth 1 \\( -type d -printf 'd %p\\n' -o -type f -printf 'f %p\\n' \\) 2>/dev/null || ` +
      // BusyBox fallback: no -printf, use two finds
      `{ find '${absPath}' -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sed 's/^/d /'; find '${absPath}' -maxdepth 1 -mindepth 1 -type f 2>/dev/null | sed 's/^/f /'; }`
    )
  } catch { return [] }

  const nodes: FileNode[] = []
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 3) continue
    const typeChar = trimmed[0]
    const fullPath = trimmed.slice(2).trim()
    if (!fullPath) continue
    const name = fullPath.split('/').pop()!
    if (!name || IGNORE.has(name)) continue
    const isDir = typeChar === 'd'
    // Path relative to WS root, always starting with /
    const wsRel = fullPath.startsWith(WS) ? fullPath.slice(WS.length) : '/' + name
    nodes.push({
      name,
      path: wsRel || '/' + name,
      type: isDir ? 'directory' : 'file',
      children: isDir ? [] : undefined,
    })
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

export async function readFile(projectId: string, filePath: string): Promise<{ content: string | null; binary: boolean; size: number; mimeType?: string }> {
  const fullPath = `${WS}${filePath}`
  try {
    const content = await sshManager.exec(projectId, `cat '${fullPath}'`)
    return { content, binary: false, size: Buffer.byteLength(content) }
  } catch (err) {
    throw new Error(`Failed to read file: ${filePath}`)
  }
}

export async function writeFile(projectId: string, filePath: string, content: string): Promise<{ size: number }> {
  const fullPath = `${WS}${filePath}`
  const dir = fullPath.split('/').slice(0, -1).join('/')
  await sshManager.exec(projectId, `mkdir -p '${dir}'`)
  // Write via heredoc — no SFTP needed
  const escaped = content.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
  await sshManager.exec(projectId, `printf '%s' '${escaped}' > '${fullPath}'`)
  return { size: Buffer.byteLength(content) }
}

export async function deleteFile(projectId: string, filePath: string): Promise<void> {
  await sshManager.exec(projectId, `rm -rf '${WS}${filePath}'`)
}

export async function mkdirRemote(projectId: string, dirPath: string): Promise<void> {
  await sshManager.exec(projectId, `mkdir -p '${WS}${dirPath}'`)
}

export async function renameFile(projectId: string, oldPath: string, newPath: string): Promise<void> {
  await sshManager.exec(projectId, `mv '${WS}${oldPath}' '${WS}${newPath}'`)
}

export function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    py: 'python', rs: 'rust', go: 'go', rb: 'ruby', java: 'java',
    json: 'json', md: 'markdown', html: 'html', css: 'css', scss: 'scss',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql', sh: 'shell',
    bash: 'shell', zsh: 'shell', dockerfile: 'dockerfile', xml: 'xml',
    svg: 'xml', vue: 'vue', svelte: 'svelte', graphql: 'graphql',
  }
  return langMap[ext] ?? 'plaintext'
}

// Namespace object for route compatibility
export const sshFiles = {
  listDir: async (projectId: string, path: string) => {
    const absPath = `${WS}${path === '/' ? '' : path}`
    const nodes = await getFileTree(projectId, absPath)
    return nodes.map(n => ({
      name: n.name,
      path: n.path,
      type: (n.type === 'directory' ? 'dir' : 'file') as 'dir' | 'file',
    }))
  },
  readFile: (projectId: string, path: string) => readFile(projectId, path).then(r => r.content ?? ''),
  writeFile: (projectId: string, path: string, content: string) => writeFile(projectId, path, content),
  mkdir: (projectId: string, path: string) => mkdirRemote(projectId, path),
  remove: (projectId: string, path: string) => deleteFile(projectId, path),
  rename: (projectId: string, from: string, to: string) => renameFile(projectId, from, to),
}
