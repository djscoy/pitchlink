import type { TransactionMode } from '@pitchlink/shared';

/**
 * Returns CSS custom property references for mode colors.
 * These resolve to theme-aware values (e.g., lighter blue in dark mode).
 */
export function useModeColors(mode: TransactionMode) {
  return {
    color: `var(--pl-mode-${mode})`,
    bgColor: `var(--pl-mode-${mode}-bg)`,
  };
}
