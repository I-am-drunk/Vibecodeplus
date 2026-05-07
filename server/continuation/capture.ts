import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { sshManager } from '../ssh/manager.ts'
import { getDB } from '../state/db.ts'
import { getDataDir } from '../state/config.ts'

const IGNORE = new Set(['node_modules', '.git', '.next', 'dist', '__pycache__', '.cache', 'coverage', '.turbo'])
const WS = '/home/user/workspace'
const DEBOUNCE_MS = 6000

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const active = new Set<string>()

export function scheduleCapture(projectId: string) {
  const prev = timers.get(projectId)
  if (prev) clearTimeout(prev)
  timers.set(projectId, setTimeout(() => {
    timers.delete(projectId)
    captureNow(projectId).catch(() => {})
  }, DEBOUNCE_MS))
}

export async function captureNow(projectId: string): Promise<number> {
  if (active.has(projectId)) return 0
  active.add(projectId)
  const dir = join(getDataDir(), 'snapshots', projectId)
  try {
    mkdirSync(dir, { recursive: true })
    const count = await downloadDir(projectId, WS, dir)
    getDB().prepare(
      `UPDATE projects SET snapshot_dir = ?, snapshot_at = datetime('now') WHERE id = ?`
    ).run(dir, projectId)
    console.log(`[capture] ${projectId}: ${count} files`)
    return count
  } catch (e) {
    console.warn('[capture] failed:', projectId, e)
    return 0
  } finally {
    active.delete(projectId)
  }
}

async function downloadDir(projectId: string, remote: string, local: string): Promise<number> {
  mkdirSync(local, { recursive: true })
  let out = ''
  try {
    out = await sshManager.exec(projectId,
      `find '${remote}' -maxdepth 1 -mindepth 1 \( -type d -printf 'd %p\n' -o -type f -printf 'f %p\n' \) 2>/dev/null || ` +
      `{ find '${remote}' -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sed 's/^/d /'; find '${remote}' -maxdepth 1 -mindepth 1 -type f 2>/dev/null | sed 's/^/f /'; }`
    )
  } catch { return 0 }

  let count = 0
  for (const line of out.split('\n')) {
    const t = line.trim()
    if (!t || t.length < 3) continue
    const typeChar = t[0]
    const fullPath = t.slice(2).trim()
    if (!fullPath) continue
    const name = fullPath.split('/').pop()!
    if (!name || IGNORE.has(name)) continue
    if (typeChar === 'd') {
      count += await downloadDir(projectId, fullPath, join(local, name))
    } else {
      try {
        const content = await sshManager.exec(projectId, `cat '${fullPath}' 2>/dev/null`)
        writeFileSync(join(local, name), content)
        count++
      } catch { /* skip */ }
    }
  }
  return count
}

export async function pushToProject(sourceId: string, targetId: string): Promise<void> {
  const row = getDB().prepare('SELECT snapshot_dir FROM projects WHERE id = ?').get(sourceId) as any
  if (!row?.snapshot_dir || !existsSync(row.snapshot_dir))
    throw new Error('No local snapshot available. Open the project to capture files first.')
  await uploadDir(targetId, row.snapshot_dir, WS)
}

async function uploadDir(projectId: string, local: string, remote: string): Promise<void> {
  const { readdirSync, statSync, readFileSync } = await import('fs')
  await sshManager.exec(projectId, `mkdir -p '${remote}'`).catch(() => {})
  for (const name of readdirSync(local)) {
    if (IGNORE.has(name)) continue
    const lp = join(local, name)
    const rp = `${remote}/${name}`
    const st = statSync(lp)
    if (st.isDirectory()) {
      await uploadDir(projectId, lp, rp)
    } else if (st.size < 2_000_000) {
      try {
        const content = readFileSync(lp, 'utf-8')
        const esc = content.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
        const dir2 = rp.split('/').slice(0, -1).join('/')
        await sshManager.exec(projectId, `mkdir -p '${dir2}' && printf '%s' '${esc}' > '${rp}'`)
      } catch { /* skip binary */ }
    }
  }
}
