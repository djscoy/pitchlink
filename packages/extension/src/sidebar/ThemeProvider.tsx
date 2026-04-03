import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ThemeMode } from '@pitchlink/shared';

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    // Load saved preference
    try {
      const saved = localStorage.getItem('pitchlink-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch {
      // localStorage not available
    }
    return 'system';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveTheme(theme));

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    try {
      localStorage.setItem('pitchlink-theme', mode);
    } catch {
      // ignore
    }
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        setResolvedTheme(getSystemTheme());
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  // Update resolved theme when preference changes
  useEffect(() => {
    setResolvedTheme(resolveTheme(theme));
  }, [theme]);

  // Apply theme class to sidebar root
  useEffect(() => {
    const root = document.getElementById('pitchlink-sidebar-root');
    if (root) {
      root.classList.remove('pitchlink-theme-light', 'pitchlink-theme-dark');
      root.classList.add(`pitchlink-theme-${resolvedTheme}`);
    }
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
