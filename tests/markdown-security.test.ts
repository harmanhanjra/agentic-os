import { describe, expect, it } from 'vitest';
import { renderInlineMarkdown } from '../components/markdown';

describe('safe markdown rendering', () => {
  it('escapes raw HTML from model output', () => {
    const html = renderInlineMarkdown(
      '<img src=x onerror=alert(1)><script>alert(1)</script>',
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script');
  });

  it('keeps controlled markdown formatting', () => {
    expect(renderInlineMarkdown('**safe**')).toContain('<strong>safe</strong>');
    const link = renderInlineMarkdown('[OpenAI](https://openai.com)');
    expect(link).toContain('href="https://openai.com"');
    expect(link).toContain('rel="noopener noreferrer"');
  });
});
