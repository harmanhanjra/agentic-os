import { z } from 'zod';
import { assertSafeProviderUrl } from '../security/url';
import { safeProviderFetch } from '../security/fetch';
import { insertRow, readCollection } from '../store/json-store';

export const ToolIdSchema = z.enum(['web_fetch', 'calculator', 'datetime', 'text_stats']);
export type ToolId = z.infer<typeof ToolIdSchema>;

export interface ToolDef {
  id: ToolId;
  name: string;
  description: string;
  consequential: boolean;
  input: z.ZodTypeAny;
}

const WebFetchInput = z.object({ url: z.string().url().max(2000), maxChars: z.number().int().min(200).max(20000).default(6000) });
const CalculatorInput = z.object({ expression: z.string().min(1).max(500) });
const DatetimeInput = z.object({ timeZone: z.string().max(100).optional() });
const TextStatsInput = z.object({ text: z.string().min(1).max(50000) });

export const TOOL_REGISTRY: ToolDef[] = [
  {
    id: 'web_fetch',
    name: 'Web fetch',
    description: 'Fetch a public HTTP(S) URL and return text. SSRF-checked; no credentials sent.',
    consequential: false,
    input: WebFetchInput,
  },
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Evaluate arithmetic safely (no code execution).',
    consequential: false,
    input: CalculatorInput,
  },
  {
    id: 'datetime',
    name: 'Date & time',
    description: 'Current UTC time, optionally formatted for an IANA time zone label.',
    consequential: false,
    input: DatetimeInput,
  },
  {
    id: 'text_stats',
    name: 'Text stats',
    description: 'Deterministic word/char/reading-time stats for a passage.',
    consequential: false,
    input: TextStatsInput,
  },
];

export interface ToolResult {
  tool: ToolId;
  ok: boolean;
  output: string;
  latencyMs: number;
}

function evaluateArithmetic(expression: string): number {
  const cleaned = expression.trim();
  if (!/^[0-9+\-*/().\s%^]+$/.test(cleaned) || cleaned.length > 200) {
    throw new Error('Only arithmetic characters are allowed.');
  }
  // Shunting-yard → RPN, no eval / Function constructor.
  const ops: Record<string, { prec: number; fn: (a: number, b: number) => number }> = {
    '+': { prec: 1, fn: (a, b) => a + b },
    '-': { prec: 1, fn: (a, b) => a - b },
    '*': { prec: 2, fn: (a, b) => a * b },
    '/': { prec: 2, fn: (a, b) => (b === 0 ? NaN : a / b) },
    '%': { prec: 2, fn: (a, b) => (b === 0 ? NaN : a % b) },
    '^': { prec: 3, fn: (a, b) => a ** b },
  };
  const output: Array<number | string> = [];
  const stack: string[] = [];
  const tokens = cleaned.match(/(\d+(?:\.\d+)?|[+\-*/()%^]|\s+)/g)?.filter((t) => t.trim()) ?? [];
  for (const token of tokens) {
    if (/^\d/.test(token)) output.push(Number(token));
    else if (token in ops) {
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top in ops && ops[top].prec >= ops[token].prec) output.push(stack.pop() as string);
        else break;
      }
      stack.push(token);
    } else if (token === '(') stack.push(token);
    else if (token === ')') {
      while (stack.length > 0 && stack[stack.length - 1] !== '(') output.push(stack.pop() as string);
      if (stack.pop() !== '(') throw new Error('Mismatched parentheses.');
    } else throw new Error('Unsupported expression.');
  }
  while (stack.length > 0) {
    const op = stack.pop() as string;
    if (op === '(') throw new Error('Mismatched parentheses.');
    output.push(op);
  }
  const values: number[] = [];
  for (const item of output) {
    if (typeof item === 'number') values.push(item);
    else {
      const b = values.pop();
      const a = values.pop();
      if (a === undefined || b === undefined) throw new Error('Invalid expression.');
      const result = ops[item].fn(a, b);
      if (!Number.isFinite(result)) throw new Error('Result is not finite.');
      values.push(result);
    }
  }
  if (values.length !== 1) throw new Error('Invalid expression.');
  return values[0];
}

export async function runTool(id: ToolId, rawInput: unknown): Promise<ToolResult> {
  const started = Date.now();
  const def = TOOL_REGISTRY.find((t) => t.id === id);
  if (!def) throw new Error(`Unknown tool "${id}".`);
  const input = def.input.parse(rawInput);
  try {
    let output: string;
    if (id === 'calculator') {
      const value = evaluateArithmetic((input as z.infer<typeof CalculatorInput>).expression);
      output = String(Math.round(value * 1e10) / 1e10);
    } else if (id === 'datetime') {
      output = new Date().toISOString();
    } else if (id === 'text_stats') {
      const text = (input as z.infer<typeof TextStatsInput>).text;
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      output = JSON.stringify({
        chars: text.length,
        words,
        lines: text.split('\n').length,
        readingSeconds: Math.max(1, Math.round((words / 200) * 60)),
      });
    } else {
      const { url, maxChars } = input as z.infer<typeof WebFetchInput>;
      const safe = assertSafeProviderUrl(url, process.env.NODE_ENV !== 'production');
      const res = await safeProviderFetch(
        safe.toString(),
        { headers: { 'user-agent': 'ScaleOS-tool/1.0' }, signal: AbortSignal.timeout(15_000) },
        false,
      );
      const text = await res.text();
      output = res.ok ? text.slice(0, maxChars) : `HTTP ${res.status}: ${text.slice(0, 1000)}`;
    }
    const result: ToolResult = { tool: id, ok: true, output, latencyMs: Date.now() - started };
    insertRow('tool-audit', { ...result, at: new Date().toISOString(), input }, 500);
    return result;
  } catch (error) {
    const result: ToolResult = {
      tool: id,
      ok: false,
      output: error instanceof Error ? error.message : 'Tool failed.',
      latencyMs: Date.now() - started,
    };
    insertRow('tool-audit', { ...result, at: new Date().toISOString(), input }, 500);
    return result;
  }
}

export function listTools() {
  return TOOL_REGISTRY.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    consequential: t.consequential,
  }));
}

export function toolAudit(limit = 50) {
  return readCollection<Record<string, unknown>>('tool-audit', []).slice(0, limit);
}
