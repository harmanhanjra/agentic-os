import { AppShell } from '@/components/app-shell';
import { ProvidersClient } from '@/components/providers-client';
import { SettingsUsage } from '@/components/settings-usage';

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsUsage />
      <ProvidersClient />
    </AppShell>
  );
}
