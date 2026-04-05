import { useEffect } from 'react';

interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * Registers keyboard shortcuts on the sidebar root.
 * Shortcuts use Alt+key to avoid conflicts with Gmail hotkeys.
 *
 * @param shortcuts - Map of "alt+key" strings to callback functions
 * @param enabled - Whether shortcuts are active (disable during text input)
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // Only let Escape through
        if (e.key !== 'Escape') return;
      }

      let key = '';
      if (e.altKey) key += 'alt+';
      key += e.key.toLowerCase();

      const callback = shortcuts[key];
      if (callback) {
        e.preventDefault();
        e.stopPropagation();
        callback();
      }
    };

    const root = document.getElementById('pitchlink-sidebar-root');
    const target = root || document;
    target.addEventListener('keydown', handler as EventListener);
    return () => target.removeEventListener('keydown', handler as EventListener);
  }, [shortcuts, enabled]);
}
