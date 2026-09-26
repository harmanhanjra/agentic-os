import { describe, it, expect } from 'vitest';
import { classifyVoiceCommand, type ClassifiedCommand } from '../lib/voice/intent';

describe('voice agent intent classification', () => {
  it('detects research intent', () => {
    const cmd = classifyVoiceCommand('research this topic');
    expect(cmd.intent).toBe('agent_research');
  });

  it('detects deep dive intent', () => {
    const cmd = classifyVoiceCommand('deep dive into quantum computing');
    expect(cmd.intent).toBe('agent_research');
  });

  it('detects morning digest intent', () => {
    const cmd = classifyVoiceCommand('give me a morning digest');
    expect(cmd.intent).toBe('agent_digest');
  });

  it('detects daily briefing intent', () => {
    const cmd = classifyVoiceCommand('daily briefing');
    expect(cmd.intent).toBe('agent_digest');
  });

  it('detects react/reasoning intent', () => {
    const cmd = classifyVoiceCommand('reason through this problem step by step');
    expect(cmd.intent).toBe('agent_react');
  });

  it('detects code execution intent', () => {
    const cmd = classifyVoiceCommand('write a script to sort a list');
    expect(cmd.intent).toBe('agent_code');
  });

  it('detects planner intent', () => {
    const cmd = classifyVoiceCommand('plan this out for me');
    expect(cmd.intent).toBe('agent_planner');
  });

  it('detects break down intent', () => {
    const cmd = classifyVoiceCommand('break down how to build a website');
    expect(cmd.intent).toBe('agent_planner');
  });

  it('does not false-positive on simple chat', () => {
    const cmd = classifyVoiceCommand('what is the weather today');
    expect(cmd.intent).toBe('chat');
  });

  it('does not false-positive on browser commands', () => {
    const cmd = classifyVoiceCommand('open google.com');
    expect(cmd.intent).toBe('browser_navigate');
  });

  it('detects "explore" as research', () => {
    const cmd = classifyVoiceCommand('explore machine learning trends');
    expect(cmd.intent).toBe('agent_research');
  });

  it('detects "investigate" as research', () => {
    const cmd = classifyVoiceCommand('investigate the latest AI news');
    expect(cmd.intent).toBe('agent_research');
  });

  it('detects "solve this" as react', () => {
    const cmd = classifyVoiceCommand('solve this math problem');
    expect(cmd.intent).toBe('agent_react');
  });

  it('detects "analyze this" as react', () => {
    const cmd = classifyVoiceCommand('analyze this data');
    expect(cmd.intent).toBe('agent_react');
  });

  it('detects "execute" as code', () => {
    const cmd = classifyVoiceCommand('execute a python script');
    expect(cmd.intent).toBe('agent_code');
  });

  it('detects "run a script" as code', () => {
    const cmd = classifyVoiceCommand('run a script to parse csv');
    expect(cmd.intent).toBe('agent_code');
  });
});
