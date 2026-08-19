'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * ThemeToggle — switches between light/dark via next-themes.
 * Uses `attribute="class"` so dark mode classes (dark:) light up.
 *
 * The mounted flag avoids a hydration mismatch between the SSR markup
 * (where `useTheme()` cannot know the resolved theme) and the client
 * (where it can). The single setMounted(true) call is the canonical
 * next-themes pattern — see https://github.com/pacocoursey/next-themes#avoid-hydration-mismatch.
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" className="size-9" aria-label="Toggle theme">
        <Sun className="size-4" />
      </Button>
    );
  }

  const isDark = (resolvedTheme ?? theme) === 'dark';
  return (
    <Button
      variant="outline"
      size="icon"
      className="size-9"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
