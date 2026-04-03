/**
 * SourceRegistryView — Settings panel for managing IIE Source Registry entries.
 *
 * Shows a table of forwarding email → original sender mappings.
 * Users can add, edit, and delete entries.
 */

import { useState, useEffect, useCallback } from 'react';
import type { SourceRegistryEntry } from '@pitchlink/shared';
import { api } from '../../utils/api';

export function SourceRegistryView() {
  const [entries, setEntries] = useState<SourceRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editName, setEditName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForwarding, setNewForwarding] = useState('');
  const [newOriginal, setNewOriginal] = useState('');
  const [newName, setNewName] = useState('');

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const result = (await api.iie.sourceRegistry.list()) as { data: SourceRegistryEntry[] };
      setEntries(result.data || []);
    } catch (err) {
      console.error('[SourceRegistry] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleAdd = async () => {
    if (!newForwarding.trim()) return;
    try {
      await api.iie.sourceRegistry.create({
        forwarding_email: newForwarding.trim(),
        original_sender_email: newOriginal.trim() || undefined,
        original_sender_name: newName.trim() || undefined,
      });
      setShowAddForm(false);
      setNewForwarding('');
      setNewOriginal('');
      setNewName('');
      await loadEntries();
    } catch (err) {
      console.error('[SourceRegistry] Failed to add:', err);
    }
  };

  const handleEdit = async (id: string) => {
    try {
      await api.iie.sourceRegistry.update(id, {
        original_sender_email: editEmail.trim() || undefined,
        original_sender_name: editName.trim() || undefined,
      });
      setEditingId(null);
      await loadEntries();
    } catch (err) {
      console.error('[SourceRegistry] Failed to update:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.iie.sourceRegistry.delete(id);
      await loadEntries();
    } catch (err) {
      console.error('[SourceRegistry] Failed to delete:', err);
    }
  };

  const startEdit = (entry: SourceRegistryEntry) => {
    setEditingId(entry.id);
    setEditEmail(entry.original_sender_email || '');
    setEditName(entry.original_sender_name || '');
  };

  const detectionLabel = (method: string) => {
    const labels: Record<string, string> = {
      header: 'Header',
      body_regex: 'Regex',
      ai: 'AI',
      human: 'Manual',
    };
    return labels[method] || method;
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--pl-text-primary)',
          }}
        >
          Source Registry
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 600,
            border: '1px solid var(--pl-border-secondary)',
            borderRadius: '4px',
            backgroundColor: 'var(--pl-bg-primary)',
            color: 'var(--pl-text-secondary)',
            cursor: 'pointer',
          }}
        >
          {showAddForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      <div
        style={{
          fontSize: '11px',
          color: 'var(--pl-text-tertiary)',
          marginBottom: '12px',
        }}
      >
        Forwarding addresses are remembered so PitchLink can instantly identify the original sender
        on future emails.
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div
          className="pl-card"
          style={{ padding: '10px', marginBottom: '8px' }}
        >
          <input
            type="email"
            value={newForwarding}
            onChange={(e) => setNewForwarding(e.target.value)}
            placeholder="Forwarding email"
            style={inputStyle}
          />
          <input
            type="email"
            value={newOriginal}
            onChange={(e) => setNewOriginal(e.target.value)}
            placeholder="Original sender email"
            style={{ ...inputStyle, marginTop: '4px' }}
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Original sender name"
            style={{ ...inputStyle, marginTop: '4px' }}
          />
          <button
            onClick={handleAdd}
            disabled={!newForwarding.trim()}
            style={{
              marginTop: '8px',
              padding: '5px 12px',
              fontSize: '11px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-accent)',
              color: '#FFFFFF',
              cursor: newForwarding.trim() ? 'pointer' : 'not-allowed',
              opacity: newForwarding.trim() ? 1 : 0.5,
            }}
          >
            Save
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ fontSize: '12px', color: 'var(--pl-text-tertiary)', textAlign: 'center', padding: '20px' }}>
          Loading...
        </div>
      )}

      {/* Empty State */}
      {!loading && entries.length === 0 && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--pl-text-tertiary)',
            textAlign: 'center',
            padding: '20px',
            border: '1px dashed var(--pl-border-secondary)',
            borderRadius: '8px',
          }}
        >
          No forwarding addresses recorded yet. They will appear here automatically when PitchLink
          detects forwarded emails.
        </div>
      )}

      {/* Entries */}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="pl-card"
          style={{ padding: '8px 10px', marginBottom: '6px' }}
        >
          {editingId === entry.id ? (
            <>
              <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', marginBottom: '4px' }}>
                {entry.forwarding_email}
              </div>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Original sender email"
                style={inputStyle}
              />
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Name"
                style={{ ...inputStyle, marginTop: '4px' }}
              />
              <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                <button onClick={() => handleEdit(entry.id)} style={smallBtnStyle}>
                  Save
                </button>
                <button onClick={() => setEditingId(null)} style={smallBtnStyle}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--pl-text-primary)' }}>
                    {entry.forwarding_email}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--pl-text-secondary)', marginTop: '2px' }}>
                    {entry.original_sender_email
                      ? `→ ${entry.original_sender_name ? `${entry.original_sender_name} ` : ''}${entry.original_sender_email}`
                      : '→ (no original sender set)'}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    backgroundColor: 'var(--pl-bg-tertiary)',
                    color: 'var(--pl-text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {detectionLabel(entry.detection_method)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                <button onClick={() => startEdit(entry)} style={smallBtnStyle}>
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  style={{ ...smallBtnStyle, color: '#DC2626' }}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Shared Styles ---

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  fontSize: '12px',
  border: '1px solid var(--pl-border-secondary)',
  borderRadius: '4px',
  backgroundColor: 'var(--pl-bg-primary)',
  color: 'var(--pl-text-primary)',
  boxSizing: 'border-box',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: '10px',
  border: '1px solid var(--pl-border-secondary)',
  borderRadius: '3px',
  backgroundColor: 'var(--pl-bg-primary)',
  color: 'var(--pl-text-secondary)',
  cursor: 'pointer',
};
