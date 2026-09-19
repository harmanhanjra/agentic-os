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


export const ComputerActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    target: z.string().min(1).max(300),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    durationMs: z.number().int().min(0).max(5000).optional(),
  }),
  z.object({
    type: z.literal('click'),
    target: z.string().min(1).max(300),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    button: z.enum(['left', 'right', 'middle']).default('left'),
  }),
  z.object({
    type: z.literal('double_click'),
    target: z.string().min(1).max(300),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    button: z.enum(['left', 'right', 'middle']).default('left'),
  }),
  z.object({
    type: z.literal('right_click'),
    target: z.string().min(1).max(300),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('drag'),
    target: z.string().min(1).max(300),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    x2: z.number().int().nonnegative(),
    y2: z.number().int().nonnegative(),
    button: z.enum(['left', 'right', 'middle']).default('left'),
    durationMs: z.number().int().min(0).max(5000).optional(),
  }),
  z.object({
    type: z.literal('scroll'),
    target: z.string().min(1).max(300),
    amount: z.number().int().min(-6000).max(6000),
  }),
  z.object({
    type: z.literal('type'),
    target: z.string().min(1).max(300),
    text: z.string().max(4000),
  }),
  z.object({
    type: z.literal('hotkey'),
    target: z.string().min(1).max(300),
    keys: z.array(z.string().min(1).max(40)).min(1).max(6),
  }),
  z.object({
    type: z.literal('press'),
    target: z.string().min(1).max(300),
    key: z.string().min(1).max(40),
  }),
  z.object({
    type: z.literal('wait'),
    target: z.string().min(1).max(300),
    ms: z.number().int().min(0).max(10_000),
  }),
  z.object({
    type: z.literal('done'),
    summary: z.string().min(1).max(6000),
  }),
]);

export type ComputerAction = z.infer<typeof ComputerActionSchema>;

export const ComputerDecisionSchema = z.object({
  actions: z.array(ComputerActionSchema).min(1).max(3),
  note: z.string().max(1000).optional(),
});

export type ComputerDecision = z.infer<typeof ComputerDecisionSchema>;

export const ComputerWorkerStateSchema = z.object({
  frameId: z.string().min(1),
  capturedAt: z.number(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cursorX: z.number().int().nonnegative(),
  cursorY: z.number().int().nonnegative(),
  screenshotDataUrl: z.string().startsWith('data:image/'),
  activeWindow: z.string().nullable().optional(),
});

export type ComputerWorkerState = z.infer<typeof ComputerWorkerStateSchema>;

export const ComputerWorkerHealthSchema = z.object({
  status: z.literal('healthy'),
  mode: z.string().min(1),
  platform: z.string().min(1),
  screen: z.boolean(),
  mouse: z.boolean(),
  keyboard: z.boolean(),
  capabilities: z.array(z.string()),
});

export type ComputerWorkerHealth = z.infer<typeof ComputerWorkerHealthSchema>;

export interface ComputerActionLog {
  index: number;
  action: ComputerAction;
  status: 'completed' | 'blocked' | 'failed';
  message: string;
}

export interface ComputerRunResult {
  runId: string;
  status: 'completed' | 'blocked' | 'max_actions' | 'failed';
  objective: string;
  model: string;
  summary: string;
  actions: ComputerActionLog[];
  screenshotDataUrl?: string;
  activeWindow?: string | null;
  latencyMs: number;
}
