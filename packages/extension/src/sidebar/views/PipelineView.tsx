import { useState, useEffect, useCallback } from 'react';
import type { PipelineStage, TransactionMode } from '@pitchlink/shared';
import { MODE_CONFIG } from '@pitchlink/shared';
import { useModeColors } from '../hooks/useModeColors';
import { api } from '../../utils/api';
import { CampaignCardSkeleton } from '../components/Skeleton';
import { StageBadge } from '../components/StageBadge';
import { ReplyBadge } from '../components/ReplyBadge';

interface PipelineViewProps {
  mode: TransactionMode;
  activeCampaignId: string | null;
  onSelectCampaign: (id: string) => void;
}

interface CampaignStats {
  campaign: { id: string; name: string; mode: string; status: string };
  total_deals: number;
  stages: (PipelineStage & { count: number })[];
}

interface DealWithContact {
  id: string;
  current_stage: string;
  last_reply_at: string | null;
  contact: { id: string; email: string; name: string; domain: string };
}

export function PipelineView({ mode, activeCampaignId, onSelectCampaign }: PipelineViewProps) {
  const [campaigns, setCampaigns] = useState<CampaignStats[]>([]);
  const [activeDealsByStage, setActiveDealsByStage] = useState<Record<string, DealWithContact[]>>({});
  const [loading, setLoading] = useState(true);
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [bulkEnrichResult, setBulkEnrichResult] = useState<{ enriched: number; failed: number; total: number } | null>(null);

  const modeColors = useModeColors(mode);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.campaigns.list({ mode, status: 'active' }) as {
        data: { campaigns: { id: string; name: string; mode: string; status: string }[]; total: number };
      };

      // Load stats for each campaign
      const statsPromises = result.data.campaigns.map(async (c) => {
        const stats = await api.campaigns.getStats(c.id) as { data: CampaignStats };
        return stats.data;
      });

      const allStats = await Promise.all(statsPromises);
      setCampaigns(allStats);
    } catch (err) {
      console.error('[PipelineView] Failed to load campaigns:', err);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  // Load deals for active campaign
  const loadDeals = useCallback(async () => {
    if (!activeCampaignId) {
      setActiveDealsByStage({});
      return;
    }
    try {
      const result = await api.deals.listByCampaign(activeCampaignId) as { data: DealWithContact[] };
      const grouped: Record<string, DealWithContact[]> = {};
      for (const deal of result.data) {
        if (!grouped[deal.current_stage]) grouped[deal.current_stage] = [];
        grouped[deal.current_stage].push(deal);
      }
      setActiveDealsByStage(grouped);
    } catch (err) {
      console.error('[PipelineView] Failed to load deals:', err);
    }
  }, [activeCampaignId]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);
  useEffect(() => { loadDeals(); }, [loadDeals]);

  const handleStageChange = useCallback(async (dealId: string, newStage: string) => {
    try {
      await api.deals.changeStage(dealId, newStage);
      await loadDeals();
    } catch (err) {
      console.error('[PipelineView] Stage change failed:', err);
    }
  }, [loadDeals]);

  if (loading) {
    return (
      <div>
        <CampaignCardSkeleton />
        <CampaignCardSkeleton />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 12px' }}>
        <div style={{ fontSize: '13px', color: 'var(--pl-text-secondary)' }}>
          No active {MODE_CONFIG[mode].label.toLowerCase()} campaigns
        </div>
        <div style={{ fontSize: '12px', color: 'var(--pl-text-tertiary)', marginTop: '4px' }}>
          Create a campaign to start tracking your pipeline.
        </div>
      </div>
    );
  }

  // If no campaign is selected, show overview
  if (!activeCampaignId) {
    return (
      <div>
        {campaigns.map((stats) => (
          <CampaignSummaryCard
            key={stats.campaign.id}
            stats={stats}
            modeColor={modeColors.color}
            onClick={() => onSelectCampaign(stats.campaign.id)}
          />
        ))}
      </div>
    );
  }

  // Active campaign: show pipeline stages with deals
  const activeStats = campaigns.find((c) => c.campaign.id === activeCampaignId);
  if (!activeStats) return null;

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => onSelectCampaign('')}
        style={{
          background: 'none',
          border: 'none',
          fontSize: '12px',
          color: 'var(--pl-text-secondary)',
          cursor: 'pointer',
          marginBottom: '8px',
          padding: '2px 0',
        }}
      >
        &larr; All campaigns
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>
          {activeStats.campaign.name}
        </div>
        <button
          onClick={async () => {
            setBulkEnriching(true);
            setBulkEnrichResult(null);
            try {
              const res = await api.contacts.bulkEnrich(activeCampaignId!) as { data: { enriched: number; failed: number; total: number } };
              setBulkEnrichResult(res.data);
            } catch {
              setBulkEnrichResult({ enriched: 0, failed: 0, total: 0 });
            } finally {
              setBulkEnriching(false);
            }
          }}
          disabled={bulkEnriching}
          style={{
            padding: '3px 8px',
            fontSize: '10px',
            fontWeight: 600,
            border: '1px solid var(--pl-border-secondary)',
            borderRadius: '4px',
            backgroundColor: bulkEnriching ? 'var(--pl-bg-tertiary)' : 'transparent',
            color: bulkEnriching ? 'var(--pl-text-tertiary)' : 'var(--pl-text-secondary)',
            cursor: bulkEnriching ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
          title="Enrich all contacts in this campaign"
        >
          {bulkEnriching ? 'Enriching...' : 'Enrich All'}
        </button>
      </div>
      {bulkEnrichResult && (
        <div style={{ fontSize: '11px', color: 'var(--pl-text-secondary)', marginBottom: '8px', padding: '6px 8px', borderRadius: '4px', backgroundColor: 'var(--pl-bg-secondary)' }}>
          Enriched {bulkEnrichResult.enriched}/{bulkEnrichResult.total} contacts
          {bulkEnrichResult.failed > 0 && ` (${bulkEnrichResult.failed} failed)`}
        </div>
      )}

      {/* Stage columns */}
      {activeStats.stages.map((stage) => {
        const deals = activeDealsByStage[stage.id] || [];
        return (
          <div key={stage.id} style={{ marginBottom: '12px' }}>
            {/* Stage header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <StageBadge stage={stage} size="sm" />
              <span style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>
                {deals.length}
              </span>
            </div>

            {/* Deal cards */}
            {deals.map((deal) => {
              const stageIdx = activeStats.stages.findIndex((s) => s.id === stage.id);
              const nextStage = activeStats.stages[stageIdx + 1];
              return (
                <div
                  key={deal.id}
                  className="pl-card"
                  style={{
                    padding: '8px 10px',
                    marginBottom: '4px',
                    borderLeft: `3px solid ${stage.color}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {deal.contact.name || deal.contact.email}
                      </div>
                      <ReplyBadge hasReply={!!deal.last_reply_at} replyDate={deal.last_reply_at || undefined} />
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>
                      {deal.contact.domain || deal.contact.email}
                    </div>
                  </div>
                  {nextStage && (
                    <button
                      onClick={() => handleStageChange(deal.id, nextStage.id)}
                      title={`Move to ${nextStage.name}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: 'var(--pl-text-tertiary)',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        flexShrink: 0,
                      }}
                    >
                      &rarr;
                    </button>
                  )}
                </div>
              );
            })}

            {deals.length === 0 && (
              <div
                style={{
                  padding: '6px 10px',
                  fontSize: '11px',
                  color: 'var(--pl-text-tertiary)',
                  borderLeft: `3px solid ${stage.color}20`,
                  marginBottom: '4px',
                }}
              >
                No contacts in this stage
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Campaign Summary Card ---

function CampaignSummaryCard({
  stats,
  onClick,
}: {
  stats: CampaignStats;
  modeColor?: string;
  onClick: () => void;
}) {
  const totalContacts = stats.total_deals;

  return (
    <div
      className="pl-card"
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>{stats.campaign.name}</div>
        <span style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>
          {totalContacts} contact{totalContacts !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Mini progress bar */}
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
              flex: stage.count / (totalContacts || 1),
              backgroundColor: stage.count > 0 ? stage.color : 'transparent',
              borderRadius: '2px',
              minWidth: stage.count > 0 ? '4px' : 0,
              transition: 'flex 0.3s ease',
            }}
          />
        ))}
      </div>

      {/* Stage mini counts */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          marginTop: '8px',
        }}
      >
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
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: stage.color,
                }}
              />
              {stage.name}: {stage.count}
            </span>
          ))}
      </div>
    </div>
  );
}
