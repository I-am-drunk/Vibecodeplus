import { describe, expect, test } from 'bun:test'
import { cli } from '../../server/cli/wrapper.ts'

describe('large prompt handling', () => {
  test('agentSend pipes large text blocks via stdin', async () => {
    // Generate a string that would exceed ARG_MAX
    const massivePrompt = 'A'.repeat(5 * 1024 * 1024) // 5MB

    // Mock runStream to catch the arguments and stdin
    const originalRunStream = cli.runStream.bind(cli)
    let interceptedArgs: string[] = []
    let interceptedStdin: string | undefined

    ;(cli as any).runStream = async function* (args: string[], opts: any) {
      interceptedArgs = args
      interceptedStdin = opts?.stdin
      yield { type: 'done', input_tokens: 100, output_tokens: 10 }
    }

    try {
      const iter = cli.agentSend('http://test', 'claude', massivePrompt)
      for await (const event of iter) {
        expect(event.type).toBe('done')
      }

      // Check that prompt is passed via stdin, not as argument string
      expect(interceptedArgs).not.toContain('--prompt-file')
      expect(interceptedStdin).toBe(massivePrompt)

      // The prompt should NOT appear as a positional argument
      const promptInArgs = interceptedArgs.find(arg => arg.length > 1000)
      expect(promptInArgs).toBeUndefined()
    } finally {
      ;(cli as any).runStream = originalRunStream
    }
  })
})
