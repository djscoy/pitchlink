import { useState, useEffect, useCallback } from 'react';
import type { TransactionMode, PipelinePreset, PipelineStage } from '@pitchlink/shared';
import { MODE_CONFIG } from '@pitchlink/shared';
import { useModeColors } from '../hooks/useModeColors';
import { api } from '../../utils/api';
import { CampaignCardSkeleton } from '../components/Skeleton';

interface DashboardViewProps {
  mode: TransactionMode;
  onNavigateToCampaign: (campaignId: string) => void;
  onBulkAssign?: () => void;
}

interface CampaignListItem {
  id: string;
  name: string;
  mode: string;
  status: string;
  pipeline_preset: PipelinePreset;
  created_at: string;
  stageStats?: { total_deals: number; stages: (PipelineStage & { count: number })[] };
}

interface DashboardStats {
  total_contacts: number;
  active_campaigns: number;
  total_deals: number;
  recent_replies: number;
  active_enrollments: number;
  enriched_contacts: number;
}

export function DashboardView({ mode, onNavigateToCampaign, onBulkAssign }: DashboardViewProps) {
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.campaigns.list({ mode }) as {
        data: { campaigns: CampaignListItem[]; total: number };
      };
      const campaignList = result.data.campaigns;

      // Fetch stage stats for each campaign (non-blocking — show list immediately if stats fail)
      const statsPromises = campaignList.map(async (c) => {
        try {
          const stats = await api.campaigns.getStats(c.id) as {
            data: { total_deals: number; stages: (PipelineStage & { count: number })[] };
          };
          c.stageStats = stats.data;
        } catch { /* stats are optional polish */ }
      });
      await Promise.all(statsPromises);

      setCampaigns(campaignList);
    } catch (err) {
      console.error('[Dashboard] Failed to load campaigns:', err);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  const loadStats = useCallback(async () => {
    try {
      const result = await api.campaigns.getDashboardStats(mode) as { data: DashboardStats };
      setStats(result.data);
    } catch (err) {
      console.error('[Dashboard] Failed to load stats:', err);
    }
  }, [mode]);

  useEffect(() => { loadCampaigns(); loadStats(); }, [loadCampaigns, loadStats]);

  const modeConfig = MODE_CONFIG[mode];
  const modeColors = useModeColors(mode);

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
        <div style={{ display: 'flex', gap: '4px' }}>
          {onBulkAssign && (
            <button
              onClick={onBulkAssign}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                border: `1px solid ${modeColors.color}`,
                borderRadius: '6px',
                backgroundColor: 'transparent',
                color: modeColors.color,
                cursor: 'pointer',
              }}
            >
              Bulk Assign
            </button>
          )}
          <button
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              backgroundColor: modeColors.color,
              color: 'var(--pl-text-inverse)',
              cursor: 'pointer',
            }}
          >
            + New
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '6px',
          marginBottom: '12px',
        }}>
          <MetricCard label="Contacts" value={stats.total_contacts} color="var(--pl-text-primary)" />
          <MetricCard label="Deals" value={stats.total_deals} color={modeColors.color} />
          <MetricCard label="Replies" value={stats.recent_replies} subtitle="30d" color="var(--pl-success, #10B981)" />
          <MetricCard label="Sequences" value={stats.active_enrollments} color="var(--pl-text-secondary)" />
          <MetricCard label="Enriched" value={stats.enriched_contacts} color="var(--pl-text-secondary)" />
          <MetricCard label="Campaigns" value={stats.active_campaigns} color="var(--pl-text-secondary)" />
        </div>
      )}

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
              backgroundColor: modeColors.color,
              color: 'var(--pl-text-inverse)',
              cursor: 'pointer',
            }}
          >
            Create Campaign
          </button>
        </div>
      )}

      {campaigns.map((campaign) => {
        const stats = campaign.stageStats;
        const totalDeals = stats?.total_deals || 0;
        return (
          <div
            key={campaign.id}
            className="pl-card"
            onClick={() => onNavigateToCampaign(campaign.id)}
            style={{ cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{campaign.name}</div>
              <span style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>
                {totalDeals > 0 ? `${totalDeals} contact${totalDeals !== 1 ? 's' : ''}` : campaign.status}
              </span>
            </div>

            {/* Mini progress bar */}
            {stats && totalDeals > 0 && (
              <>
                <div
                  style={{
                    display: 'flex',
                    gap: '2px',
                    marginTop: '8px',
                    height: '6px',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    backgroundColor: 'var(--pl-bg-tertiary)',
                  }}
                >
                  {stats.stages.map((stage) => (
                    <div
                      key={stage.id}
                      style={{
                        flex: stage.count / (totalDeals || 1),
                        backgroundColor: stage.count > 0 ? stage.color : 'transparent',
                        borderRadius: '2px',
                        minWidth: stage.count > 0 ? '4px' : 0,
                        transition: 'flex 0.3s ease',
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {stats.stages
                    .filter((s) => s.count > 0)
                    .map((stage) => (
                      <span
                        key={stage.id}
                        style={{
                          fontSize: '10px',
                          color: 'var(--pl-text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: stage.color }} />
                        {stage.name}: {stage.count}
                      </span>
                    ))}
                </div>
              </>
            )}

            {/* Fallback info when no deals */}
            {(!stats || totalDeals === 0) && (
              <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', marginTop: '4px' }}>
                {campaign.pipeline_preset?.name || 'Custom pipeline'} &middot;{' '}
                {new Date(campaign.created_at).toLocaleDateString()}
              </div>
            )}
          </div>
        );
      })}
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
  const modeColors = useModeColors(mode);

  return (
    <div
      className="pl-card"
      style={{ marginBottom: '12px', borderColor: modeColors.color }}
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
            backgroundColor: modeColors.color,
            color: 'var(--pl-text-inverse)',
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

// --- Metric Card ---

function MetricCard({ label, value, subtitle, color }: { label: string; value: number; subtitle?: string; color: string }) {
  return (
    <div
      style={{
        padding: '8px',
        borderRadius: '6px',
        backgroundColor: 'var(--pl-bg-secondary)',
        border: '1px solid var(--pl-border-secondary)',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '16px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'var(--pl-text-tertiary)', marginTop: '2px' }}>
        {label}{subtitle ? ` (${subtitle})` : ''}
      </div>
    </div>
  );
}
