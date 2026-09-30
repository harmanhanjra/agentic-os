'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Theme-aware toaster. Colors hook directly into the semantic tokens via raw
 * CSS so the toasts always match the active ScaleOS theme.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-panel group-[.toaster]:text-ink group-[.toaster]:border-line-strong group-[.toaster]:shadow-2xl',
          description: 'group-[.toast]:text-muted',
          actionButton:
            'group-[.toast]:bg-accent group-[.toast]:text-accent-ink',
          cancelButton:
            'group-[.toast]:bg-raised group-[.toast]:text-muted',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };