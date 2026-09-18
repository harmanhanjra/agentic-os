import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeInitScript } from '@/components/theme';

export const metadata: Metadata = {
  title: 'ScaleOS AI — One workspace. Every AI model.',
  description:
    'A universal AI operating workspace for creation, reasoning, and model control.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f0' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0c0b' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
