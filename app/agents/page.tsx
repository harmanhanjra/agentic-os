import { AppShell } from '@/components/app-shell';
import { AgentsClient } from '@/components/agents-client';

export default function AgentsPage() {
  return (
    <AppShell>
      <AgentsClient />
    </AppShell>
  );
}
