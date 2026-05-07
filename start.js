#!/usr/bin/env node
// start.js — ESM launcher for Vibecode Studio

import { execSync, spawn, spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const DEV = args.includes('--dev')
const NO_OPEN = args.includes('--no-open')
const PORT_ARG = (() => { const i = args.indexOf('--port'); return i >= 0 ? parseInt(args[i+1]) || 3847 : 3847 })()

let PORT = PORT_ARG
try {
  const cfg = JSON.parse(readFileSync(join(process.env.HOME || '~', '.config', 'vibecode-studio', 'config.json'), 'utf8'))
  if (cfg.port && !args.includes('--port')) PORT = cfg.port
} catch {}

const SERVER = DEV ? join(__dirname, 'server', 'index.ts') : join(__dirname, 'server', 'index.ts')
const CLIENT_DIST = join(__dirname, 'dist', 'client')

const BAR = '──────────────────────────────────────────────────'
const step = (s) => `  >>> ${s}`
const ok = (s) => `  ✓  ${s}`
const fail = (s) => `  ✗  ${s}`
const info = (s) => `  i  ${s}`

console.log('')
console.log('  ' + BAR)
console.log('  Vibecode Studio')
console.log('  Local IDE for Vibecode AI projects')
console.log('  ' + BAR)
console.log('')
console.log(step('Preflight'))
console.log('')

// Check Bun
try {
  const bv = execSync('bun --version', { encoding: 'utf8' }).trim()
  console.log(ok(`Bun ${bv}`))
} catch {
  console.log(fail('Bun not found — install from bun.sh'))
  process.exit(1)
}

// Check vibecode-cli (warn, don't block)
try {
  const cv = execSync('vibecode-cli --version 2>&1 || vibecode-cli version 2>&1 || echo "vibecode-cli found"', { encoding: 'utf8', shell: true }).trim()
  console.log(ok(`vibecode-cli ${cv.split('\n')[0]}`))
} catch {
  console.log(info('vibecode-cli not found — you can still configure it in Settings'))
}

// Check node_modules
if (!existsSync(join(__dirname, 'node_modules'))) {
  console.log(info('Installing dependencies...'))
  console.log('')
  const r = spawnSync('bun', ['install'], { cwd: __dirname, stdio: 'inherit' })
  if (r.status !== 0) { console.log(fail('bun install failed')); process.exit(1) }
  console.log(ok('Dependencies installed'))
} else {
  console.log(ok('Dependencies present'))
}

// Build client if needed (production mode)
if (!DEV && !existsSync(join(CLIENT_DIST, 'index.html'))) {
  console.log(info('Building client (first run)...'))
  console.log('')
  const r = spawnSync('bun', ['run', 'build'], { cwd: __dirname, stdio: 'inherit', shell: true })
  if (r.status !== 0) {
    console.log(fail('Build failed — run "bun run build" manually'))
    process.exit(1)
  }
  console.log(ok('Client build complete'))
} else if (!DEV) {
  console.log(ok('Client build found'))
}

console.log('')
console.log(step('Starting server'))
console.log('')

// Kill any process on our port
try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`, { stdio: 'ignore', shell: true })
  await new Promise(r => setTimeout(r, 600))
} catch {}

const children = []

function spawnChild(name, cmd, cargs, opts = {}) {
  const p = spawn(cmd, cargs, { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  p.stdout.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => console.log(`  [${name}] ${l}`)))
  p.stderr.on('data', d => d.toString().split('\n').filter(Boolean).forEach(l => console.log(`  [${name}] ${l}`)))
  children.push(p)
  return p
}

// Start server
if (DEV) {
  spawnChild('server', 'bun', ['run', '--hot', SERVER], { env: { ...process.env, NODE_ENV: 'development' } })
  spawnChild('client', 'bun', ['run', 'vite', '--config', 'vite.config.ts'])
} else {
  const prodEnv = { ...process.env }
  delete prodEnv.NODE_ENV
  prodEnv.NODE_ENV = 'production'
  spawnChild('server', 'bun', ['run', SERVER], { env: prodEnv })
}

// Wait for server
const appUrl = DEV ? `http://localhost:5173` : `http://localhost:${PORT}`
const apiUrl = `http://localhost:${PORT}/api/health`
let ready = false
let tries = 0

while (!ready && tries < 30) {
  await new Promise(r => setTimeout(r, 800))
  try {
    const r = await fetch(apiUrl)
    if (r.ok) ready = true
  } catch {}
  tries++
}

if (!ready) {
  console.log(fail('Server did not start in time'))
  process.exit(1)
}

console.log(ok(`Backend ready http://localhost:${PORT}`))
console.log('')
console.log('  ' + BAR)
console.log('  Ready')
console.log(`  App   ${appUrl}`)
console.log(`  API   http://localhost:${PORT}/api`)
console.log(`  Mode  ${DEV ? 'development' : 'production'}`)
console.log('  Ctrl+C to stop')
console.log('  ' + BAR)
console.log('')

// Open browser
if (!NO_OPEN) {
  const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try { execSync(`${open} "${appUrl}"`, { stdio: 'ignore', shell: true }) } catch {}
}

// Cleanup on exit
const cleanup = () => {
  console.log('\n  Shutting down...')
  children.forEach(p => { try { p.kill('SIGTERM') } catch {} })
  process.exit(0)
}
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
