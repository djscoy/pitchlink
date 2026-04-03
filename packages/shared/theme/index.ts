// ============================================================
// PitchLink Theme System
// CSS Custom Properties for Light & Dark themes
// ============================================================

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeTokens {
  // Backgrounds
  '--pl-bg-primary': string;
  '--pl-bg-secondary': string;
  '--pl-bg-tertiary': string;
  '--pl-bg-hover': string;
  '--pl-bg-active': string;

  // Text
  '--pl-text-primary': string;
  '--pl-text-secondary': string;
  '--pl-text-tertiary': string;
  '--pl-text-inverse': string;

  // Borders
  '--pl-border-primary': string;
  '--pl-border-secondary': string;

  // Surfaces (cards, modals)
  '--pl-surface': string;
  '--pl-surface-raised': string;

  // Status
  '--pl-success': string;
  '--pl-warning': string;
  '--pl-error': string;
  '--pl-info': string;

  // Mode colors (always the same, adjusted for contrast)
  '--pl-mode-buy': string;
  '--pl-mode-sell': string;
  '--pl-mode-exchange': string;
  '--pl-mode-buy-bg': string;
  '--pl-mode-sell-bg': string;
  '--pl-mode-exchange-bg': string;

  // Shadows
  '--pl-shadow-sm': string;
  '--pl-shadow-md': string;

  // Scrollbar
  '--pl-scrollbar-thumb': string;
  '--pl-scrollbar-track': string;
}

export const LIGHT_THEME: ThemeTokens = {
  '--pl-bg-primary': '#FFFFFF',
  '--pl-bg-secondary': '#F9FAFB',
  '--pl-bg-tertiary': '#F3F4F6',
  '--pl-bg-hover': '#F3F4F6',
  '--pl-bg-active': '#E5E7EB',

  '--pl-text-primary': '#111827',
  '--pl-text-secondary': '#6B7280',
  '--pl-text-tertiary': '#9CA3AF',
  '--pl-text-inverse': '#FFFFFF',

  '--pl-border-primary': '#E5E7EB',
  '--pl-border-secondary': '#D1D5DB',

  '--pl-surface': '#FFFFFF',
  '--pl-surface-raised': '#FFFFFF',

  '--pl-success': '#059669',
  '--pl-warning': '#D97706',
  '--pl-error': '#DC2626',
  '--pl-info': '#2563EB',

  '--pl-mode-buy': '#2563EB',
  '--pl-mode-sell': '#059669',
  '--pl-mode-exchange': '#7C3AED',
  '--pl-mode-buy-bg': '#EFF6FF',
  '--pl-mode-sell-bg': '#ECFDF5',
  '--pl-mode-exchange-bg': '#F5F3FF',

  '--pl-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
  '--pl-shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',

  '--pl-scrollbar-thumb': '#D1D5DB',
  '--pl-scrollbar-track': '#F3F4F6',
};

export const DARK_THEME: ThemeTokens = {
  '--pl-bg-primary': '#0F172A',
  '--pl-bg-secondary': '#1E293B',
  '--pl-bg-tertiary': '#334155',
  '--pl-bg-hover': '#1E293B',
  '--pl-bg-active': '#334155',

  '--pl-text-primary': '#F1F5F9',
  '--pl-text-secondary': '#94A3B8',
  '--pl-text-tertiary': '#64748B',
  '--pl-text-inverse': '#0F172A',

  '--pl-border-primary': '#334155',
  '--pl-border-secondary': '#475569',

  '--pl-surface': '#1E293B',
  '--pl-surface-raised': '#334155',

  '--pl-success': '#34D399',
  '--pl-warning': '#FBBF24',
  '--pl-error': '#F87171',
  '--pl-info': '#60A5FA',

  '--pl-mode-buy': '#60A5FA',
  '--pl-mode-sell': '#34D399',
  '--pl-mode-exchange': '#A78BFA',
  '--pl-mode-buy-bg': '#1E3A5F',
  '--pl-mode-sell-bg': '#1A3A2A',
  '--pl-mode-exchange-bg': '#2D1B69',

  '--pl-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.3)',
  '--pl-shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.4)',

  '--pl-scrollbar-thumb': '#475569',
  '--pl-scrollbar-track': '#1E293B',
};

/**
 * Generate a CSS string with all theme custom properties
 */
export function generateThemeCSS(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');
}

/**
 * Full theme stylesheet for injection
 */
export function getThemeStylesheet(): string {
  return `
:root, .pitchlink-theme-light {
${generateThemeCSS(LIGHT_THEME)}
}

.pitchlink-theme-dark {
${generateThemeCSS(DARK_THEME)}
}

@media (prefers-color-scheme: dark) {
  :root:not(.pitchlink-theme-light) {
${generateThemeCSS(DARK_THEME)}
  }
}
`.trim();
}
