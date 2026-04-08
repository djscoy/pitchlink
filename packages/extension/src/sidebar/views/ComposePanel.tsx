import { useState, useEffect } from 'react';
import type { TransactionMode, Template } from '@pitchlink/shared';
import { useModeColors } from '../hooks/useModeColors';
import { api } from '../../utils/api';

interface ComposePanelProps {
  mode: TransactionMode;
  contactEmail: string;
  contactName?: string;
  contactDomain?: string;
  campaignName?: string;
  currentStage?: string;
  threadSubject?: string;
  threadId?: string;
  onClose: () => void;
}

export function ComposePanel({
  mode,
  contactEmail,
  contactName,
  contactDomain,
  campaignName,
  currentStage,
  threadSubject,
  threadId,
  onClose,
}: ComposePanelProps) {
  const [instruction, setInstruction] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateBase, setTemplateBase] = useState<{ subject: string; body: string } | null>(null);

  const modeColors = useModeColors(mode);

  // Load templates for the current mode
  useEffect(() => {
    (async () => {
      try {
        const res = await api.templates.list(mode) as { data: { templates: Template[] } };
        setTemplates(res.data?.templates || []);
      } catch {
        // Non-fatal
      }
    })();
  }, [mode]);

  // When a template is selected, resolve its variables
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setTemplateBase(null);
      return;
    }
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;

    // Client-side variable resolution
    const resolve = (text: string) =>
      text
        .replace(/\{\{contact_name\}\}/g, contactName || contactEmail.split('@')[0])
        .replace(/\{\{contact_email\}\}/g, contactEmail)
        .replace(/\{\{domain\}\}/g, contactDomain || '')
        .replace(/\{\{campaign_name\}\}/g, campaignName || '')
        .replace(/\{\{sender_name\}\}/g, '')
        .replace(/\{\{sender_email\}\}/g, '');

    setTemplateBase({
      subject: resolve(tpl.subject),
      body: resolve(tpl.body_html),
    });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setSaved(false);
    setError(null);
    try {
      const res = await api.compose.generate({
        contactEmail,
        contactName,
        contactDomain,
        campaignName,
        currentStage,
        mode,
        threadSubject,
        instruction: instruction || undefined,
        templateBase: templateBase || undefined,
      }) as { data: { subject: string; body: string } };

      setSubject(res.data.subject || '');
      setBody(res.data.body || '');
      setGenerated(true);
    } catch (err) {
      console.error('[Compose] Generation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate draft');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!subject.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await api.compose.saveDraft({
        toEmail: contactEmail,
        subject,
        body,
        threadId,
      });
      setSaved(true);
    } catch (err) {
      console.error('[Compose] Save draft failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: '8px' }}>
      <div className="pl-card" style={{ borderColor: modeColors.color }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600 }}>
            AI Compose
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              color: 'var(--pl-text-tertiary)',
              padding: '0 2px',
            }}
          >
            &#10005;
          </button>
        </div>

        {/* Context summary */}
        <div style={{
          fontSize: '11px',
          color: 'var(--pl-text-tertiary)',
          marginBottom: '8px',
          padding: '6px 8px',
          backgroundColor: 'var(--pl-bg-secondary)',
          borderRadius: '4px',
        }}>
          To: {contactName || contactEmail}
          {campaignName && <span> &middot; {campaignName}</span>}
          {currentStage && <span> &middot; {currentStage}</span>}
        </div>

        {/* Template picker */}
        {templates.length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '11px',
                border: '1px solid var(--pl-border-secondary)',
                borderRadius: '4px',
                backgroundColor: 'var(--pl-bg-primary)',
                color: 'var(--pl-text-primary)',
              }}
            >
              <option value="">No template (free-form AI)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {templateBase && (
              <div style={{
                fontSize: '10px',
                color: 'var(--pl-success)',
                marginTop: '3px',
                fontWeight: 500,
              }}>
                AI will personalize this template while keeping all key details
              </div>
            )}
          </div>
        )}

        {/* Instruction input */}
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="What should the email say? (optional — leave blank for auto-generated)"
          rows={2}
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
            boxSizing: 'border-box',
          }}
        />

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '12px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '6px',
            backgroundColor: generating ? 'var(--pl-bg-tertiary)' : modeColors.color,
            color: generating ? 'var(--pl-text-tertiary)' : 'var(--pl-text-inverse)',
            cursor: generating ? 'not-allowed' : 'pointer',
            marginBottom: generated ? '10px' : '0',
          }}
        >
          {generating ? 'Generating...' : generated ? 'Regenerate' : 'Generate Draft'}
        </button>

        {/* Error display */}
        {error && (
          <div style={{
            marginTop: '8px',
            padding: '8px',
            fontSize: '12px',
            color: 'var(--pl-error)',
            backgroundColor: 'var(--pl-error-bg, rgba(239, 68, 68, 0.1))',
            borderRadius: '4px',
            border: '1px solid var(--pl-error-border, rgba(239, 68, 68, 0.2))',
          }}>
            {error}
          </div>
        )}

        {/* Generated output */}
        {generated && (
          <>
            {/* Subject */}
            <div style={{ marginBottom: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--pl-text-secondary)', display: 'block', marginBottom: '2px' }}>
                Subject
              </label>
              <input
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setSaved(false); }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '12px',
                  border: '1px solid var(--pl-border-secondary)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--pl-bg-primary)',
                  color: 'var(--pl-text-primary)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Body */}
            <div style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--pl-text-secondary)', display: 'block', marginBottom: '2px' }}>
                Body
              </label>
              <textarea
                value={body}
                onChange={(e) => { setBody(e.target.value); setSaved(false); }}
                rows={6}
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
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Save as Draft */}
            {saved ? (
              <div style={{
                padding: '8px',
                borderRadius: '6px',
                backgroundColor: 'var(--pl-success)',
                color: 'var(--pl-text-inverse)',
                fontSize: '12px',
                fontWeight: 500,
                textAlign: 'center',
              }}>
                Saved to Gmail Drafts
              </div>
            ) : (
              <button
                onClick={handleSaveDraft}
                disabled={saving || !subject.trim() || !body.trim()}
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: `1px solid ${modeColors.color}`,
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  color: saving ? 'var(--pl-text-tertiary)' : modeColors.color,
                  cursor: saving || !subject.trim() || !body.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Save to Gmail Drafts'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
