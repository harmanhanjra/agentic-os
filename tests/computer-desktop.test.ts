import { describe, expect, it } from 'vitest';
import { parseComputerDecision } from '../lib/computer/desktop-agent';
import { evaluateComputerAction } from '../lib/computer/desktop-policy';

describe('Full Computer Use V0.3', () => {
  it('parses visual desktop actions', () => {
    const decision = parseComputerDecision(
      '{"actions":[{"type":"click","target":"Calculator button","x":420,"y":300},{"type":"wait","target":"Wait for calculator","ms":500}]}',
    );
    expect(decision.actions).toHaveLength(2);
    expect(decision.actions[0]).toMatchObject({
      type: 'click',
      target: 'Calculator button',
      x: 420,
      y: 300,
    });
  });

  it('accepts fenced JSON decisions', () => {
    const ticks = String.fromCharCode(96).repeat(3);
    const decision = parseComputerDecision(
      (ticks + 'json\n{"actions":[{"type":"done","summary":"Complete"}]}\n' + ticks),
    );
    expect(decision.actions[0]).toMatchObject({ type: 'done', summary: 'Complete' });
  });

  it('allows ordinary desktop control', () => {
    expect(
      evaluateComputerAction({
        type: 'click',
        target: 'Calculator number 7 button',
        x: 200,
        y: 300,
        button: 'left',
      }),
    ).toMatchObject({ allowed: true, risk: 'none' });

    expect(
      evaluateComputerAction({
        type: 'type',
        target: 'Search field',
        text: 'ScaleOS',
      }),
    ).toMatchObject({ allowed: true, risk: 'none' });
  });

  it('blocks consequential desktop actions before execution', () => {
    expect(
      evaluateComputerAction({
        type: 'click',
        target: 'Buy now button',
        x: 500,
        y: 500,
        button: 'left',
      }),
    ).toMatchObject({ allowed: false, risk: 'financial' });

    expect(
      evaluateComputerAction({
        type: 'type',
        target: 'Password field',
        text: 'secret',
      }),
    ).toMatchObject({ allowed: false, risk: 'credential' });

    expect(
      evaluateComputerAction({
        type: 'click',
        target: 'Delete account button',
        x: 100,
        y: 100,
        button: 'left',
      }),
    ).toMatchObject({ allowed: false, risk: 'destructive' });
  });
});
