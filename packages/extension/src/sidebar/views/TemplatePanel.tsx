import { useState, useEffect, useCallback } from 'react';
import type { Template, TransactionMode } from '@pitchlink/shared';
import { MODE_CONFIG } from '@pitchlink/shared';
import { api } from '../../utils/api';
import { ContactCardSkeleton } from '../components/Skeleton';

interface TemplatePanelProps {
  mode: TransactionMode;
  onInsert?: (subject: string, bodyHtml: string) => void;
  contactContext?: {
    contact_name?: string;
    contact_email?: string;
    domain?: string;
    campaign_name?: string;
  };
}

export function TemplatePanel({ mode, onInsert, contactContext }: TemplatePanelProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const modeConfig = MODE_CONFIG[mode];

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.templates.list(mode) as {
        data: { templates: Template[]; total: number };
      };
      setTemplates(result.data.templates);
    } catch (err) {
      console.error('[TemplatePanel] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleDelete = async (id: string) => {
    try {
      await api.templates.delete(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error('[TemplatePanel] Delete failed:', err);
    }
  };

  const handleInsert = async (template: Template) => {
    if (!onInsert) return;

    try {
      if (contactContext) {
        // Resolve variables
        const result = await api.templates.resolve(template.id, contactContext) as {
          data: { subject: string; body_html: string };
        };
        onInsert(result.data.subject, result.data.body_html);
      } else {
        onInsert(template.subject, template.body_html);
      }
    } catch (err) {
      console.error('[TemplatePanel] Insert failed:', err);
      // Fallback: insert without resolving
      onInsert(template.subject, template.body_html);
    }
  };

  if (loading) {
    return (
      <div>
        <ContactCardSkeleton />
        <ContactCardSkeleton />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 600 }}>
          Templates
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '6px',
            backgroundColor: modeConfig.color,
            color: '#FFFFFF',
            cursor: 'pointer',
          }}
        >
          + New
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <TemplateForm
          mode={mode}
          onSaved={() => {
            setShowCreate(false);
            loadTemplates();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Template List */}
      {templates.length === 0 && !showCreate && (
        <div
          style={{
            padding: '20px 16px',
            borderRadius: '8px',
            border: '1px dashed var(--pl-border-secondary)',
            backgroundColor: 'var(--pl-bg-secondary)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--pl-text-secondary)' }}>
            No templates yet
          </div>
          <div style={{ fontSize: '12px', color: 'var(--pl-text-tertiary)', marginTop: '4px' }}>
            Create reusable email templates with variables like {'{{contact_name}}'}.
          </div>
        </div>
      )}

      {templates.map((template) => (
        <div key={template.id}>
          {editingId === template.id ? (
            <TemplateForm
              mode={mode}
              template={template}
              onSaved={() => {
                setEditingId(null);
                loadTemplates();
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <TemplateCard
              template={template}
              onInsert={onInsert ? () => handleInsert(template) : undefined}
              onEdit={() => setEditingId(template.id)}
              onDelete={() => handleDelete(template.id)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// --- Template Card ---

function TemplateCard({
  template,
  onInsert,
  onEdit,
  onDelete,
}: {
  template: Template;
  onInsert?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="pl-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>{template.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--pl-text-secondary)', marginTop: '2px' }}>
            {template.subject}
          </div>
          {template.variables.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '6px' }}>
              {template.variables.map((v) => (
                <span
                  key={v}
                  style={{
                    padding: '1px 5px',
                    fontSize: '9px',
                    borderRadius: '3px',
                    backgroundColor: 'var(--pl-bg-tertiary)',
                    color: 'var(--pl-text-tertiary)',
                    fontFamily: 'monospace',
                  }}
                >
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
          {onInsert && (
            <button
              onClick={onInsert}
              title="Insert into compose"
              style={{
                background: 'none',
                border: '1px solid var(--pl-border-secondary)',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '10px',
                color: 'var(--pl-text-secondary)',
                cursor: 'pointer',
              }}
            >
              Use
            </button>
          )}
          <button
            onClick={onEdit}
            title="Edit"
            style={{
              background: 'none',
              border: 'none',
              padding: '3px 4px',
              fontSize: '11px',
              color: 'var(--pl-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            &#9998;
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            style={{
              background: 'none',
              border: 'none',
              padding: '3px 4px',
              fontSize: '11px',
              color: 'var(--pl-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            &#215;
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Template Form (Create/Edit) ---

function TemplateForm({
  mode,
  template,
  onSaved,
  onCancel,
}: {
  mode: TransactionMode;
  template?: Template;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [subject, setSubject] = useState(template?.subject || '');
  const [bodyHtml, setBodyHtml] = useState(template?.body_html || '');
  const [saving, setSaving] = useState(false);

  const modeConfig = MODE_CONFIG[mode];
  const isEdit = !!template;

  const handleSave = async () => {
    if (!name.trim() || !subject.trim()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await api.templates.update(template.id, { name, subject, body_html: bodyHtml });
      } else {
        await api.templates.create({ name, mode, subject, body_html: bodyHtml });
      }
      onSaved();
    } catch (err) {
      console.error('[TemplateForm] Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pl-card" style={{ borderColor: modeConfig.color, marginBottom: '8px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
        {isEdit ? 'Edit Template' : 'New Template'}
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name"
        autoFocus
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '12px',
          border: '1px solid var(--pl-border-secondary)',
          borderRadius: '4px',
          backgroundColor: 'var(--pl-bg-primary)',
          color: 'var(--pl-text-primary)',
          marginBottom: '6px',
        }}
      />

      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Email subject — use {{contact_name}}, {{domain}}"
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '12px',
          border: '1px solid var(--pl-border-secondary)',
          borderRadius: '4px',
          backgroundColor: 'var(--pl-bg-primary)',
          color: 'var(--pl-text-primary)',
          marginBottom: '6px',
        }}
      />

      <textarea
        value={bodyHtml}
        onChange={(e) => setBodyHtml(e.target.value)}
        placeholder="Email body — variables: {{contact_name}}, {{domain}}, {{campaign_name}}, {{sender_name}}"
        rows={5}
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '12px',
          border: '1px solid var(--pl-border-secondary)',
          borderRadius: '4px',
          backgroundColor: 'var(--pl-bg-primary)',
          color: 'var(--pl-text-primary)',
          resize: 'vertical',
          fontFamily: 'inherit',
          marginBottom: '8px',
        }}
      />

      {/* Variable hints */}
      <div style={{ fontSize: '10px', color: 'var(--pl-text-tertiary)', marginBottom: '8px' }}>
        Variables: {'{{contact_name}}'}, {'{{contact_email}}'}, {'{{domain}}'}, {'{{campaign_name}}'}, {'{{sender_name}}'}
      </div>

      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '5px 12px',
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
          disabled={!name.trim() || !subject.trim() || saving}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '4px',
            backgroundColor: modeConfig.color,
            color: '#FFFFFF',
            cursor: name.trim() && subject.trim() && !saving ? 'pointer' : 'not-allowed',
            opacity: name.trim() && subject.trim() && !saving ? 1 : 0.5,
          }}
        >
          {saving ? 'Saving...' : isEdit ? 'Save' : 'Create'}
        </button>
      </div>
    </div>
  );
}
