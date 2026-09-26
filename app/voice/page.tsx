import { AppShell } from '@/components/app-shell';
import { VoiceClient } from '@/components/voice-client';

export const metadata = {
  title: 'Naughty · Voice Agent',
  description: 'Talk to Naughty, the ScaleOS voice agent. Speech in, spoken answers out.',
};

export default function VoicePage() {
  return (
    <AppShell>
      <VoiceClient />
    </AppShell>
  );
}
