import { describe, expect, it } from 'vitest';
import {
  autoTitle,
  blankConversation,
  listConversations,
} from '../lib/chat/storage';

describe('conversation storage', () => {
  it('builds titles from the first user message', () => {
    expect(autoTitle([])).toBe('New conversation');
    expect(
      autoTitle([
        { role: 'user', content: 'Hello world', createdAt: 1 },
      ]),
    ).toBe('Hello world');
    const long = autoTitle([
      { role: 'user', content: `word ${'x'.repeat(100)}`, createdAt: 1 },
    ]);
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBeLessThanOrEqual(49);
  });

  it('creates blank conversations with unique ids', () => {
    const a = blankConversation('auto');
    const b = blankConversation('auto');
    expect(a.id).not.toBe(b.id);
    expect(a.messages).toEqual([]);
    expect(a.modelId).toBe('auto');
  });

  it('returns an empty list without a browser', () => {
    expect(listConversations()).toEqual([]);
  });
});
