/**
 * ForwardPrompt — Layer 4 Human Confirmation UI
 *
 * Shown in the sidebar when IIE detects a possible forward
 * but couldn't resolve the original sender with high confidence.
 */

import { useState } from 'react';

interface ForwardPromptProps {
  senderEmail: string;
  bestGuess?: string;
  bestGuessName?: string;
  onConfirm: (email: string, name?: string) => void;
  onNotForward: () => void;
}

export function ForwardPrompt({
  senderEmail,
  bestGuess,
  bestGuessName,
  onConfirm,
  onNotForward,
}: ForwardPromptProps) {
  const [email, setEmail] = useState(bestGuess || '');
  const [name, setName] = useState(bestGuessName || '');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(email.trim(), name.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNotForward = async () => {
    setSubmitting(true);
    try {
      await onNotForward();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid var(--pl-border-secondary)',
        borderLeft: '3px solid #D97706',
        backgroundColor: 'var(--pl-bg-secondary)',
        marginBottom: '8px',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: '#D97706',
          marginBottom: '6px',
        }}
      >
        Forwarded Email Detected
      </div>

      <div
        style={{
          fontSize: '12px',
          color: 'var(--pl-text-secondary)',
          marginBottom: '10px',
        }}
      >
        This looks like a forwarded email from <strong>{senderEmail}</strong>.
        Who is the original sender?
      </div>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Original sender email"
        disabled={submitting}
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '12px',
          border: '1px solid var(--pl-border-secondary)',
          borderRadius: '4px',
          backgroundColor: 'var(--pl-bg-primary)',
          color: 'var(--pl-text-primary)',
          marginBottom: '6px',
          boxSizing: 'border-box',
        }}
      />

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (optional)"
        disabled={submitting}
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '12px',
          border: '1px solid var(--pl-border-secondary)',
          borderRadius: '4px',
          backgroundColor: 'var(--pl-bg-primary)',
          color: 'var(--pl-text-primary)',
          marginBottom: '10px',
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={handleConfirm}
          disabled={!email.trim() || submitting}
          style={{
            flex: 1,
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#D97706',
            color: '#FFFFFF',
            cursor: email.trim() && !submitting ? 'pointer' : 'not-allowed',
            opacity: !email.trim() || submitting ? 0.5 : 1,
          }}
        >
          Confirm
        </button>
        <button
          onClick={handleNotForward}
          disabled={submitting}
          style={{
            flex: 1,
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 500,
            border: '1px solid var(--pl-border-secondary)',
            borderRadius: '4px',
            backgroundColor: 'var(--pl-bg-primary)',
            color: 'var(--pl-text-secondary)',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.5 : 1,
          }}
        >
          Not a Forward
        </button>
      </div>
    </div>
  );
}
