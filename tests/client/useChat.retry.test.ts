import { describe, expect, test } from 'bun:test'
import { resolveRetryUserIndex } from '../../client/src/hooks/useChat.ts'
import type { Message } from '../../client/src/store/chat.ts'

function message(partial: Partial<Message> & Pick<Message, 'id' | 'role' | 'content'>): Message {
  return {
    createdAt: new Date().toISOString(),
    ...partial,
  }
}

describe('useChat retryFromIndex helper', () => {
  test('resolves previous user message when retry is triggered from assistant index', () => {
    const messages: Message[] = [
      message({ id: 'u1', role: 'user', content: 'hello' }),
      message({ id: 'a1', role: 'assistant', content: 'response' }),
      message({ id: 'u2', role: 'user', content: 'follow up' }),
      message({ id: 'a2', role: 'assistant', content: '' }),
    ]

    expect(resolveRetryUserIndex(messages, 3)).toBe(2)
    expect(resolveRetryUserIndex(messages, -1)).toBe(2)
  })

  test('returns -1 when no user messages exist', () => {
    const messages: Message[] = [message({ id: 'a1', role: 'assistant', content: 'only assistant' })]
    expect(resolveRetryUserIndex(messages, 0)).toBe(-1)
  })
})
