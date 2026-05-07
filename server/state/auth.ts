import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { getDataDir } from './config.ts'
import { hostname, userInfo } from 'os'

type AuthData = {
  key: string
  fingerprint: string
  validatedAt: string
  user?: { id: string; email: string; name: string; plan: string }
}

function getAuthPath(): string {
  return join(getDataDir(), 'auth.json')
}

function deriveKey(): Buffer {
  const seed = `${hostname()}:${userInfo().username}:vibecode-studio-v1`
  return createHash('sha256').update(seed).digest()
}

function encrypt(plaintext: string): string {
  const key = deriveKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(plaintext, 'utf-8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`
}

function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encrypted] = ciphertext.split(':')
  const key = deriveKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  let decrypted = decipher.update(encrypted, 'hex', 'utf-8')
  decrypted += decipher.final('utf-8')
  return decrypted
}

export function loadStoredAuth(): AuthData | null {
  const authPath = getAuthPath()
  if (!existsSync(authPath)) return null
  try {
    const raw = readFileSync(authPath, 'utf-8')
    const decrypted = decrypt(raw)
    return JSON.parse(decrypted) as AuthData
  } catch {
    return null
  }
}

export function storeAuth(key: string, user?: AuthData['user']): void {
  const fingerprint = createHash('sha256').update(key).digest('hex').slice(0, 8)
  const data: AuthData = { key, fingerprint, validatedAt: new Date().toISOString(), user }
  const encrypted = encrypt(JSON.stringify(data))
  mkdirSync(getDataDir(), { recursive: true })
  writeFileSync(getAuthPath(), encrypted, { mode: 0o600 })
}

export function clearAuth(): void {
  const authPath = getAuthPath()
  if (existsSync(authPath)) unlinkSync(authPath)
}

export function getFingerprint(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 8)
}
