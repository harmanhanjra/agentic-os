import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPrivateAddress } from '../security/url';
import type { BrowserSnapshot } from './types';

interface Pending {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface CdpMessage {
  id?: number;
  result?: unknown;
  error?: { message?: string };
  sessionId?: string;
}

async function assertSafeCdpEndpoint(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('BROWSER_CDP_URL must use HTTP(S) or WS(S).');
  }

  const allowPrivate =
    process.env.NODE_ENV !== 'production' &&
    process.env.SCALEOS_BROWSER_ALLOW_PRIVATE === 'true';

  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isPrivateAddress(host)) throw new Error('Private CDP endpoints are blocked.');
    if (!isIP(host)) {
      const records = await lookup(host, { all: true, verbatim: true });
      if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
        throw new Error('CDP endpoint resolves to a private or reserved address.');
      }
    }
  }

  return url;
}

async function resolveWebSocketEndpoint(raw: string): Promise<string> {
  const url = await assertSafeCdpEndpoint(raw);
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return url.toString();

  const versionUrl = new URL('/json/version', url);
  const response = await fetch(versionUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('CDP endpoint did not expose /json/version.');
  const body = (await response.json()) as { webSocketDebuggerUrl?: string };
  if (!body.webSocketDebuggerUrl) throw new Error('CDP endpoint did not return a browser WebSocket URL.');
  await assertSafeCdpEndpoint(body.webSocketDebuggerUrl);
  return body.webSocketDebuggerUrl;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CdpBrowser {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private targetId = '';
  private sessionId = '';

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as CdpMessage;
        if (!message.id) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? 'CDP command failed.'));
        else pending.resolve(message.result);
      } catch {
        // Ignore unsolicited or malformed browser events.
      }
    });
  }

  static async connect(endpoint: string): Promise<CdpBrowser> {
    const wsUrl = await resolveWebSocketEndpoint(endpoint);
    const socket = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to browser CDP.')), 8000);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Could not connect to browser CDP.'));
      });
    });

    const browser = new CdpBrowser(socket);
    await browser.createPage();
    return browser;
  }

  private call<T = any>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
    timeoutMs = 10_000,
  ): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP command timed out: ' + method));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  }

  private async createPage() {
    const target = await this.call<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
    });
    this.targetId = target.targetId;
    const attached = await this.call<{ sessionId: string }>('Target.attachToTarget', {
      targetId: this.targetId,
      flatten: true,
    });
    this.sessionId = attached.sessionId;
    await this.call('Page.enable', {}, this.sessionId);
    await this.call('Runtime.enable', {}, this.sessionId);
  }

  async navigate(url: string) {
    await this.call('Page.navigate', { url }, this.sessionId, 15_000);
    for (let i = 0; i < 20; i += 1) {
      await delay(250);
      try {
        const ready = await this.evaluate<string>('document.readyState');
        if (ready === 'complete' || ready === 'interactive') break;
      } catch {
        // Page may still be switching execution contexts.
      }
    }
    await delay(250);
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.call<{
      result?: { value?: T; description?: string };
      exceptionDetails?: unknown;
    }>(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: false,
      },
      this.sessionId,
    );
    if (result.exceptionDetails) throw new Error('Browser page evaluation failed.');
    return result.result?.value as T;
  }

  async snapshot(): Promise<BrowserSnapshot> {
    const expression = `(() => {
      const visible = (el) => {
        const style = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
      };
      let index = 0;
      const elements = Array.from(document.querySelectorAll(
        'a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]'
      ))
        .filter(visible)
        .slice(0, 120)
        .map((el) => {
          const ref = 's' + String(index++);
          el.setAttribute('data-scaleos-ref', ref);
          const text = (
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            el.innerText ||
            el.value ||
            el.getAttribute('placeholder') ||
            el.getAttribute('name') ||
            ''
          ).replace(/\\s+/g, ' ').trim().slice(0, 180);
          return {
            ref,
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
            text,
            type: el.getAttribute('type'),
            href: el.href || null,
          };
        });
      return {
        url: location.href,
        title: document.title,
        pageText: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 12000),
        elements,
      };
    })()`;
    return this.evaluate<BrowserSnapshot>(expression);
  }

  async click(ref: string) {
    const result = await this.evaluate<{ ok: boolean }>(`(() => {
      const el = document.querySelector('[data-scaleos-ref="${ref}"]');
      if (!el) return { ok: false };
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.click();
      return { ok: true };
    })()`);
    if (!result?.ok) throw new Error('Element is stale or no longer available.');
    await delay(400);
  }

  async fill(ref: string, text: string) {
    const encoded = JSON.stringify(text);
    const result = await this.evaluate<{ ok: boolean }>(`(() => {
      const el = document.querySelector('[data-scaleos-ref="${ref}"]');
      if (!el) return { ok: false };
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.focus();
      const value = ${encoded};
      if (el instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(el, value); else el.value = value;
      } else if (el instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (setter) setter.call(el, value); else el.value = value;
      } else if (el instanceof HTMLElement && el.isContentEditable) {
        el.textContent = value;
      } else {
        return { ok: false };
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    })()`);
    if (!result?.ok) throw new Error('Element cannot accept text.');
    await delay(150);
  }

  async press(key: string) {
    const keyCode: Record<string, number> = {
      Enter: 13,
      Tab: 9,
      Escape: 27,
      ArrowLeft: 37,
      ArrowUp: 38,
      ArrowRight: 39,
      ArrowDown: 40,
    };
    const code = keyCode[key] ?? 0;
    await this.call(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code },
      this.sessionId,
    );
    await this.call(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code },
      this.sessionId,
    );
    await delay(150);
  }

  async scroll(deltaY: number) {
    await this.evaluate(`window.scrollBy({ top: ${Math.trunc(deltaY)}, behavior: 'instant' })`);
    await delay(150);
  }

  async extract(ref?: string): Promise<string> {
    if (!ref) {
      return this.evaluate<string>(
        `(document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 16000)`,
      );
    }
    return this.evaluate<string>(`(() => {
      const el = document.querySelector('[data-scaleos-ref="${ref}"]');
      return el ? (el.innerText || el.value || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 8000) : '';
    })()`);
  }

  async screenshot(): Promise<string> {
    const result = await this.call<{ data: string }>(
      'Page.captureScreenshot',
      {
        format: 'jpeg',
        quality: 65,
        fromSurface: true,
        captureBeyondViewport: false,
      },
      this.sessionId,
      15_000,
    );
    return 'data:image/jpeg;base64,' + result.data;
  }

  async close() {
    try {
      if (this.targetId) await this.call('Target.closeTarget', { targetId: this.targetId });
    } catch {
      // Best-effort cleanup.
    }
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Browser session closed.'));
    }
    this.pending.clear();
    this.socket.close();
  }
}

export async function probeCdpBrowser(endpoint: string): Promise<boolean> {
  let browser: CdpBrowser | null = null;
  try {
    browser = await CdpBrowser.connect(endpoint);
    const snapshot = await browser.snapshot();
    return snapshot.url === 'about:blank';
  } catch {
    return false;
  } finally {
    await browser?.close();
  }
}
