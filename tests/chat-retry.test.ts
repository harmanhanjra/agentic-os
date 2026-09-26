import { describe, expect, it } from 'vitest';
import { retryContext } from '../lib/chat/retry';
import type { StoredMessage } from '../lib/chat/storage';

const messages: StoredMessage[] = [
  { role: 'user', content: 'First question', createdAt: 1 },
  { role: 'assistant', content: 'First answer', createdAt: 2 },
  { role: 'user', content: 'Second question', createdAt: 3 },
  { role: 'assistant', content: 'Partial answer', createdAt: 4 },
  { role: 'assistant', content: 'Connection failed', errorCode: 'NETWORK_ERROR', createdAt: 5 },
];

describe('chat retry', () => {
  it('retries a failed stream without duplicating its prompt or retaining the partial answer', () => {
    expect(retryContext(messages, 4)).toEqual({
      prompt: 'Second question', history: messages.slice(0, 2),
    });
    expect(messages).toHaveLength(5);
  });

  it('regenerates the selected older turn using its own prompt', () => {
    expect(retryContext(messages, 1)).toEqual({ prompt: 'First question', history: [] });
  });

  it('rejects missing turns, user messages, and assistant messages without a prompt', () => {
    expect(retryContext(messages, 0)).toBeNull();
    expect(retryContext(messages, 99)).toBeNull();
    expect(retryContext([messages[1]], 0)).toBeNull();
  });
});
