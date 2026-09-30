import type { StoredMessage } from './storage';

/** Retry the selected turn without duplicating its prompt or including later turns. */
export function retryContext(messages: StoredMessage[], assistantIndex: number): {
  prompt: string;
  history: StoredMessage[];
} | null {
  if (messages[assistantIndex]?.role !== 'assistant') return null;
  for (let index = assistantIndex - 1; index >= 0; index--) {
    if (messages[index].role === 'user') {
      return { prompt: messages[index].content, history: messages.slice(0, index) };
    }
  }
  return null;
}
