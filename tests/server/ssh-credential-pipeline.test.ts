/**
 * SSH credential pipeline fix regression tests.
 *
 * Root cause: parseSandboxCredentials was dropping password/privateKey/sshPassword
 * fields from the CLI response, causing normalizeSandboxCredentials to find
 * no auth method → "No SSH auth method available for sandbox" infinite retry loop.
 *
 * Fix: SandboxCredentials type and parseSandboxCredentials now include
 * password, privateKey, sshPassword fields.
 */

import { describe, test, expect } from 'bun:test'
import { parseSandboxCredentials, parseAcquireSandboxPayload } from '../../server/contracts/cli.ts'
import type { SandboxCredentials } from '../../server/cli/types.ts'

describe('SSH credential pipeline fix', () => {
  test('parseSandboxCredentials extracts sshPassword from CLI response', () => {
    const payload = {
      id: 'sandbox-1',
      status: 'running',
      host: '192.168.1.1',
      port: 22,
      user: 'user',
      sshPassword: 'secret-password-123',
      key_path: '',
    }

    const result = parseSandboxCredentials(payload)
    expect(result).not.toBeNull()
    expect(result!.password).toBe('secret-password-123')
    expect(result!.sshPassword).toBe('secret-password-123')
  })

  test('parseSandboxCredentials extracts password field', () => {
    const payload = {
      host: '10.0.0.1',
      port: 2222,
      user: 'admin',
      password: 'my-password',
    }

    const result = parseSandboxCredentials(payload)
    expect(result).not.toBeNull()
    expect(result!.password).toBe('my-password')
  })

  test('parseSandboxCredentials extracts privateKey field', () => {
    const payload = {
      host: '10.0.0.1',
      port: 22,
      user: 'user',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key-content\n-----END OPENSSH PRIVATE KEY-----',
    }

    const result = parseSandboxCredentials(payload)
    expect(result).not.toBeNull()
    expect(result!.privateKey).toContain('BEGIN OPENSSH PRIVATE KEY')
  })

  test('parseSandboxCredentials extracts key_path', () => {
    const payload = {
      host: '10.0.0.1',
      port: 22,
      user: 'user',
      key_path: '/home/user/.ssh/id_rsa',
    }

    const result = parseSandboxCredentials(payload)
    expect(result).not.toBeNull()
    expect(result!.key_path).toBe('/home/user/.ssh/id_rsa')
  })

  test('parseSandboxCredentials handles all fields together', () => {
    const payload = {
      id: 'sandbox-1',
      status: 'running',
      host: '192.168.1.1',
      ipv4: '192.168.1.1',
      port: 22,
      sshPort: 22,
      user: 'user',
      sshUsername: 'user',
      sshPassword: 'pass123',
      password: 'pass123',
      privateKey: 'key-content',
      key_path: '/path/to/key',
      sshKeyPath: '/path/to/key',
    }

    const result = parseSandboxCredentials(payload)
    expect(result).not.toBeNull()
    expect(result!.host).toBe('192.168.1.1')
    expect(result!.port).toBe(22)
    expect(result!.user).toBe('user')
    expect(result!.password).toBe('pass123')
    expect(result!.privateKey).toBe('key-content')
    expect(result!.key_path).toBe('/path/to/key')
    expect(result!.sshPassword).toBe('pass123')
  })

  test('parseAcquireSandboxPayload preserves sshPassword in sandbox object', () => {
    const payload = {
      sandbox: {
        id: 'sandbox-1',
        status: 'running',
        host: '192.168.1.1',
        port: 22,
        user: 'user',
        sshPassword: 'secret',
      },
      links: {
        agentUrl: { id: 'lnk_1', port: 7000, url: 'https://agent.example.com' },
      },
    }

    const result = parseAcquireSandboxPayload(payload)
    expect(result).not.toBeNull()
    expect(result!.sandbox.password).toBe('secret')
    expect(result!.sandbox.host).toBe('192.168.1.1')
    expect(result!.links).toBeDefined()
  })

  test('parseAcquireSandboxPayload with flat structure (no sandbox wrapper)', () => {
    const payload = {
      host: '10.0.0.1',
      port: 22,
      user: 'admin',
      sshPassword: 'flat-password',
    }

    const result = parseAcquireSandboxPayload(payload)
    expect(result).not.toBeNull()
    expect(result!.sandbox.password).toBe('flat-password')
  })

  test('SandboxCredentials type includes password and privateKey fields', () => {
    const creds: SandboxCredentials = {
      host: '10.0.0.1',
      port: 22,
      user: 'admin',
      key_path: '',
      password: 'test-pass',
      privateKey: 'test-key',
      sshPassword: 'test-ssh-pass',
    }

    expect(creds.password).toBe('test-pass')
    expect(creds.privateKey).toBe('test-key')
    expect(creds.sshPassword).toBe('test-ssh-pass')
  })

  test('CLI JSON output format: sshPassword is preserved', () => {
    // Simulate the actual CLI JSON output format:
    // The CLI returns host/port/user alongside sshPassword in the sandbox object
    const cliOutput = {
      sandbox: {
        id: 'abc123',
        status: 'running',
        host: '192.168.1.100',
        port: 22,
        user: 'user',
        sshPassword: 'cli-returned-password',
      },
    }

    const result = parseAcquireSandboxPayload(cliOutput)
    expect(result).not.toBeNull()
    // The critical fix: sshPassword must survive the parse pipeline
    expect(result!.sandbox.password).toBe('cli-returned-password')
  })
})
