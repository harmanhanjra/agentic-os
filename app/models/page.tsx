import { WorkspacePage } from '@/components/workspace-page';

export default function ModelsPage() {
  return (
    <WorkspacePage
      kind="models"
      title="Model Registry"
      eyebrow="Capability control"
      description="Registered models are discovered from your providers and filtered by capabilities, availability, context window, local status, and workspace preferences — never hard-coded names."
      action="Sync models"
    />
  );
}
