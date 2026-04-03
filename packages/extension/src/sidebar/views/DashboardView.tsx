import { useState, useEffect, useCallback } from 'react';
import type { TransactionMode, PipelinePreset } from '@pitchlink/shared';
import { MODE_CONFIG } from '@pitchlink/shared';
import { api } from '../../utils/api';
import { CampaignCardSkeleton } from '../components/Skeleton';

interface DashboardViewProps {
  mode: TransactionMode;
  onNavigateToCampaign: (campaignId: string) => void;
}

interface CampaignListItem {
  id: string;
  name: string;
  mode: string;
  status: string;
  pipeline_preset: PipelinePreset;
  created_at: string;
}

export function DashboardView({ mode, onNavigateToCampaign }: DashboardViewProps) {
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.campaigns.list({ mode }) as {
        data: { campaigns: CampaignListItem[]; total: number };
      };
      setCampaigns(result.data.campaigns);
    } catch (err) {
      console.error('[Dashboard] Failed to load campaigns:', err);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const modeConfig = MODE_CONFIG[mode];

  if (loading) {
    return (
      <div>
        <CampaignCardSkeleton />
        <CampaignCardSkeleton />
        <CampaignCardSkeleton />
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
          {modeConfig.emoji} {modeConfig.label} Campaigns
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
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

      {/* Create Campaign Form */}
      {showCreateForm && (
        <CreateCampaignForm
          mode={mode}
          onCreated={() => {
            setShowCreateForm(false);
            loadCampaigns();
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Campaign List */}
      {campaigns.length === 0 && !showCreateForm && (
        <div
          style={{
            padding: '24px 16px',
            borderRadius: '8px',
            border: '1px dashed var(--pl-border-secondary)',
            backgroundColor: 'var(--pl-bg-secondary)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>{modeConfig.emoji}</div>
          <div style={{ fontSize: '13px', color: 'var(--pl-text-secondary)' }}>
            No {modeConfig.label.toLowerCase()} campaigns yet
          </div>
          <div style={{ fontSize: '12px', color: 'var(--pl-text-tertiary)', marginTop: '4px' }}>
            Create your first campaign to start tracking contacts.
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              backgroundColor: modeConfig.color,
              color: '#FFFFFF',
              cursor: 'pointer',
            }}
          >
            Create Campaign
          </button>
        </div>
      )}

      {campaigns.map((campaign) => (
        <div
          key={campaign.id}
          className="pl-card"
          onClick={() => onNavigateToCampaign(campaign.id)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>{campaign.name}</div>
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: campaign.status === 'active' ? 'var(--pl-success)' : 'var(--pl-bg-tertiary)',
                color: campaign.status === 'active' ? '#FFFFFF' : 'var(--pl-text-tertiary)',
                fontWeight: 500,
              }}
            >
              {campaign.status}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', marginTop: '4px' }}>
            {campaign.pipeline_preset?.name || 'Custom pipeline'} &middot;{' '}
            {new Date(campaign.created_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Create Campaign Form ---

function CreateCampaignForm({
  mode,
  onCreated,
  onCancel,
}: {
  mode: TransactionMode;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [presets, setPresets] = useState<PipelinePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const result = await api.presets.list(mode) as { data: PipelinePreset[] };
        setPresets(result.data);
        if (result.data.length > 0) {
          setSelectedPresetId(result.data[0].id);
        }
      } catch (err) {
        console.error('[CreateCampaign] Failed to load presets:', err);
      }
    }
    load();
  }, [mode]);

  const handleSubmit = async () => {
    if (!name.trim() || !selectedPresetId) return;
    setCreating(true);
    try {
      await api.campaigns.create({
        name: name.trim(),
        mode,
        pipeline_preset_id: selectedPresetId,
      });
      onCreated();
    } catch (err) {
      console.error('[CreateCampaign] Failed to create:', err);
    } finally {
      setCreating(false);
    }
  };

  const modeConfig = MODE_CONFIG[mode];

  return (
    <div
      className="pl-card"
      style={{ marginBottom: '12px', borderColor: modeConfig.color }}
    >
      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>
        New {modeConfig.label} Campaign
      </div>

      {/* Campaign Name */}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Campaign name..."
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
        }}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
      />

      {/* Pipeline Preset Selector */}
      <select
        value={selectedPresetId}
        onChange={(e) => setSelectedPresetId(e.target.value)}
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '12px',
          border: '1px solid var(--pl-border-secondary)',
          borderRadius: '4px',
          backgroundColor: 'var(--pl-bg-primary)',
          color: 'var(--pl-text-primary)',
          marginBottom: '10px',
        }}
      >
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name} ({(preset.stages_json as unknown[]).length} stages)
          </option>
        ))}
      </select>

      {/* Actions */}
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
          onClick={handleSubmit}
          disabled={!name.trim() || !selectedPresetId || creating}
          style={{
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '4px',
            backgroundColor: modeConfig.color,
            color: '#FFFFFF',
            cursor: name.trim() && selectedPresetId && !creating ? 'pointer' : 'not-allowed',
            opacity: name.trim() && selectedPresetId && !creating ? 1 : 0.5,
          }}
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
}
