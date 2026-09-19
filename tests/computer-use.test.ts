import { describe, expect, it } from 'vitest';
import { parseBrowserDecision } from '../lib/computer/browser-agent';
import { evaluateBrowserAction } from '../lib/computer/policy';
import type { BrowserSnapshot } from '../lib/computer/types';

const snapshot: BrowserSnapshot = {
  url: 'https://example.com',
  title: 'Example',
  pageText: 'Example page',
  elements: [
    { ref: 's0', role: 'button', text: 'Learn more', type: null, href: null },
    { ref: 's1', role: 'button', text: 'Buy now', type: null, href: null },
    { ref: 's2', role: 'input', text: 'Password', type: 'password', href: null },
    { ref: 's3', role: 'input', text: 'Search', type: 'text', href: null },
  ],
};

describe('Browser Use V0.3', () => {
  it('parses bounded browser decisions', () => {
    const decision = parseBrowserDecision(
      '{"actions":[{"type":"click","ref":"s0"},{"type":"scroll","deltaY":600}]}',
    );
    expect(decision.actions).toHaveLength(2);
    expect(decision.actions[0]).toMatchObject({ type: 'click', ref: 's0' });
  });

  it('accepts fenced JSON from a model', () => {
    const decision = parseBrowserDecision(
      '~~~json\n{"actions":[{"type":"done","summary":"Finished"}]}\n~~~'.replaceAll('~~~', String.fromCharCode(96).repeat(3)),
    );
    expect(decision.actions[0]).toMatchObject({ type: 'done', summary: 'Finished' });
  });

  it('allows low-risk DOM interactions', () => {
    expect(evaluateBrowserAction({ type: 'click', ref: 's0' }, snapshot).allowed).toBe(true);
    expect(
      evaluateBrowserAction({ type: 'fill', ref: 's3', text: 'ScaleOS' }, snapshot).allowed,
    ).toBe(true);
  });

  it('blocks financial, credential, and ambiguous submit actions', () => {
    expect(evaluateBrowserAction({ type: 'click', ref: 's1' }, snapshot)).toMatchObject({
      allowed: false,
      risk: 'financial',
    });
    expect(
      evaluateBrowserAction({ type: 'fill', ref: 's2', text: 'secret' }, snapshot),
    ).toMatchObject({ allowed: false, risk: 'credential' });
    expect(evaluateBrowserAction({ type: 'press', key: 'Enter' }, snapshot).allowed).toBe(false);
  });

  it('rejects malformed agent plans', () => {
    expect(() => parseBrowserDecision('not-json')).toThrow();
    expect(() =>
      parseBrowserDecision('{"actions":[{"type":"click","ref":"bad"}]}'),
    ).toThrow();
  });
});
