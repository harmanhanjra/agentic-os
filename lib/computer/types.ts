import { z } from 'zod';

export const BrowserActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), url: z.string().url().max(2000) }),
  z.object({ type: z.literal('click'), ref: z.string().regex(/^s\d{1,3}$/) }),
  z.object({
    type: z.literal('fill'),
    ref: z.string().regex(/^s\d{1,3}$/),
    text: z.string().max(5000),
  }),
  z.object({
    type: z.literal('press'),
    key: z.enum(['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']),
  }),
  z.object({ type: z.literal('scroll'), deltaY: z.number().int().min(-3000).max(3000) }),
  z.object({ type: z.literal('extract'), ref: z.string().regex(/^s\d{1,3}$/).optional() }),
  z.object({ type: z.literal('done'), summary: z.string().min(1).max(6000) }),
]);

export type BrowserAction = z.infer<typeof BrowserActionSchema>;

export const BrowserDecisionSchema = z.object({
  actions: z.array(BrowserActionSchema).min(1).max(3),
  note: z.string().max(1000).optional(),
});

export type BrowserDecision = z.infer<typeof BrowserDecisionSchema>;

export interface BrowserElement {
  ref: string;
  role: string;
  text: string;
  type: string | null;
  href: string | null;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  pageText: string;
  elements: BrowserElement[];
}

export interface BrowserActionLog {
  index: number;
  action: BrowserAction;
  status: 'completed' | 'blocked' | 'failed';
  message: string;
  url?: string;
  title?: string;
}

export interface BrowserRunResult {
  runId: string;
  status: 'completed' | 'blocked' | 'max_actions' | 'failed';
  objective: string;
  model: string;
  finalUrl: string;
  finalTitle: string;
  summary: string;
  actions: BrowserActionLog[];
  extracted: string[];
  screenshotDataUrl?: string;
  latencyMs: number;
}

export interface ComputerWorkerResult {
  runId?: string;
  status: string;
  summary?: string;
  actions?: Array<Record<string, unknown>>;
  screenshotDataUrl?: string;
  [key: string]: unknown;
}
