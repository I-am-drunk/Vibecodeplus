import type { Context } from 'hono'
import { badRequest, invalidJson } from './errors.ts'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch (error) {
    throw invalidJson({ reason: error instanceof Error ? error.message : String(error) })
  }
}

export function expectRecord(value: unknown, message = 'Request body must be an object'): Record<string, unknown> {
  if (!isRecord(value)) {
    throw badRequest(message)
  }
  return value
}

export function readString(
  record: Record<string, unknown>,
  field: string,
  opts?: { required?: boolean; trim?: boolean; minLength?: number },
): string | undefined {
  const required = opts?.required ?? false
  const trim = opts?.trim ?? true
  const minLength = opts?.minLength ?? 0

  const raw = record[field]
  if (raw === undefined || raw === null) {
    if (required) throw badRequest(`Field \"${field}\" is required`)
    return undefined
  }

  if (typeof raw !== 'string') {
    throw badRequest(`Field \"${field}\" must be a string`)
  }

  const value = trim ? raw.trim() : raw
  if (required && value.length < minLength) {
    throw badRequest(`Field \"${field}\" must be at least ${minLength} characters`) 
  }

  if (!required && value.length === 0) return undefined
  if (value.length < minLength) {
    throw badRequest(`Field \"${field}\" must be at least ${minLength} characters`)
  }

  return value
}

export function readBoolean(record: Record<string, unknown>, field: string): boolean | undefined {
  const raw = record[field]
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'boolean') {
    throw badRequest(`Field \"${field}\" must be a boolean`)
  }
  return raw
}

export function readNumber(record: Record<string, unknown>, field: string): number | undefined {
  const raw = record[field]
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw badRequest(`Field \"${field}\" must be a valid number`)
  }
  return raw
}

export function readArray(record: Record<string, unknown>, field: string): unknown[] | undefined {
  const raw = record[field]
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) {
    throw badRequest(`Field \"${field}\" must be an array`)
  }
  return raw
}

export function validatePath(path: string, fieldName = 'path'): string {
  const normalized = path.trim()
  if (!normalized) throw badRequest(`Field \"${fieldName}\" is required`)
  if (normalized.includes('..')) {
    throw badRequest(`Field \"${fieldName}\" contains an invalid path segment`)
  }
  return normalized
}
