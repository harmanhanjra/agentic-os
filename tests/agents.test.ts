import { describe, expect, it } from 'vitest';
import { parseAgentPlan } from '../lib/agents/runtime';

describe('agent runtime planning', () => {
  it('parses bounded JSON plans', () => {
    expect(
      parseAgentPlan('{"steps":["Research","Design","Verify","Extra"]}', 3),
    ).toEqual(['Research', 'Design', 'Verify']);
  });

  it('accepts fenced JSON from providers', () => {
    expect(
      parseAgentPlan('```json\n{"steps":["Plan","Execute"]}\n```', 5),
    ).toEqual(['Plan', 'Execute']);
  });

  it('falls back safely when planning output is invalid', () => {
    expect(parseAgentPlan('not-json', 3)).toEqual([
      'Complete the objective carefully and return the most useful result.',
    ]);
  });
});
