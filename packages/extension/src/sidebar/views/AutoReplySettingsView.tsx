/**
 * AutoReplySettingsView — Settings panel for managing auto-reply rules.
 *
 * Shows current rules, allows creating/editing/toggling rules,
 * and displays the auto-reply queue for visibility.
 */

import { useState, useEffect, useCallback } from 'react';
import type { AutoReplyRule, AutoReplyQueueItem, Template } from '@pitchlink/shared';
import { api } from '../../utils/api';

interface CampaignOption {
  id: string;
  name: string;
}

export function AutoReplySettingsView() {
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [queue, setQueue] = useState<AutoReplyQueueItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState<'rules' | 'queue'>('rules');

  // Create form state
  const [newTemplateId, setNewTemplateId] = useState('');
  const [newCampaignId, setNewCampaignId] = useState('');
  const [newMode, setNewMode] = useState<'draft_hold' | 'auto_send'>('draft_hold');
  const [newDelay, setNewDelay] = useState(10);
  const [newMatchType, setNewMatchType] = useState<'ai_classify' | 'all_new'>('ai_classify');
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, queueRes, templatesRes, campaignsRes] = await Promise.all([
        api.autoReply.listRules() as Promise<{ data: AutoReplyRule[] }>,
        api.autoReply.listQueue() as Promise<{ data: AutoReplyQueueItem[] }>,
        api.templates.list('sell') as Promise<{ data: { templates: Template[] } }>,
        api.campaigns.list({ mode: 'sell', status: 'active' }) as Promise<{ data: { campaigns: CampaignOption[] } }>,
      ]);
      setRules(rulesRes.data || []);
      setQueue(queueRes.data || []);
      setTemplates(templatesRes.data?.templates || []);
      setCampaigns(campaignsRes.data?.campaigns || []);
    } catch (err) {
      console.error('[AutoReplySettings] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!newTemplateId) return;
    setCreating(true);
    try {
      await api.autoReply.createRule({
        template_id: newTemplateId,
        campaign_id: newCampaignId || undefined,
        mode: newMode,
        delay_minutes: newDelay,
        match_type: newMatchType,
      });
      setShowCreate(false);
      setNewTemplateId('');
      setNewCampaignId('');
      loadData();
    } catch (err) {
      console.error('[AutoReplySettings] Create failed:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (rule: AutoReplyRule) => {
    await api.autoReply.updateRule(rule.id, { is_enabled: !rule.is_enabled });
    loadData();
  };

  const handleModeChange = async (rule: AutoReplyRule, mode: string) => {
    await api.autoReply.updateRule(rule.id, { mode });
    loadData();
  };

  const handleDelete = async (id: string) => {
    await api.autoReply.deleteRule(id);
    loadData();
  };

  const handleSkip = async (id: string) => {
    await api.autoReply.skipQueueItem(id);
    loadData();
  };

  if (loading) {
    return (
      <div style={{ padding: '8px 0', fontSize: '12px', color: 'var(--pl-text-secondary)' }}>
        Loading auto-reply settings...
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
        Auto-Reply
      </div>
      <div style={{ fontSize: '11px', color: 'var(--pl-text-secondary)', marginBottom: '10px' }}>
        Automatically reply to inbound guest post inquiries with your pricing template.
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        {(['rules', 'queue'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            style={{
              flex: 1,
              padding: '5px',
              fontSize: '11px',
              fontWeight: viewMode === v ? 600 : 400,
              border: viewMode === v ? '1px solid #059669' : '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: viewMode === v ? '#059669' : 'transparent',
              color: viewMode === v ? '#fff' : 'var(--pl-text-secondary)',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {v === 'rules' ? `Rules (${rules.length})` : `Queue (${queue.filter(q => q.status === 'pending').length})`}
          </button>
        ))}
      </div>

      {viewMode === 'rules' && (
        <div>
          {/* Create button */}
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={{
              width: '100%',
              padding: '6px',
              fontSize: '11px',
              fontWeight: 600,
              border: '1px dashed #059669',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: '#059669',
              cursor: 'pointer',
              marginBottom: '8px',
            }}
          >
            {showCreate ? 'Cancel' : '+ New Auto-Reply Rule'}
          </button>

          {/* Create form */}
          {showCreate && (
            <div className="pl-card" style={{ marginBottom: '8px', borderColor: '#059669' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', marginBottom: '6px' }}>
                Template
              </div>
              <select
                value={newTemplateId}
                onChange={(e) => setNewTemplateId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: '11px',
                  border: '1px solid var(--pl-border-secondary)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--pl-bg-primary)',
                  color: 'var(--pl-text-primary)',
                  marginBottom: '6px',
                }}
              >
                <option value="">Select template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', marginBottom: '4px' }}>
                Assign to campaign
              </div>
              <select
                value={newCampaignId}
                onChange={(e) => setNewCampaignId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: '11px',
                  border: '1px solid var(--pl-border-secondary)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--pl-bg-primary)',
                  color: 'var(--pl-text-primary)',
                  marginBottom: '6px',
                }}
              >
                <option value="">(none)</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', marginBottom: '4px' }}>
                    Mode
                  </div>
                  <select
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as 'draft_hold' | 'auto_send')}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '11px',
                      border: '1px solid var(--pl-border-secondary)',
                      borderRadius: '4px',
                      backgroundColor: 'var(--pl-bg-primary)',
                      color: 'var(--pl-text-primary)',
                    }}
                  >
                    <option value="draft_hold">Hold as Draft</option>
                    <option value="auto_send">Auto-Send</option>
                  </select>
                </div>
                <div style={{ width: '80px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', marginBottom: '4px' }}>
                    Delay (min)
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={newDelay}
                    onChange={(e) => setNewDelay(parseInt(e.target.value) || 10)}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      fontSize: '11px',
                      border: '1px solid var(--pl-border-secondary)',
                      borderRadius: '4px',
                      backgroundColor: 'var(--pl-bg-primary)',
                      color: 'var(--pl-text-primary)',
                      textAlign: 'center',
                    }}
                  />
                </div>
              </div>

              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', marginBottom: '4px' }}>
                Detection
              </div>
              <select
                value={newMatchType}
                onChange={(e) => setNewMatchType(e.target.value as 'ai_classify' | 'all_new')}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: '11px',
                  border: '1px solid var(--pl-border-secondary)',
                  borderRadius: '4px',
                  backgroundColor: 'var(--pl-bg-primary)',
                  color: 'var(--pl-text-primary)',
                  marginBottom: '8px',
                }}
              >
                <option value="ai_classify">AI classify (smart — only guest post inquiries)</option>
                <option value="all_new">All new inbound (reply to everything)</option>
              </select>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleCreate}
                  disabled={!newTemplateId || creating}
                  style={{
                    padding: '5px 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: newTemplateId && !creating ? '#059669' : 'var(--pl-bg-tertiary)',
                    color: newTemplateId && !creating ? '#fff' : 'var(--pl-text-tertiary)',
                    cursor: newTemplateId && !creating ? 'pointer' : 'not-allowed',
                  }}
                >
                  {creating ? 'Creating...' : 'Create Rule'}
                </button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {rules.length === 0 && !showCreate && (
            <div style={{ textAlign: 'center', padding: '12px', fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>
              No auto-reply rules. Create one to start auto-replying to inquiries.
            </div>
          )}

          {rules.map((rule) => (
            <div key={rule.id} className="pl-card" style={{ marginBottom: '6px', padding: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: 500 }}>
                  {rule.template?.name || 'Unknown template'}
                </div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <button
                    onClick={() => handleToggle(rule)}
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: rule.is_enabled ? '#059669' : 'var(--pl-bg-tertiary)',
                      color: rule.is_enabled ? '#fff' : 'var(--pl-text-tertiary)',
                      cursor: 'pointer',
                    }}
                  >
                    {rule.is_enabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
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
                </div>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--pl-text-tertiary)' }}>
                {rule.mode === 'auto_send' ? 'Auto-send' : 'Draft hold'} &middot; {rule.delay_minutes}m delay &middot; {rule.match_type === 'ai_classify' ? 'AI detect' : 'All new'}
              </div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                <button
                  onClick={() => handleModeChange(rule, rule.mode === 'auto_send' ? 'draft_hold' : 'auto_send')}
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    border: '1px solid var(--pl-border-secondary)',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    color: 'var(--pl-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Switch to {rule.mode === 'auto_send' ? 'Draft Hold' : 'Auto-Send'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'queue' && (
        <div>
          {queue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '12px', fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>
              No auto-reply queue items yet.
            </div>
          ) : (
            queue.slice(0, 20).map((item) => (
              <div key={item.id} className="pl-card" style={{ marginBottom: '4px', padding: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 500 }}>
                      {item.sender_name || item.sender_email}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--pl-text-tertiary)' }}>
                      {item.sender_email} &middot; {item.classification || ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{
                      fontSize: '9px',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      fontWeight: 600,
                      backgroundColor:
                        item.status === 'pending' ? '#F59E0B' :
                        item.status === 'sent' ? '#059669' :
                        item.status === 'drafted' ? '#2563EB' :
                        item.status === 'skipped' ? 'var(--pl-bg-tertiary)' :
                        '#EF4444',
                      color: item.status === 'skipped' ? 'var(--pl-text-tertiary)' : '#fff',
                    }}>
                      {item.status}
                    </span>
                    {item.status === 'pending' && (
                      <button
                        onClick={() => handleSkip(item.id)}
                        style={{
                          fontSize: '10px',
                          padding: '1px 5px',
                          border: '1px solid var(--pl-border-secondary)',
                          borderRadius: '3px',
                          backgroundColor: 'transparent',
                          color: 'var(--pl-text-tertiary)',
                          cursor: 'pointer',
                        }}
                      >
                        Skip
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
