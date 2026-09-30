import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configuredModels, postChatCompletions, providerResponseError, type ChatMessage, type ResolvedTarget } from '../ai/dispatch';
import { ScaleOSError } from '../ai/types';
import { safeProviderFetch } from '../security/fetch';

export interface CodeExecutionResult {
  requestId: string;
  code: string;
  language: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  ok: boolean;
  spoken: string;
}

function selectTarget(): ResolvedTarget {
  const pool = configuredModels().filter((m) => m.capabilities.includes('text'));
  const local = pool.filter((m) => m.providerId === 'ollama');
  const external = pool.filter((m) => m.providerId !== 'ollama');
  const ordered = [...local, ...external];
  if (ordered.length === 0) throw new ScaleOSError('MODEL_UNAVAILABLE', 'No text provider available.');
  const model = ordered[0];
  return { providerId: model.providerId, externalModelId: model.externalModelId, displayName: model.displayName };
}

async function generateCode(description: string): Promise<{ code: string; language: string }> {
  const target = selectTarget();
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: 'You are a code generator. Output ONLY executable code, no explanations, no markdown, no code fences. Use Python by default unless the user specifies another language. Keep code under 50 lines.',
    },
    { role: 'user', content: description },
  ];
  const response = await postChatCompletions(target, messages, false);
  if (!response.ok) throw new ScaleOSError('PROVIDER_ERROR', 'Code generation failed.');
  const body = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = body?.choices?.[0]?.message?.content?.trim() ?? '';
  const code = raw.replace(/```[\w]*\n?/g, '').replace(/```/g, '').trim();
  const language = /\b(python|py)\b/i.test(code) || code.includes('import ') || code.includes('def ') ? 'python' : 'python';
  return { code, language };
}

function executeCode(code: string, language: string): { stdout: string; stderr: string; exitCode: number } {
  const dir = join(tmpdir(), 'scaleos-code-' + Date.now());
  mkdirSync(dir, { recursive: true });

  const ext = language === 'python' ? '.py' : '.py';
  const file = join(dir, 'exec' + ext);
  writeFileSync(file, code, 'utf-8');

  try {
    const result = execSync(`python "${file}"`, {
      timeout: 15000,
      encoding: 'utf-8',
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return { stdout: result, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message ?? 'Execution failed',
      exitCode: error.status ?? 1,
    };
  } finally {
    try { unlinkSync(file); } catch { /* cleanup best effort */ }
    try { require('node:fs').rmdirSync(dir); } catch { /* cleanup best effort */ }
  }
}

export async function executeCodeRequest(description: string): Promise<CodeExecutionResult> {
  const requestId = crypto.randomUUID();
  try {
    const { code, language } = await generateCode(description);
    const { stdout, stderr, exitCode } = executeCode(code, language);
    const ok = exitCode === 0;
    const spoken = ok
      ? `Code executed successfully. ${stdout.slice(0, 300) || 'No output.'}`
      : `Code failed with exit code ${exitCode}. ${stderr.slice(0, 300)}`;
    return { requestId, code, language, stdout, stderr, exitCode, ok, spoken };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Code execution failed.';
    return { requestId, code: '', language: 'python', stdout: '', stderr: message, exitCode: 1, ok: false, spoken: `Error: ${message}` };
  }
}
