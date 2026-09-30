import { describe, it, expect } from 'vitest';
import { classifyVoiceCommand, type VoiceIntent } from '../lib/voice/intent';

describe('Voice Intent Classifier', () => {
  const cases: Array<{ input: string; expected: VoiceIntent; url?: string; text?: string; scroll?: string; ref?: string; hotkey?: string }> = [
    { input: 'Open google.com', expected: 'browser_navigate', url: 'https://google.com' },
    { input: 'Navigate to https://github.com/login', expected: 'browser_navigate', url: 'https://github.com/login' },
    { input: 'Go to example.com', expected: 'browser_navigate', url: 'https://example.com' },
    { input: 'Click the login button', expected: 'browser_click' },
    { input: 'Click ref s3', expected: 'browser_click', ref: 's3' },
    { input: 'Tap s0', expected: 'browser_click', ref: 's0' },
    { input: 'Type hello world', expected: 'browser_type', text: 'hello world' },
    { input: 'Fill the search box with cat photos', expected: 'browser_type', text: 'cat photos' },
    { input: 'Enter my email address', expected: 'browser_type', text: 'my email address' },
    { input: 'Search for neural networks', expected: 'browser_type', text: 'neural networks' },
    { input: 'Scroll down', expected: 'browser_scroll', scroll: 'down' },
    { input: 'Page up', expected: 'browser_scroll', scroll: 'up' },
    { input: 'Read the page', expected: 'browser_read' },
    { input: "What's on the screen", expected: 'browser_read' },
    { input: 'Take a screenshot', expected: 'browser_screenshot' },
    { input: 'Capture the page', expected: 'browser_screenshot' },
    { input: 'Take a screenshot of the desktop', expected: 'computer_screenshot' },
    { input: 'Press Ctrl+C', expected: 'computer_hotkey', hotkey: 'Control+C' },
    { input: 'Press alt+f4', expected: 'computer_hotkey', hotkey: 'Alt+F4' },
    { input: 'Hello how are you', expected: 'chat' },
    { input: 'What is the capital of France', expected: 'chat' },
  ];

  for (const c of cases) {
    it(`classifies "${c.input}" → ${c.expected}`, () => {
      const result = classifyVoiceCommand(c.input);
      expect(result.intent).toBe(c.expected);
      if (c.url) expect(result.url).toBe(c.url);
      if (c.text) expect(result.text).toBe(c.text);
      if (c.scroll) expect(result.scroll).toBe(c.scroll);
      if (c.ref) expect(result.ref).toBe(c.ref);
      if (c.hotkey) expect(result.hotkey).toBe(c.hotkey);
    });
  }

  it('strips wake word from instruction', () => {
    const result = classifyVoiceCommand('Naughty open google.com');
    expect(result.intent).toBe('browser_navigate');
    expect(result.url).toBe('https://google.com');
  });
});
