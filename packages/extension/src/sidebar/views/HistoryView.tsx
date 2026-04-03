import type { TransactionMode } from '@pitchlink/shared';

interface HistoryViewProps {
  mode: TransactionMode;
}

/**
 * History tab — shows deal activity timeline.
 * Stub for Phase 1. Full implementation in Phase 2 after reply detection.
 */
export function HistoryView(_props: HistoryViewProps) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 12px' }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>&#128337;</div>
      <div style={{ fontSize: '13px', color: 'var(--pl-text-secondary)' }}>
        Activity History
      </div>
      <div style={{ fontSize: '12px', color: 'var(--pl-text-tertiary)', marginTop: '4px' }}>
        Stage changes, emails, and interactions will appear here.
      </div>
    </div>
  );
}
