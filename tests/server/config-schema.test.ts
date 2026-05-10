import { describe, test, expect } from 'bun:test'
import { loadConfig, getConfig, updateConfig, type AppConfig } from '../../server/state/config.ts'

describe('config schema validation', () => {
  // Load config once to ensure defaults are set
  loadConfig()

  test('default config has all expected fields', () => {
    const config = getConfig()
    expect(typeof config.port).toBe('number')
    expect(typeof config.autoOpen).toBe('boolean')
    expect(typeof config.debug).toBe('boolean')
    expect(typeof config.enableTerminal).toBe('boolean')
    expect(typeof config.backup.enabled).toBe('boolean')
    expect(typeof config.backup.directory).toBe('string')
    expect(typeof config.backup.debounceSeconds).toBe('number')
    expect(typeof config.credits.lowThreshold).toBe('number')
    expect(typeof config.editor.fontSize).toBe('number')
    expect(typeof config.editor.fontFamily).toBe('string')
    expect(typeof config.chat.defaultModel).toBe('string')
    expect(typeof config.layout.fileTreeWidth).toBe('number')
  })

  test('port is within valid range', () => {
    const config = getConfig()
    expect(config.port).toBeGreaterThanOrEqual(1)
    expect(config.port).toBeLessThanOrEqual(65535)
    expect(Number.isInteger(config.port)).toBe(true)
  })

  test('editor.theme is a valid enum value', () => {
    const config = getConfig()
    expect(['dark', 'light', 'system']).toContain(config.editor.theme)
  })

  test('updateConfig rejects unknown top-level keys', () => {
    const before = getConfig()
    const result = updateConfig({ unknownKey: true } as any)
    const after = getConfig()
    expect(result.restartRequired).toBe(false)
    // unknown key should not appear in config
    expect((after as any).unknownKey).toBeUndefined()
  })

  test('updateConfig with valid partial update', () => {
    const result = updateConfig({ debug: true })
    expect(getConfig().debug).toBe(true)
    // Reset
    updateConfig({ debug: false })
  })

  test('updateConfig with invalid type falls back to default', () => {
    const before = getConfig()
    updateConfig({ port: 'not-a-number' } as any)
    const after = getConfig()
    // port should remain a valid number (default or previous)
    expect(typeof after.port).toBe('number')
    expect(after.port).toBeGreaterThanOrEqual(1)
  })

  test('updateConfig with invalid nested type falls back to default', () => {
    updateConfig({ editor: { fontSize: 'huge' } } as any)
    const after = getConfig()
    expect(typeof after.editor.fontSize).toBe('number')
    expect(after.editor.fontSize).toBeGreaterThanOrEqual(1)
  })

  test('updateConfig with invalid editor.theme falls back to default', () => {
    updateConfig({ editor: { theme: 'neon' } } as any)
    const after = getConfig()
    expect(['dark', 'light', 'system']).toContain(after.editor.theme)
  })

  test('updateConfig with out-of-range port falls back to default', () => {
    updateConfig({ port: 99999 } as any)
    const after = getConfig()
    expect(after.port).toBeLessThanOrEqual(65535)
  })

  test('updateConfig with negative port falls back to default', () => {
    updateConfig({ port: -1 } as any)
    const after = getConfig()
    expect(after.port).toBeGreaterThanOrEqual(1)
  })

  test('updateConfig with fractional port falls back to default', () => {
    updateConfig({ port: 3.14 } as any)
    const after = getConfig()
    expect(Number.isInteger(after.port)).toBe(true)
  })

  test('updateConfig with missing nested section uses defaults', () => {
    updateConfig({ backup: null } as any)
    const after = getConfig()
    expect(typeof after.backup.enabled).toBe('boolean')
    expect(typeof after.backup.directory).toBe('string')
  })

  test('updateConfig does not require restart for non-port changes', () => {
    const result = updateConfig({ debug: true })
    expect(result.restartRequired).toBe(false)
    // Reset
    updateConfig({ debug: false })
  })

  test('updateConfig strips port from runtime updates (port requires restart)', () => {
    const before = getConfig().port
    updateConfig({ port: 9999 })
    const after = getConfig().port
    // Port should not change via updateConfig since it's not in ALLOWED_CONFIG_KEYS
    expect(after).toBe(before)
  })

  test('updateConfig with cliBinaryPath as non-string removes it', () => {
    updateConfig({ cliBinaryPath: 123 } as any)
    const after = getConfig()
    expect(after.cliBinaryPath).toBeUndefined()
  })
})
