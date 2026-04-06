import { useState, useEffect, useCallback } from 'react';
import type { TransactionMode } from '@pitchlink/shared';
import { useModeColors } from '../hooks/useModeColors';
import { api } from '../../utils/api';
import { Skeleton } from '../components/Skeleton';

interface HistoryViewProps {
  mode: TransactionMode;
}

interface ActivityItem {
  id: string;
  type: string;
  data: Record<string, unknown>;
  created_at: string;
  deal: {
    id: string;
    mode: string;
    current_stage: string;
    contact: { id: string; email: string; name?: string; domain?: string };
    campaign: { id: string; name: string };
  };
}

const PAGE_SIZE = 30;

const ACTIVITY_CONFIG: Record<string, { icon: string; label: string }> = {
  stage_changed: { icon: '\u{1F4CA}', label: 'Stage changed' },
  note_added: { icon: '\u{1F4DD}', label: 'Note added' },
  email_sent: { icon: '\u{1F4E4}', label: 'Email sent' },
  email_received: { icon: '\u{1F4E5}', label: 'Email received' },
  contact_enriched: { icon: '\u{1F50D}', label: 'Contact enriched' },
  sequence_enrolled: { icon: '\u{1F504}', label: 'Enrolled in sequence' },
  sequence_paused: { icon: '\u23F8\uFE0F', label: 'Sequence paused' },
  sequence_completed: { icon: '\u2705', label: 'Sequence completed' },
  tag_added: { icon: '\u{1F3F7}\uFE0F', label: 'Tag added' },
  tag_removed: { icon: '\u274C', label: 'Tag removed' },
  forward_detected: { icon: '\u{1F4E8}', label: 'Forward detected' },
  deal_created: { icon: '\u{1F4C4}', label: 'Deal created' },
};

export function HistoryView({ mode }: HistoryViewProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const modeColors = useModeColors(mode);

  const loadActivities = useCallback(async (offset = 0, append = false) => {
    try {
      const result = await api.deals.getGlobalActivities({
        mode,
        limit: PAGE_SIZE,
        offset,
      }) as { data: { activities: ActivityItem[]; total: number } };

      if (append) {
        setActivities((prev) => [...prev, ...result.data.activities]);
      } else {
        setActivities(result.data.activities);
      }
      setTotal(result.data.total);
    } catch (err) {
      console.error('[HistoryView] Failed to load activities:', err);
    }
  }, [mode]);

  useEffect(() => {
    setLoading(true);
    loadActivities(0).finally(() => setLoading(false));
  }, [loadActivities]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await loadActivities(activities.length, true);
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <div>
        <Skeleton width="50%" height="14px" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} width="100%" height="52px" style={{ marginTop: '8px' }} />
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 12px' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>&#128337;</div>
        <div style={{ fontSize: '13px', color: 'var(--pl-text-secondary)' }}>
          No activity yet
        </div>
        <div style={{ fontSize: '12px', color: 'var(--pl-text-tertiary)', marginTop: '4px' }}>
          Stage changes, emails, and interactions will appear here.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', marginBottom: '8px' }}>
        {total} activit{total === 1 ? 'y' : 'ies'}
      </div>

      {activities.map((activity) => {
        const config = ACTIVITY_CONFIG[activity.type] || { icon: '\u2022', label: activity.type };
        const contact = activity.deal?.contact;
        const campaign = activity.deal?.campaign;

        return (
          <div
            key={activity.id}
            onClick={() => {
              if (contact?.email) {
                window.location.hash = `#search/from:${contact.email}+OR+to:${contact.email}`;
              }
            }}
            style={{
              display: 'flex',
              gap: '8px',
              padding: '8px 0',
              borderBottom: '1px solid var(--pl-border-primary)',
              cursor: contact?.email ? 'pointer' : 'default',
            }}
          >
            <div style={{ fontSize: '14px', lineHeight: '20px', flexShrink: 0 }}>
              {config.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {contact?.name || contact?.email || 'Unknown'}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--pl-text-tertiary)', flexShrink: 0, marginLeft: '8px' }}>
                  {formatTimeAgo(new Date(activity.created_at))}
                </div>
              </div>
              {campaign && (
                <div style={{ fontSize: '10px', color: 'var(--pl-text-tertiary)', marginTop: '1px' }}>
                  {campaign.name}
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--pl-text-secondary)', marginTop: '2px' }}>
                {formatActivityDescription(activity)}
              </div>
            </div>
          </div>
        );
      })}

      {activities.length < total && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          style={{
            width: '100%',
            padding: '8px',
            marginTop: '8px',
            fontSize: '12px',
            fontWeight: 500,
            border: `1px solid ${modeColors.color}`,
            borderRadius: '6px',
            backgroundColor: 'transparent',
            color: modeColors.color,
            cursor: loadingMore ? 'not-allowed' : 'pointer',
          }}
        >
          {loadingMore ? 'Loading...' : `Load more (${activities.length}/${total})`}
        </button>
      )}
    </div>
  );
}

function formatActivityDescription(activity: ActivityItem): string {
  const data = activity.data || {};

  switch (activity.type) {
    case 'stage_changed': {
      const from = data.from as string | null;
      const to = data.to as string;
      if (!from) return `Added at stage "${to}"`;
      return `Stage: ${from} \u2192 ${to}`;
    }
    case 'note_added':
      return data.note ? String(data.note).slice(0, 80) : 'Note added';
    case 'email_sent':
      return data.subject ? `Subject: ${data.subject}` : 'Email sent';
    case 'email_received':
      return data.subject ? `Subject: ${data.subject}` : 'Reply received';
    case 'sequence_enrolled':
      return data.sequence_name ? `Enrolled in "${data.sequence_name}"` : 'Enrolled in sequence';
    case 'sequence_paused':
      return data.reason === 'reply_received' ? 'Paused (contact replied)' : `Paused: ${data.reason || 'manual'}`;
    case 'sequence_completed':
      return 'Sequence completed';
    case 'contact_enriched':
      return data.providers ? `Via ${data.providers}` : 'Contact enriched';
    case 'forward_detected': {
      const original = data.original_sender as string;
      const forwarding = data.forwarding_email as string;
      return original ? `${forwarding} → ${original}` : 'Forward detected';
    }
    case 'deal_created':
      return data.reason === 'bulk_assign' ? 'Bulk assigned' : 'Deal created';
    default:
      return activity.type.replace(/_/g, ' ');
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString();
}
