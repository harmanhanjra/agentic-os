import { WorkspacePage } from '@/components/workspace-page';

export default function FlowsPage() {
  return (
    <WorkspacePage
      kind="flows"
      title="Flows"
      eyebrow="Workflow foundation"
      description="Compose a reliable Input → Prompt → Model → Output path. The execution abstraction is designed to grow into richer workflows without a rewrite."
      action="Create flow"
    />
  );
}
