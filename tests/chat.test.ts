import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  autoTitle,
  blankConversation,
  listConversations,
  saveConversation,
  deleteConversation,
} from '../lib/chat/storage';

describe('conversation storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  function browserStorage(initial: string | null = null) {
    let raw = initial;
    const storage = {
      getItem: vi.fn(() => raw),
      setItem: vi.fn((_key: string, value: string) => { raw = value; }),
    };
    vi.stubGlobal('window', { localStorage: storage });
    return storage;
  }

  it('keeps a recently updated old chat when history reaches its limit', () => {
    browserStorage();
    for (let i = 0; i < 100; i++) {
      saveConversation({ ...blankConversation('auto'), id: String(i), updatedAt: i });
    }
    saveConversation({ ...blankConversation('auto'), id: '0', updatedAt: 101 });
    saveConversation({ ...blankConversation('auto'), id: '100', updatedAt: 102 });
    const saved = listConversations();
    expect(saved).toHaveLength(100);
    expect(saved.slice(0, 2).map((c) => c.id)).toEqual(['100', '0']);
    expect(saved.some((c) => c.id === '1')).toBe(false);
  });

  it('preserves messages beyond 200 when resuming a long chat', () => {
    browserStorage();
    const messages = Array.from({ length: 205 }, (_, i) => ({
      role: 'user' as const, content: String(i), createdAt: i,
    }));
    saveConversation({ ...blankConversation('auto'), messages });
    expect(listConversations()[0].messages).toEqual(messages);
  });

  it.each(['{broken', '{}', '[{"id":"bad","messages":[null]}]'])(
    'does not overwrite malformed history: %s', (raw) => {
      const storage = browserStorage(raw);
      expect(listConversations()).toEqual([]);
      expect(() => saveConversation(blankConversation('auto'))).toThrow();
      expect(() => deleteConversation('bad')).toThrow();
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it('surfaces quota errors while preserving previously saved data', () => {
    const storage = browserStorage();
    const saved = blankConversation('auto');
    saveConversation(saved);
    storage.setItem.mockImplementation(() => { throw new Error('Quota exceeded'); });
    expect(() => saveConversation(blankConversation('auto'))).toThrow('Quota exceeded');
    expect(listConversations()).toEqual([saved]);
  });

  it('deletes only the requested conversation', () => {
    browserStorage();
    const a = blankConversation('auto');
    const b = blankConversation('auto');
    saveConversation(a);
    saveConversation(b);
    deleteConversation(a.id);
    expect(listConversations()).toEqual([b]);
  });
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
