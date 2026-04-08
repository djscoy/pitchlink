interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '6px',
        border: `1px solid ${danger ? 'var(--pl-error)' : 'var(--pl-border-secondary)'}`,
        backgroundColor: danger ? 'var(--pl-error-bg, rgba(239, 68, 68, 0.05))' : 'var(--pl-bg-secondary)',
        marginBottom: '6px',
      }}
    >
      <div style={{ fontSize: '12px', color: 'var(--pl-text-primary)', marginBottom: '8px' }}>
        {message}
      </div>
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          className="pl-btn pl-btn-sm pl-btn-secondary"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={`pl-btn pl-btn-sm ${danger ? 'pl-btn-danger' : 'pl-btn-primary'}`}
          style={danger ? { backgroundColor: 'var(--pl-error)', color: 'var(--pl-text-inverse)', border: 'none' } : undefined}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
