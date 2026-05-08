import { describe, expect, test } from 'bun:test'
import { cli } from '../../server/cli/wrapper.ts'
import { rm, stat } from 'fs/promises'

describe('large prompt handling', () => {
  test('agentSend intercepts large text blocks and passes them via file', async () => {
    // Generate a string that would exceed ARG_MAX
    const massivePrompt = 'A'.repeat(5 * 1024 * 1024) // 5MB

    // Mock runStream to catch the arguments
    const originalRunStream = cli.runStream.bind(cli)
    let interceptedArgs: string[] = []

    ;(cli as any).runStream = async function* (args: string[], opts: any) {
      interceptedArgs = args
      yield { type: 'done', input_tokens: 100, output_tokens: 10 }
    }

    try {
      const iter = cli.agentSend('http://test', 'claude', massivePrompt)
      for await (const event of iter) {
        expect(event.type).toBe('done')
      }

      // Check that prompt is passed via file instead of as argument string
      const promptArgIndex = interceptedArgs.indexOf('--prompt-file')
      expect(promptArgIndex).toBeGreaterThan(-1)
      const promptFile = interceptedArgs[promptArgIndex + 1]
      expect(promptFile).toBeDefined()

      // The file should be cleaned up by the finally block
      try {
        await stat(promptFile)
        expect(true).toBe(false) // Should not reach here
      } catch (e: any) {
        expect(e.code).toBe('ENOENT')
      }
    } finally {
      ;(cli as any).runStream = originalRunStream
    }
  })
})
