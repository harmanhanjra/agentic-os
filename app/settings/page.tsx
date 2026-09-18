import { AppShell } from '@/components/app-shell';
import { ProvidersClient } from '@/components/providers-client';

export default function SettingsPage() {
  return (
    <AppShell>
      <ProvidersClient />
    </AppShell>
  );
}
