/**
 * Providers — client component wrapper that exposes all client-side context
 * providers (ThemeProvider + SessionProvider). Server-rendered layout wraps
 * children in this client island.
 */
'use client';

import { ThemeProvider } from 'next-themes';
import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { AuthBootstrap } from '@/components/nomos/AuthBootstrap';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider>
        <AuthBootstrap />
        {children}
        <Toaster />
        <Sonner position="bottom-right" richColors closeButton />
      </SessionProvider>
    </ThemeProvider>
  );
}
