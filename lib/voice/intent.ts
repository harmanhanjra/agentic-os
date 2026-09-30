import { z } from 'zod';

export const VoiceIntentSchema = z.enum([
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_scroll',
  'browser_read',
  'browser_screenshot',
  'computer_screenshot',
  'computer_desktop',
  'computer_type',
  'computer_hotkey',
  'agent_react',
  'agent_planner',
  'agent_digest',
  'agent_research',
  'agent_code',
  'chat',
]);
export type VoiceIntent = z.infer<typeof VoiceIntentSchema>;

export interface ClassifiedCommand {
  intent: VoiceIntent;
  /** Natural language summary of what to do. */
  instruction: string;
  /** Extracted URL if the command mentions one. */
  url?: string;
  /** Extracted text to type if the command mentions it. */
  text?: string;
  /** Scroll direction if applicable. */
  scroll?: 'up' | 'down' | 'page_up' | 'page_down';
  /** Hotkey if the user mentioned one. */
  hotkey?: string;
  /** Element reference (ref s0, s1...) if the user mentions one. */
  ref?: string;
}

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(naughty|hey naughty|naughty please|dear naughty)\b/gi, '')
    .replace(/[!?.]+$/g, '')
    .trim();
}

function extractUrl(raw: string): string | undefined {
  // Explicit http(s) URLs
  const http = raw.match(/(https?:\/\/[^\s"']+)/i);
  if (http) return http[1];
  // Non-http protocols with :// (file://, data:text/...)
  const protoSlash = raw.match(/\b([a-z][a-z0-9+.-]*:\/\/[^\s"']+)/i);
  if (protoSlash) return protoSlash[1];
  // Short protocols like about:blank, javascript:void(0)
  const protoShort = raw.match(/\b(about:[a-z0-9_-]+|data:[^\s"']*)/i);
  if (protoShort) return protoShort[1];
  // bare domain like "google.com"
  const bare = raw.match(/\b([a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i);
  return bare ? `https://${bare[1]}` : undefined;
}

function extractRef(raw: string): string | undefined {
  const m = raw.match(/\b(ref|element|button|field)\s+(s?\d{1,3})\b/i);
  if (m) return `s${m[2].replace(/^s/, '')}`;
  const direct = raw.match(/\b(s\d{1,3})\b/i);
  return direct ? direct[1] : undefined;
}

function extractText(raw: string): string | undefined {
  const patterns: Array<{ re: RegExp; group: number }> = [
    { re: /type\s+(.+)/i, group: 1 },
    { re: /fill\s+(?:the\s+)?(.+?)\s+with\s+(.+)/i, group: 2 },
    { re: /fill\s+(.+)/i, group: 1 },
    { re: /enter\s+(.+)/i, group: 1 },
    { re: /search\s+for\s+(.+)/i, group: 1 },
    { re: /write\s+(.+)/i, group: 1 },
    { re: /put\s+(.+?)\s+in/i, group: 1 },
    { re: /set\s+(.+?)\s+to\s+(.+)/i, group: 2 },
  ];
  for (const { re, group } of patterns) {
    const m = raw.match(re);
    if (m) return m[group].replace(/^["']|["']$/g, '').trim();
  }
  return undefined;
}

function extractScroll(raw: string): 'up' | 'down' | 'page_up' | 'page_down' | undefined {
  if (/\b(scroll\s+down|go\s+down|page\s+down|pgdn)\b/i.test(raw)) return 'down';
  if (/\b(scroll\s+up|go\s+up|page\s+up|pgup)\b/i.test(raw)) return 'up';
  if (/\b(scroller\s+down|move\s+down|next)\b/i.test(raw)) return 'down';
  if (/\b(scroller\s+up|move\s+up|previous)\b/i.test(raw)) return 'up';
  return undefined;
}

function extractHotkey(raw: string): string | undefined {
  const m = raw.match(/\b(press|hit)\b.*/i);
  if (!m) return undefined;
  const parts: string[] = [];
  if (/ctrl|control/i.test(raw)) parts.push('Control');
  if (/\balt\b/i.test(raw)) parts.push('Alt');
  if (/shift/i.test(raw)) parts.push('Shift');
  if (/meta|cmd|command|win/i.test(raw)) parts.push('Meta');
  const keyMap: Record<string, string> = {
    enter: 'Enter', tab: 'Tab', escape: 'Escape', esc: 'Escape',
    space: ' ', backspace: 'Backspace', delete: 'Delete',
    arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
    up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    f1: 'F1', f2: 'F2', f3: 'F3', f4: 'F4', f5: 'F5', f6: 'F6',
    f7: 'F7', f8: 'F8', f9: 'F9', f10: 'F10', f11: 'F11', f12: 'F12',
  };
  // Try named keys first
  const m2 = raw.match(/\b(enter|tab|escape|esc|space|backspace|delete|arrowup|arrowdown|arrowleft|arrowright|up|down|left|right|f[1-9]|f1[0-2])\b/i);
  if (m2) { parts.push(keyMap[m2[1].toLowerCase()] ?? m2[1]); }
  else {
    // Try single letter after + separator (e.g. "Ctrl+C")
    const letter = raw.match(/\+\s*([a-zA-Z0-9])\b/i);
    if (letter) parts.push(letter[1].toUpperCase());
  }
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : parts.join('+');
}

const NAVIGATE_PATTERNS = /\b(open|go\s+to|navigate|visit|load|browse|show|launch|head\s+to)\b/i;
const CLICK_PATTERNS = /\b(click|tap|select|choose|activate)\b/i;
const TYPE_PATTERNS = /\b(type|fill|enter|write|input|put|set|search\s+for)\b/i;
const SCROLL_PATTERNS = /\b(scroll|swipe|move|scroller)\b/i;
const READ_PATTERNS = /\b(read|what(?:'s| is)\s+on|extract|what(?:'s| is)\s+written|describe|summarize)\b/i;
const SCREENSHOT_PATTERNS = /\b(screenshot|capture|snapshot|take\s+a\s+(?:screen|photo|capture))\b/i;
const DESKTOP_PATTERNS = /\b(desktop|screen|open\s+(?:the\s+)?(?:app|application|program))\b/i;
const HOTKEY_PATTERNS = /\b(press|hit)\s+(ctrl|alt|shift|meta|cmd|win|enter|tab|escape|esc|space|backspace|delete|f[1-9]|f1[0-2])/i;

const AGENT_RESEARCH_PATTERNS = /\b(research|deep\s+dive|investigate|look\s+into|find\s+out\s+about|explore|study)\b/i;
const AGENT_DIGEST_PATTERNS = /\b(morning\s+digest|daily\s+briefing|daily\s+digest|what's\s+happening|give\s+me\s+a\s+briefing|today's\s+news|morning\s+update)\b/i;
const AGENT_REACT_PATTERNS = /\b(reason\s+through|think\s+step\s+by\s+step|work\s+through|solve\s+this|analyze\s+this)\b/i;
const AGENT_CODE_PATTERNS = /\b(write\s+(?:a\s+)?(?:some\s+)?(?:code|script|program|app)|execute|run\s+(?:a\s+)?script|code\s+this|program\s+this|build\s+(?:a\s+)?(?:script|program|app))\b/i;
const AGENT_PLANNER_PATTERNS = /\b(plan\s+(?:this|out|my|how)|break\s+down|create\s+a\s+plan|steps\s+to|how\s+would\s+you\s+(?:do|approach))\b/i;

export function classifyVoiceCommand(raw: string): ClassifiedCommand {
  const n = normalize(raw);
  const url = extractUrl(raw);
  const ref = extractRef(raw);
  const text = extractText(raw);
  const scroll = extractScroll(raw);
  const hotkey = extractHotkey(raw);

  // Agent routing — highest priority for complex intents
  if (AGENT_RESEARCH_PATTERNS.test(n)) {
    return { intent: 'agent_research', instruction: raw };
  }
  if (AGENT_DIGEST_PATTERNS.test(n)) {
    return { intent: 'agent_digest', instruction: raw };
  }
  if (AGENT_CODE_PATTERNS.test(n)) {
    return { intent: 'agent_code', instruction: raw };
  }
  if (AGENT_REACT_PATTERNS.test(n)) {
    return { intent: 'agent_react', instruction: raw };
  }
  if (AGENT_PLANNER_PATTERNS.test(n)) {
    return { intent: 'agent_planner', instruction: raw };
  }

  // Screenshot: highest priority when captured
  if (SCREENSHOT_PATTERNS.test(n)) {
    const forDesktop = DESKTOP_PATTERNS.test(n) || /\b(desktop|screen)\b/i.test(n);
    return {
      intent: forDesktop ? 'computer_screenshot' : 'browser_screenshot',
      instruction: raw,
    };
  }

  // Navigate
  if (NAVIGATE_PATTERNS.test(n) || (url && !TYPE_PATTERNS.test(n))) {
    return {
      intent: 'browser_navigate',
      instruction: raw,
      url: url ?? (text ? `https://${text.replace(/\s+/g, '')}` : undefined),
    };
  }

  // Hotkey (must check before click since "press ctrl" matches click pattern)
  if (HOTKEY_PATTERNS.test(n) || hotkey) {
    return {
      intent: 'computer_hotkey',
      instruction: raw,
      hotkey: hotkey ?? 'Enter',
    };
  }

  // Click
  if (CLICK_PATTERNS.test(n)) {
    return {
      intent: 'browser_click',
      instruction: raw,
      ref,
    };
  }

  // Type / fill
  if (TYPE_PATTERNS.test(n)) {
    return {
      intent: 'browser_type',
      instruction: raw,
      ref,
      text: text ?? extractUrl(raw),
    };
  }

  // Scroll
  if (SCROLL_PATTERNS.test(n) || scroll) {
    return {
      intent: 'browser_scroll',
      instruction: raw,
      scroll: scroll ?? 'down',
    };
  }

  // Read / extract
  if (READ_PATTERNS.test(n)) {
    return {
      intent: 'browser_read',
      instruction: raw,
      ref,
    };
  }

  // Desktop control
  if (DESKTOP_PATTERNS.test(n)) {
    return {
      intent: 'computer_desktop',
      instruction: raw,
    };
  }

  // Fallback to chat
  return {
    intent: 'chat',
    instruction: raw,
  };
}
