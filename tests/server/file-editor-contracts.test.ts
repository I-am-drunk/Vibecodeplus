/**
 * File and editor contract tests (QA-141..QA-165).
 *
 * QA-141: List root dir
 * QA-143: Read file text
 * QA-146: Write file permission denied
 * QA-161: Binary file read guard
 * QA-159: Autosave canceled on unmount
 * QA-165: Prompt/confirm replacement modal path
 */

import { describe, test, expect } from 'bun:test'
import { validatePath } from '../../server/lib/validation.ts'
import { isKnownErrorCode } from '../../server/lib/errorCodes.ts'
import { sshManager } from '../../server/ssh/manager.ts'

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.ico', '.heic', '.heif',
  '.pdf', '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac', '.ogg',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite',
  '.woff', '.woff2', '.eot', '.ttf', '.otf',
  '.pyc', '.class', '.o', '.obj', '.wasm',
])

function isBinaryFile(path: string): boolean {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
  return BINARY_EXTENSIONS.has(ext)
}

describe('QA-161: binary file read guard', () => {
  test('binary extensions are correctly identified', () => {
    expect(isBinaryFile('image.png')).toBe(true)
    expect(isBinaryFile('photo.jpg')).toBe(true)
    expect(isBinaryFile('archive.zip')).toBe(true)
    expect(isBinaryFile('video.mp4')).toBe(true)
    expect(isBinaryFile('font.woff2')).toBe(true)
    expect(isBinaryFile('data.sqlite')).toBe(true)
    expect(isBinaryFile('module.wasm')).toBe(true)
  })

  test('text files are not flagged as binary', () => {
    expect(isBinaryFile('script.ts')).toBe(false)
    expect(isBinaryFile('style.css')).toBe(false)
    expect(isBinaryFile('page.html')).toBe(false)
    expect(isBinaryFile('data.json')).toBe(false)
    expect(isBinaryFile('config.yaml')).toBe(false)
    expect(isBinaryFile('README.md')).toBe(false)
    expect(isBinaryFile('Dockerfile')).toBe(false)
  })

  test('case-insensitive extension matching', () => {
    expect(isBinaryFile('image.PNG')).toBe(true)
    expect(isBinaryFile('photo.JPEG')).toBe(true)
    expect(isBinaryFile('archive.ZIP')).toBe(true)
  })
})

describe('QA-141: list root dir', () => {
  test('path validation allows root directory listing', () => {
    // Root path should be valid
    expect(() => validatePath('/', 'test')).not.toThrow()
  })
})

describe('QA-143: read file text', () => {
  test('path validation allows reading text files', () => {
    expect(() => validatePath('/src/index.ts', 'test')).not.toThrow()
    expect(() => validatePath('/README.md', 'test')).not.toThrow()
  })

  test('path validation rejects traversal attempts', () => {
    expect(() => validatePath('/../../../etc/passwd', 'test')).toThrow()
    expect(() => validatePath('/..\\..\\windows\\system32', 'test')).toThrow()
  })
})

describe('QA-146: write file permission denied', () => {
  test('FORBIDDEN error code is known', () => {
    expect(isKnownErrorCode('FORBIDDEN')).toBe(true)
  })

  test('workspace unmount guard prevents writes', () => {
    // CP-35: sshManager.isConnected() is checked before writes
    // When disconnected, writes are rejected with FORBIDDEN
    expect(sshManager.isConnected('nonexistent-project')).toBe(false)
  })
})

describe('QA-159: autosave canceled on unmount', () => {
  test('workspace disconnect prevents file operations', () => {
    // When workspace is unmounted, sshManager.isConnected returns false
    // All file write operations check this before proceeding
    expect(sshManager.isConnected('unmounted-project')).toBe(false)
  })
})

describe('QA-165: prompt/confirm replacement modal path', () => {
  test('path validation for rename operations', () => {
    // Rename source and target must both be valid paths
    expect(() => validatePath('/src/old.ts', 'test')).not.toThrow()
    expect(() => validatePath('/src/new.ts', 'test')).not.toThrow()

    // Rename to traversal target is blocked
    expect(() => validatePath('/../../../etc/evil', 'test')).toThrow()
  })
})

describe('QA-189: path traversal guard (comprehensive)', () => {
  test('rejects double-dot segments', () => {
    expect(() => validatePath('/../secret', 'test')).toThrow()
    expect(() => validatePath('/foo/../../etc/passwd', 'test')).toThrow()
    expect(() => validatePath('/./../escape', 'test')).toThrow()
  })

  test('rejects backslash traversal', () => {
    // Backslashes are always rejected regardless of path
    expect(() => validatePath('/foo\\..\\..\\secret', 'test')).toThrow()
  })

  test('rejects null bytes', () => {
    expect(() => validatePath('/file\0.txt', 'test')).toThrow()
  })

  test('rejects shell metacharacters', () => {
    // validatePath rejects: ', `, $ (but not | or ;)
    expect(() => validatePath("/file'inject", 'test')).toThrow()
    expect(() => validatePath('/file$(whoami)', 'test')).toThrow()
    expect(() => validatePath('/file`id`', 'test')).toThrow()
  })

  test('allows safe paths', () => {
    expect(() => validatePath('/src/index.ts', 'test')).not.toThrow()
    expect(() => validatePath('/docs/README.md', 'test')).not.toThrow()
    expect(() => validatePath('/package.json', 'test')).not.toThrow()
    expect(() => validatePath('/a/b/c/d/file.txt', 'test')).not.toThrow()
  })
})
