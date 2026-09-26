export { runReActAgent, type ReActResult, type ReActStep } from './react';
export { planTask, type TaskPlan, type SubTask } from './planner';
export { generateMorningDigest, type MorningDigest, type DigestItem } from './morning-digest';
export { runDeepResearch, type DeepResearch, type ResearchFinding, type ResearchSource } from './deep-research';
export { executeCodeRequest, type CodeExecutionResult } from './code-executor';

export type AgentType = 'react' | 'planner' | 'digest' | 'research' | 'code';

export interface AgentRequest {
  agent: AgentType;
  input: string;
  context?: string;
}

export interface AgentResponse {
  agent: AgentType;
  output: string;
  data: unknown;
  model?: string;
  latencyMs: number;
}

export async function runAgent(req: AgentRequest): Promise<AgentResponse> {
  const started = Date.now();
  switch (req.agent) {
    case 'react': {
      const { runReActAgent } = await import('./react');
      const result = await runReActAgent(req.input);
      return { agent: 'react', output: result.answer, data: result, model: result.model, latencyMs: Date.now() - started };
    }
    case 'planner': {
      const { planTask } = await import('./planner');
      const result = await planTask(req.input);
      return { agent: 'planner', output: `Planned ${result.subtasks.length} subtasks.`, data: result, model: result.model, latencyMs: Date.now() - started };
    }
    case 'digest': {
      const { generateMorningDigest } = await import('./morning-digest');
      const result = await generateMorningDigest(req.context);
      return { agent: 'digest', output: `${result.greeting}\n\n${result.items.map((i) => `${i.category}: ${i.headline} — ${i.detail}`).join('\n')}\n\n${result.summary}`, data: result, model: result.model, latencyMs: Date.now() - started };
    }
    case 'research': {
      const { runDeepResearch } = await import('./deep-research');
      const result = await runDeepResearch(req.input);
      return { agent: 'research', output: result.conclusion, data: result, model: result.model, latencyMs: Date.now() - started };
    }
    case 'code': {
      const { executeCodeRequest } = await import('./code-executor');
      const result = await executeCodeRequest(req.input);
      return { agent: 'code', output: result.spoken, data: result, latencyMs: Date.now() - started };
    }
    default:
      return { agent: req.agent, output: 'Unknown agent type.', data: null, latencyMs: Date.now() - started };
  }
}
