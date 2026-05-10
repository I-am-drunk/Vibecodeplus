/**
 * Normalize and validate an agent URL.
 * Returns the trimmed URL string if valid, or '' if invalid.
 * Only http: and https: URLs are accepted.
 */
export function normalizeAgentUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return trimmed
  } catch {
    return ''
  }
}
