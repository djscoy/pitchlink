import type { ToastMessage } from '../hooks/useToast';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

const VARIANT_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  success: {
    bg: 'var(--pl-success-bg, rgba(16, 185, 129, 0.1))',
    color: 'var(--pl-success)',
    border: 'var(--pl-success)',
  },
  error: {
    bg: 'var(--pl-error-bg, rgba(239, 68, 68, 0.1))',
    color: 'var(--pl-error)',
    border: 'var(--pl-error)',
  },
  info: {
    bg: 'var(--pl-info-bg, rgba(37, 99, 235, 0.1))',
    color: 'var(--pl-info)',
    border: 'var(--pl-info)',
  },
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '12px',
        left: '12px',
        right: '12px',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const style = VARIANT_STYLES[toast.variant] || VARIANT_STYLES.info;
        return (
          <div
            key={toast.id}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: style.bg,
              color: style.color,
              borderLeft: `3px solid ${style.border}`,
              fontSize: '12px',
              fontWeight: 500,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pointerEvents: 'auto',
              animation: 'pl-toast-in 0.2s ease-out',
            }}
          >
            <span>{toast.text}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              style={{
                background: 'none',
                border: 'none',
                color: style.color,
                cursor: 'pointer',
                fontSize: '14px',
                padding: '0 0 0 8px',
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
