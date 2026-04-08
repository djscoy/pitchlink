/**
 * MyEmailsView — Settings panel for managing the user's own email addresses.
 *
 * These addresses are filtered out when identifying external contacts in threads.
 * Users can add, remove, and bulk-paste their email addresses.
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';

interface MyEmailsViewProps {
  onEmailsChanged?: () => void;
}

export function MyEmailsView({ onEmailsChanged }: MyEmailsViewProps = {}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [filter, setFilter] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadEmails = useCallback(async () => {
    setLoading(true);
    try {
      const result = (await api.auth.getOwnedEmails()) as { data: { owned_emails: string[] } };
      setEmails(result.data?.owned_emails || []);
    } catch (err) {
      console.error('[MyEmails] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  const saveEmails = async (updated: string[]) => {
    setSaving(true);
    try {
      const result = (await api.auth.saveOwnedEmails(updated)) as { data: { owned_emails: string[] } };
      setEmails(result.data?.owned_emails || updated);
      setStatusMessage(`Saved ${updated.length} email(s)`);
      setTimeout(() => setStatusMessage(null), 2000);
      onEmailsChanged?.();
    } catch (err) {
      console.error('[MyEmails] Failed to save:', err);
      setStatusMessage('Failed to save');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSingle = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return;
    if (emails.includes(trimmed)) {
      setStatusMessage('Already in list');
      setTimeout(() => setStatusMessage(null), 2000);
      return;
    }
    const updated = [...emails, trimmed];
    setNewEmail('');
    await saveEmails(updated);
  };

  const handleBulkAdd = async () => {
    const newEmails = bulkText
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@') && !emails.includes(e));

    if (newEmails.length === 0) {
      setStatusMessage('No new emails to add');
      setTimeout(() => setStatusMessage(null), 2000);
      return;
    }

    const updated = [...emails, ...newEmails];
    setBulkText('');
    setShowBulkAdd(false);
    await saveEmails(updated);
  };

  const handleRemove = async (email: string) => {
    const updated = emails.filter((e) => e !== email);
    await saveEmails(updated);
  };

  const filtered = filter
    ? emails.filter((e) => e.toLowerCase().includes(filter.toLowerCase()))
    : emails;

  if (loading) {
    return (
      <div style={{ padding: '8px 0', fontSize: '12px', color: 'var(--pl-text-secondary)' }}>
        Loading email addresses...
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
        My Email Addresses
      </div>
      <div style={{ fontSize: '11px', color: 'var(--pl-text-secondary)', marginBottom: '10px' }}>
        Addresses you own or manage. These are filtered out when identifying contacts in threads.
      </div>

      {/* Status message */}
      {statusMessage && (
        <div
          style={{
            fontSize: '11px',
            color: statusMessage.includes('Failed') ? 'var(--pl-error)' : 'var(--pl-success)',
            marginBottom: '6px',
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* Add single email */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        <input
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddSingle()}
          placeholder="Add email address..."
          style={{
            flex: 1,
            fontSize: '11px',
            padding: '4px 6px',
            border: '1px solid var(--pl-border-secondary)',
            borderRadius: '4px',
            backgroundColor: 'var(--pl-bg-primary)',
            color: 'var(--pl-text-primary)',
          }}
        />
        <button
          onClick={handleAddSingle}
          disabled={saving}
          style={{
            fontSize: '11px',
            padding: '4px 8px',
            border: '1px solid var(--pl-border-secondary)',
            borderRadius: '4px',
            backgroundColor: 'var(--pl-bg-secondary)',
            color: 'var(--pl-text-primary)',
            cursor: 'pointer',
          }}
        >
          Add
        </button>
      </div>

      {/* Bulk add toggle */}
      <button
        onClick={() => setShowBulkAdd(!showBulkAdd)}
        style={{
          fontSize: '11px',
          color: 'var(--pl-text-tertiary)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0',
          marginBottom: '6px',
          textDecoration: 'underline',
        }}
      >
        {showBulkAdd ? 'Cancel bulk add' : 'Bulk add (paste list)'}
      </button>

      {showBulkAdd && (
        <div style={{ marginBottom: '8px' }}>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="Paste emails, one per line or comma-separated..."
            rows={5}
            style={{
              width: '100%',
              fontSize: '11px',
              padding: '6px',
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-bg-primary)',
              color: 'var(--pl-text-primary)',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleBulkAdd}
            disabled={saving || !bulkText.trim()}
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              marginTop: '4px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-info)',
              color: 'var(--pl-text-inverse)',
              cursor: 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Add All'}
          </button>
        </div>
      )}

      {/* Filter / count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>
          {emails.length} address{emails.length !== 1 ? 'es' : ''}
          {filter && ` (${filtered.length} shown)`}
        </span>
        {emails.length > 10 && (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter..."
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-bg-primary)',
              color: 'var(--pl-text-primary)',
              width: '120px',
            }}
          />
        )}
      </div>

      {/* Email list */}
      <div
        style={{
          maxHeight: '300px',
          overflowY: 'auto',
          border: '1px solid var(--pl-border-secondary)',
          borderRadius: '4px',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '12px', fontSize: '11px', color: 'var(--pl-text-tertiary)', textAlign: 'center' }}>
            {emails.length === 0 ? 'No email addresses added yet.' : 'No matches.'}
          </div>
        ) : (
          filtered.map((email) => (
            <div
              key={email}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                fontSize: '11px',
                borderBottom: '1px solid var(--pl-border-secondary)',
              }}
            >
              <span style={{ color: 'var(--pl-text-primary)', wordBreak: 'break-all' }}>{email}</span>
              <button
                onClick={() => handleRemove(email)}
                disabled={saving}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--pl-text-tertiary)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  padding: '0 2px',
                  flexShrink: 0,
                  marginLeft: '4px',
                }}
                title="Remove"
              >
                x
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
