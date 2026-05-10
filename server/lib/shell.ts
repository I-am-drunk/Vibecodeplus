/**
 * Escape a string for safe interpolation into a POSIX shell single-quoted string.
 * Replaces each `'` with `'\''` (end quote, escaped quote, start quote).
 * The caller should still wrap the result in single quotes: `'${shellEscape(val)}'`
 */
export function shellEscape(value: string): string {
  return value.replace(/'/g, "'\\''")
}
