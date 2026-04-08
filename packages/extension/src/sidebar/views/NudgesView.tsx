import { useState, useEffect, useCallback } from 'react';
import type { TransactionMode, Sequence, SequenceStep, Template } from '@pitchlink/shared';

import { useModeColors } from '../hooks/useModeColors';
import { api } from '../../utils/api';
import { Skeleton } from '../components/Skeleton';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface NudgesViewProps {
  mode: TransactionMode;
}

interface QueueItem {
  id: string;
  current_step: number;
  status: string;
  pause_reason?: string;
  next_fire_at?: string;
  sequence: { id: string; name: string; steps_json: SequenceStep[] };
  deal: {
    id: string;
    contact: { id: string; email: string; name?: string; domain?: string };
    campaign: { id: string; name: string };
  };
}

type ViewMode = 'queue' | 'sequences' | 'create';

export function NudgesView({ mode }: NudgesViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('queue');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);

  const modeColors = useModeColors(mode);

  const loadQueue = useCallback(async () => {
    try {
      const res = await api.sequences.queue({ mode, limit: 50 }) as { data: QueueItem[] | { enrollments?: QueueItem[] } };
      const queueData = Array.isArray(res.data) ? res.data : (res.data as { enrollments?: QueueItem[] })?.enrollments || [];
      setQueue(queueData);
    } catch (err) {
      console.error('[NudgesView] Failed to load queue:', err);
    }
  }, [mode]);

  const loadSequences = useCallback(async () => {
    try {
      const res = await api.sequences.list({ mode }) as { data: { sequences: Sequence[] } | Sequence[] };
      const seqData = Array.isArray(res.data) ? res.data : (res.data as { sequences: Sequence[] })?.sequences || [];
      setSequences(seqData);
    } catch (err) {
      console.error('[NudgesView] Failed to load sequences:', err);
    }
  }, [mode]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadQueue(), loadSequences()]).finally(() => setLoading(false));
  }, [loadQueue, loadSequences]);

  const handlePause = async (enrollmentId: string) => {
    await api.sequences.pauseEnrollment(enrollmentId);
    loadQueue();
  };

  const handleResume = async (enrollmentId: string) => {
    await api.sequences.resumeEnrollment(enrollmentId);
    loadQueue();
  };

  const handleCancel = async (enrollmentId: string) => {
    await api.sequences.cancelEnrollment(enrollmentId);
    loadQueue();
  };

  if (loading) {
    return (
      <div>
        <Skeleton width="60%" height="16px" />
        <Skeleton width="100%" height="60px" style={{ marginTop: '12px' }} />
        <Skeleton width="100%" height="60px" style={{ marginTop: '8px' }} />
      </div>
    );
  }

  return (
    <div>
      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        {(['queue', 'sequences'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            style={{
              flex: 1,
              padding: '6px',
              fontSize: '11px',
              fontWeight: viewMode === v ? 600 : 400,
              border: viewMode === v ? `1px solid ${modeColors.color}` : '1px solid var(--pl-border-secondary)',
              borderRadius: '6px',
              backgroundColor: viewMode === v ? modeColors.color : 'transparent',
              color: viewMode === v ? 'var(--pl-text-inverse)' : 'var(--pl-text-secondary)',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {v === 'queue' ? `Queue (${queue.length})` : `Sequences (${sequences.length})`}
          </button>
        ))}
      </div>

      {viewMode === 'queue' && <QueueView queue={queue} modeColors={modeColors} onPause={handlePause} onResume={handleResume} onCancel={handleCancel} />}
      {viewMode === 'sequences' && <SequencesList sequences={sequences} mode={mode} modeColors={modeColors} onCreated={() => loadSequences()} onDeleted={() => loadSequences()} />}
    </div>
  );
}

// --- Queue View ---

function QueueView({
  queue,
  modeColors,
  onPause,
  onResume,
  onCancel,
}: {
  queue: QueueItem[];
  modeColors: { color: string; bgColor: string };
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (queue.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--pl-text-secondary)' }}>
          No pending nudges
        </div>
        <div style={{ fontSize: '12px', color: 'var(--pl-text-tertiary)', marginTop: '4px' }}>
          Enroll deals in sequences from the contact panel.
        </div>
      </div>
    );
  }

  return (
    <div>
      {queue.map((item) => {
        const steps = item.sequence.steps_json || [];
        const isPaused = item.status === 'paused';
        const nextFireDate = item.next_fire_at ? new Date(item.next_fire_at) : null;

        return (
          <div key={item.id} className="pl-card" style={{ marginBottom: '6px', padding: '10px' }}>
            {/* Contact + Sequence */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 500 }}>
                  {item.deal.contact.name || item.deal.contact.email}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>
                  {item.sequence.name} &middot; Step {item.current_step + 1}/{steps.length}
                </div>
              </div>
              {isPaused ? (
                <span style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--pl-warning, #F59E0B)',
                  color: 'var(--pl-text-inverse)',
                  fontWeight: 500,
                }}>
                  Paused
                </span>
              ) : (
                <span style={{
                  fontSize: '10px',
                  color: 'var(--pl-text-tertiary)',
                }}>
                  {nextFireDate ? formatRelativeDate(nextFireDate) : ''}
                </span>
              )}
            </div>

            {/* Pause reason */}
            {isPaused && item.pause_reason && (
              <div style={{ fontSize: '10px', color: 'var(--pl-text-tertiary)', marginTop: '4px' }}>
                Reason: {item.pause_reason === 'reply_received' ? 'Contact replied' : item.pause_reason}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
              {isPaused ? (
                <button
                  onClick={() => onResume(item.id)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '10px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: modeColors.color,
                    color: 'var(--pl-text-inverse)',
                    cursor: 'pointer',
                  }}
                >
                  Resume
                </button>
              ) : (
                <button
                  onClick={() => onPause(item.id)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '10px',
                    border: '1px solid var(--pl-border-secondary)',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    color: 'var(--pl-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Pause
                </button>
              )}
              <button
                onClick={() => onCancel(item.id)}
                style={{
                  padding: '3px 8px',
                  fontSize: '10px',
                  border: '1px solid var(--pl-border-secondary)',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  color: 'var(--pl-text-tertiary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Sequences List + Create ---

function SequencesList({
  sequences,
  mode,
  modeColors,
  onCreated,
  onDeleted,
}: {
  sequences: Sequence[];
  mode: TransactionMode;
  modeColors: { color: string; bgColor: string };
  onCreated: () => void;
  onDeleted: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  return (
    <div>
      {/* Delete confirmation */}
      {deletingId && (
        <ConfirmDialog
          message={`Delete sequence "${sequences.find(s => s.id === deletingId)?.name || ''}"?`}
          onConfirm={async () => {
            try {
              await api.sequences.delete(deletingId);
              setDeletingId(null);
              onDeleted();
            } catch (err) {
              console.error('[NudgesView] Delete failed:', err);
              setDeletingId(null);
            }
          }}
          onCancel={() => setDeletingId(null)}
        />
      )}
      <button
        onClick={() => { setShowCreate(!showCreate); setEditingId(null); }}
        style={{
          width: '100%',
          padding: '8px',
          fontSize: '12px',
          fontWeight: 600,
          border: `1px dashed ${modeColors.color}`,
          borderRadius: '6px',
          backgroundColor: 'transparent',
          color: modeColors.color,
          cursor: 'pointer',
          marginBottom: '8px',
        }}
      >
        {showCreate ? 'Cancel' : '+ Create Sequence'}
      </button>

      {showCreate && (
        <CreateSequenceForm
          mode={mode}
          modeColors={modeColors}
          onCreated={() => { setShowCreate(false); onCreated(); }}
        />
      )}

      {sequences.length === 0 && !showCreate && (
        <div style={{ textAlign: 'center', padding: '16px', fontSize: '12px', color: 'var(--pl-text-tertiary)' }}>
          No sequences yet. Create one to start automating follow-ups.
        </div>
      )}

      {sequences.map((seq) => {
        const steps = (seq.steps_json || []) as SequenceStep[];

        if (editingId === seq.id) {
          return (
            <EditSequenceForm
              key={seq.id}
              sequence={seq}
              mode={mode}
              modeColors={modeColors}
              onSaved={() => { setEditingId(null); onCreated(); }}
              onCancel={() => setEditingId(null)}
            />
          );
        }

        return (
          <div key={seq.id} className="pl-card" style={{ marginBottom: '6px', padding: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 500 }}>{seq.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>
                  {steps.length} step{steps.length !== 1 ? 's' : ''} &middot;{' '}
                  {steps.map((s) => `${s.delay_days}d`).join(' → ')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => { setEditingId(seq.id); setShowCreate(false); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '11px',
                    color: modeColors.color,
                    cursor: 'pointer',
                    padding: '2px 4px',
                  }}
                  title="Edit sequence"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeletingId(seq.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '12px',
                    color: 'var(--pl-text-tertiary)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                  }}
                  title="Delete sequence"
                  aria-label="Delete sequence"
                >
                  &#10005;
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Edit Sequence Form ---

function EditSequenceForm({
  sequence,
  mode,
  modeColors,
  onSaved,
  onCancel,
}: {
  sequence: Sequence;
  mode: TransactionMode;
  modeColors: { color: string; bgColor: string };
  onSaved: () => void;
  onCancel: () => void;
}) {
  const existingSteps = (sequence.steps_json || []) as SequenceStep[];
  const [name, setName] = useState(sequence.name);
  const [steps, setSteps] = useState<{ delay_days: number; use_ai_generate: boolean; template_id?: string }[]>(
    existingSteps.map((s) => ({ delay_days: s.delay_days, use_ai_generate: s.use_ai_generate ?? true, template_id: s.template_id })),
  );
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.templates.list(mode) as { data: { templates: Template[] } | Template[] };
        const tplData = Array.isArray(res.data) ? res.data : (res.data as { templates: Template[] })?.templates || [];
        setTemplates(tplData);
      } catch { /* non-fatal */ }
    })();
  }, [mode]);

  const addStep = () => {
    setSteps([...steps, { delay_days: 5, use_ai_generate: true }]);
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, delay: number) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, delay_days: delay } : s));
  };

  const updateStepTemplate = (idx: number, templateId: string) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, template_id: templateId || undefined, use_ai_generate: !templateId } : s));
  };

  const handleSave = async () => {
    if (!name.trim() || steps.length === 0) return;
    setSaving(true);
    try {
      const stepsJson: SequenceStep[] = steps.map((s, i) => ({
        id: `step-${i + 1}`,
        position: i,
        delay_days: s.delay_days,
        use_ai_generate: s.use_ai_generate,
        template_id: s.template_id,
      }));
      await api.sequences.update(sequence.id, { name: name.trim(), steps_json: stepsJson });
      onSaved();
    } catch (err) {
      console.error('[NudgesView] Update failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pl-card" style={{ marginBottom: '8px', borderColor: modeColors.color }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Sequence name..."
        autoFocus
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '13px',
          border: '1px solid var(--pl-border-secondary)',
          borderRadius: '4px',
          backgroundColor: 'var(--pl-bg-primary)',
          color: 'var(--pl-text-primary)',
          marginBottom: '8px',
          boxSizing: 'border-box',
        }}
      />

      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', marginBottom: '6px' }}>
        Steps
      </div>

      {steps.map((step, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', width: '50px' }}>
            Step {idx + 1}:
          </span>
          <input
            type="number"
            min={1}
            max={30}
            value={step.delay_days}
            onChange={(e) => updateStep(idx, parseInt(e.target.value) || 1)}
            style={{
              width: '50px',
              padding: '3px 6px',
              fontSize: '12px',
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-bg-primary)',
              color: 'var(--pl-text-primary)',
              textAlign: 'center',
            }}
          />
          <span style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>days</span>
          {steps.length > 1 && (
            <button
              onClick={() => removeStep(idx)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '12px',
                color: 'var(--pl-text-tertiary)',
                cursor: 'pointer',
                padding: '0 2px',
              }}
            >
              &#10005;
            </button>
          )}
          <select
            value={step.template_id || ''}
            onChange={(e) => updateStepTemplate(idx, e.target.value)}
            style={{
              width: '100%',
              marginLeft: '50px',
              padding: '3px 4px',
              fontSize: '11px',
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-bg-primary)',
              color: 'var(--pl-text-primary)',
            }}
          >
            <option value="">AI Generate</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      ))}

      {steps.length < 5 && (
        <button
          onClick={addStep}
          style={{
            fontSize: '11px',
            color: modeColors.color,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0',
          }}
        >
          + Add step
        </button>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '8px' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            border: '1px solid var(--pl-border-secondary)',
            borderRadius: '4px',
            backgroundColor: 'transparent',
            color: 'var(--pl-text-secondary)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || steps.length === 0 || saving}
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '4px',
            backgroundColor: name.trim() && !saving ? modeColors.color : 'var(--pl-bg-tertiary)',
            color: name.trim() && !saving ? 'var(--pl-text-inverse)' : 'var(--pl-text-tertiary)',
            cursor: name.trim() && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// --- Create Sequence Form ---

function CreateSequenceForm({
  mode,
  modeColors,
  onCreated,
}: {
  mode: TransactionMode;
  modeColors: { color: string; bgColor: string };
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<{ delay_days: number; use_ai_generate: boolean; template_id?: string }[]>([
    { delay_days: 3, use_ai_generate: true },
  ]);
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.templates.list(mode) as { data: { templates: Template[] } | Template[] };
        const tplData = Array.isArray(res.data) ? res.data : (res.data as { templates: Template[] })?.templates || [];
        setTemplates(tplData);
      } catch { /* non-fatal */ }
    })();
  }, [mode]);

  const addStep = () => {
    setSteps([...steps, { delay_days: 5, use_ai_generate: true }]);
  };

  const removeStep = (idx: number) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, delay: number) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, delay_days: delay } : s));
  };

  const updateStepTemplate = (idx: number, templateId: string) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, template_id: templateId || undefined, use_ai_generate: !templateId } : s));
  };

  const handleCreate = async () => {
    if (!name.trim() || steps.length === 0) return;
    setCreating(true);
    try {
      const stepsJson: SequenceStep[] = steps.map((s, i) => ({
        id: `step-${i + 1}`,
        position: i,
        delay_days: s.delay_days,
        use_ai_generate: s.use_ai_generate,
        template_id: s.template_id,
      }));

      await api.sequences.create({ name: name.trim(), mode, steps_json: stepsJson });
      onCreated();
    } catch (err) {
      console.error('[NudgesView] Create failed:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="pl-card" style={{ marginBottom: '8px', borderColor: modeColors.color }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Sequence name..."
        autoFocus
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '13px',
          border: '1px solid var(--pl-border-secondary)',
          borderRadius: '4px',
          backgroundColor: 'var(--pl-bg-primary)',
          color: 'var(--pl-text-primary)',
          marginBottom: '8px',
          boxSizing: 'border-box',
        }}
      />

      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', marginBottom: '6px' }}>
        Steps
      </div>

      {steps.map((step, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', width: '50px' }}>
            Step {idx + 1}:
          </span>
          <input
            type="number"
            min={1}
            max={30}
            value={step.delay_days}
            onChange={(e) => updateStep(idx, parseInt(e.target.value) || 1)}
            style={{
              width: '50px',
              padding: '3px 6px',
              fontSize: '12px',
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-bg-primary)',
              color: 'var(--pl-text-primary)',
              textAlign: 'center',
            }}
          />
          <span style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>days</span>
          {steps.length > 1 && (
            <button
              onClick={() => removeStep(idx)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '12px',
                color: 'var(--pl-text-tertiary)',
                cursor: 'pointer',
                padding: '0 2px',
              }}
            >
              &#10005;
            </button>
          )}
          <select
            value={step.template_id || ''}
            onChange={(e) => updateStepTemplate(idx, e.target.value)}
            style={{
              width: '100%',
              marginLeft: '50px',
              padding: '3px 4px',
              fontSize: '11px',
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-bg-primary)',
              color: 'var(--pl-text-primary)',
            }}
          >
            <option value="">AI Generate</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      ))}

      {steps.length < 5 && (
        <button
          onClick={addStep}
          style={{
            fontSize: '11px',
            color: modeColors.color,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 0',
          }}
        >
          + Add step
        </button>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || steps.length === 0 || creating}
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '4px',
            backgroundColor: name.trim() && !creating ? modeColors.color : 'var(--pl-bg-tertiary)',
            color: name.trim() && !creating ? 'var(--pl-text-inverse)' : 'var(--pl-text-tertiary)',
            cursor: name.trim() && !creating ? 'pointer' : 'not-allowed',
          }}
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}

// --- Helpers ---

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours < 0) return 'Overdue';
  if (diffHours < 1) return 'Soon';
  if (diffHours < 24) return `in ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  return `in ${diffDays}d`;
}
