import { describe, expect, it } from 'vitest';
import { evaluateArithmetic } from '../lib/tools/arithmetic';

describe('arithmetic parser', () => {
  it.each([
    ['2 + 3 * (4 - 1)', 11], ['-2 * 3', -6], ['2^-2', 0.25],
    ['2^3^2', 512], ['-2^2', -4], ['(-2)^2', 4], ['.5 + 1.', 1.5],
    ['2--3', 5], ['10%3', 1],
  ])('evaluates %s', (input, expected) => expect(evaluateArithmetic(input)).toBe(expected));
  it.each(['1..2', '2(3)', '2 3', '()', '1/0', '(2+3', '2+', '', 'process.exit(1)']) (
    'rejects %s', (input) => expect(() => evaluateArithmetic(input)).toThrow(),
  );
});
