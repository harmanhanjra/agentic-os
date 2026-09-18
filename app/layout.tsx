import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ScaleOS AI — One workspace. Every AI model.',
  description: 'A universal AI operating workspace for creation, reasoning, and model control.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
