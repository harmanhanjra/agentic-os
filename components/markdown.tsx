'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Minimal safe markdown renderer. HTML is escaped first; only our own
 * tags are ever injected. Supports the structures model output actually
 * uses: code fences, inline code, headers, bold/italic, lists, quotes,
 * links, tables, and paragraphs.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderInlineMarkdown(text: string): string {
  // Extract `code` spans first so markers inside them stay literal.
  const codes: string[] = [];
  let out = text.replace(/`([^`\n]+)`/g, (_, code: string) => {
    codes.push(`<code class="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[12px]">${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  // Escape all model-provided HTML before adding our own controlled tags.
  out = escapeHtml(out);
  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent underline-offset-2 hover:underline">$1</a>',
    );
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)] ?? '');
  return out;
}

interface Block {
  html: string;
  code?: { lang: string; source: string };
}

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.split('\n');
  let i = 0;
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ html: `<p>${renderInlineMarkdown(paragraph.join(' '))}</p>` });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const tag = list.ordered ? 'ol' : 'ul';
      const cls = list.ordered
        ? 'list-decimal space-y-1 pl-5'
        : 'list-disc space-y-1 pl-5';
      blocks.push({
        html: `<${tag} class="${cls}">${list.items.map((it) => `<li>${renderInlineMarkdown(it)}</li>`).join('')}</${tag}>`,
      });
      list = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```(\S*)\s*$/);
    if (fence) {
      flushParagraph();
      flushList();
      const lang = fence[1] || 'text';
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing fence
      blocks.push({ html: '', code: { lang, source: code.join('\n') } });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const size =
        level === 1 ? 'text-lg' : level === 2 ? 'text-base' : 'text-sm';
      blocks.push({
        html: `<h${level} class="${size} mt-4 font-semibold tracking-tight first:mt-0">${renderInlineMarkdown(heading[2])}</h${level}>`,
      });
      i += 1;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({
        html: `<blockquote class="border-l-2 border-line-strong pl-3 text-muted">${renderInlineMarkdown(quote[1])}</blockquote>`,
      });
      i += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ html: '<hr class="my-4 border-line" />' });
      i += 1;
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      const item = (bullet?.[1] ?? numbered?.[1] ?? '').trim();
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item);
      i += 1;
      continue;
    }

    // Simple pipe tables: header + separator + rows.
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])
    ) {
      flushParagraph();
      flushList();
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => `<td class="border border-line px-2.5 py-1.5">${renderInlineMarkdown(c.trim())}</td>`)
          .join('');
      const headerCells = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => `<th class="border border-line bg-raised px-2.5 py-1.5 text-left font-medium">${renderInlineMarkdown(c.trim())}</th>`)
        .join('');
      const rows: string[] = [`<tr>${headerCells}</tr>`];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().length > 0) {
        rows.push(`<tr>${cells(lines[i])}</tr>`);
        i += 1;
      }
      blocks.push({
        html: `<div class="overflow-x-auto"><table class="w-full border-collapse text-[13px]">${rows.join('')}</table></div>`,
      });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      i += 1;
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }
  flushParagraph();
  flushList();
  return blocks;
}

function CodeBlock({ lang, source }: { lang: string; source: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
    } catch {
      const area = document.createElement('textarea');
      area.value = source;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="flex items-center justify-between border-b border-line bg-raised/50 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-faint">
          {lang}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-faint transition hover:text-ink"
        >
          {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[12.5px] leading-6">
        <code>{source}</code>
      </pre>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2.5 text-sm leading-6">
      {blocks.map((b, i) =>
        b.code ? (
          <CodeBlock key={i} lang={b.code.lang} source={b.code.source} />
        ) : (
          <div key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
        ),
      )}
    </div>
  );
}
