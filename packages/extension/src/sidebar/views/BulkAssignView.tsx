import { useState, useEffect, useCallback } from 'react';
import type { TransactionMode, Contact, PipelinePreset, PipelineStage } from '@pitchlink/shared';

import { useModeColors } from '../hooks/useModeColors';
import { api } from '../../utils/api';
import { ContactCardSkeleton } from '../components/Skeleton';

type ContactFilter = 'unassigned' | 'all' | 'enriched';

interface BulkAssignViewProps {
  mode: TransactionMode;
  initialFilter?: ContactFilter;
  onClose: () => void;
}

const FILTER_LABELS: Record<ContactFilter, string> = {
  unassigned: 'Unassigned',
  all: 'All',
  enriched: 'Enriched',
};

interface CampaignOption {
  id: string;
  name: string;
  mode: string;
  pipeline_preset_id: string;
}

const PAGE_SIZE = 50;

export function BulkAssignView({ mode, initialFilter = 'unassigned', onClose }: BulkAssignViewProps) {
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ContactFilter>(initialFilter);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [firstStage, setFirstStage] = useState<PipelineStage | null>(null);

  const modeColors = useModeColors(mode);

  // Load campaigns for current mode
  useEffect(() => {
    (async () => {
      try {
        const res = await api.campaigns.list({ mode, status: 'active' }) as {
          data: { campaigns: CampaignOption[] };
        };
        setCampaigns(res.data.campaigns);
        if (res.data.campaigns.length > 0) {
          setSelectedCampaignId(res.data.campaigns[0].id);
        }
      } catch (err) {
        console.error('[BulkAssign] Failed to load campaigns:', err);
      }
    })();
  }, [mode]);

  // Load contacts according to the active filter. 'unassigned' requires a campaign;
  // 'all' and 'enriched' load workspace-wide and the assign action stays gated on
  // the campaign picker.
  const loadContacts = useCallback(async (append = false) => {
    if (filter === 'unassigned' && !selectedCampaignId) return;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setSelectedIds(new Set());
      setResult(null);
    }

    try {
      const offset = append ? contacts.length : 0;
      const res = await api.contacts.list({
        search: search || undefined,
        limit: PAGE_SIZE,
        offset,
        enrichedOnly: filter === 'enriched',
        unassignedFromCampaignId: filter === 'unassigned' ? selectedCampaignId : undefined,
      }) as { data: { contacts: Contact[]; total: number } };

      if (append) {
        setContacts((prev) => [...prev, ...res.data.contacts]);
      } else {
        setContacts(res.data.contacts);
      }
      setTotalContacts(res.data.total);
    } catch (err) {
      console.error('[BulkAssign] Failed to load contacts:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [selectedCampaignId, search, contacts.length, filter]);

  // Reload contacts when campaign, search, or filter changes
  useEffect(() => {
    loadContacts(false);
  }, [selectedCampaignId, search, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch pipeline preset when campaign changes
  useEffect(() => {
    if (!selectedCampaignId) return;
    const campaign = campaigns.find((c) => c.id === selectedCampaignId);
    if (!campaign) return;

    (async () => {
      try {
        const res = await api.presets.get(campaign.pipeline_preset_id) as {
          data: PipelinePreset;
        };
        const stages = res.data.stages_json || [];
        setFirstStage(stages.length > 0 ? stages[0] : null);
      } catch (err) {
        console.error('[BulkAssign] Failed to load preset:', err);
        setFirstStage(null);
      }
    })();
  }, [selectedCampaignId, campaigns]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  const handleAssign = async () => {
    if (selectedIds.size === 0 || !selectedCampaignId || !firstStage) return;

    setAssigning(true);
    setResult(null);
    try {
      const res = await api.deals.bulkCreate({
        contact_ids: Array.from(selectedIds),
        campaign_id: selectedCampaignId,
        mode,
        initial_stage: firstStage.id,
      }) as { data: { created: number; skipped: number } };

      setResult(res.data);
      // Reload contacts to remove the now-assigned ones
      await loadContacts(false);
    } catch (err) {
      console.error('[BulkAssign] Failed to assign:', err);
    } finally {
      setAssigning(false);
    }
  };

  const hasMore = contacts.length < totalContacts;
  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '2px',
            color: 'var(--pl-text-secondary)',
          }}
        >
          &#8592;
        </button>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>
          {filter === 'unassigned' ? 'Bulk Assign to Campaign' : `${FILTER_LABELS[filter]} Contacts`}
        </div>
      </div>

      {/* Filter toggle */}
      <div
        role="tablist"
        aria-label="Contact filter"
        style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}
      >
        {(['unassigned', 'all', 'enriched'] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            style={{
              flex: 1,
              padding: '5px 6px',
              fontSize: '11px',
              fontWeight: filter === f ? 600 : 400,
              border: filter === f ? `1px solid ${modeColors.color}` : '1px solid var(--pl-border-secondary)',
              borderRadius: '6px',
              backgroundColor: filter === f ? modeColors.color : 'transparent',
              color: filter === f ? 'var(--pl-text-inverse)' : 'var(--pl-text-secondary)',
              cursor: 'pointer',
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Campaign Selector */}
      <select
        value={selectedCampaignId}
        onChange={(e) => setSelectedCampaignId(e.target.value)}
        style={{
          width: '100%',
          padding: '8px',
          fontSize: '13px',
          border: '1px solid var(--pl-border-secondary)',
          borderRadius: '6px',
          backgroundColor: 'var(--pl-bg-primary)',
          color: 'var(--pl-text-primary)',
          marginBottom: '8px',
        }}
      >
        {campaigns.length === 0 && (
          <option value="">No active campaigns</option>
        )}
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {/* First stage indicator */}
      {firstStage && (
        <div style={{
          fontSize: '11px',
          color: 'var(--pl-text-tertiary)',
          marginBottom: '8px',
        }}>
          Contacts will be assigned to stage: <strong style={{ color: firstStage.color }}>{firstStage.name}</strong>
        </div>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, email, or domain..."
        style={{
          width: '100%',
          padding: '7px 10px',
          fontSize: '12px',
          border: '1px solid var(--pl-border-secondary)',
          borderRadius: '6px',
          backgroundColor: 'var(--pl-bg-secondary)',
          color: 'var(--pl-text-primary)',
          marginBottom: '8px',
          boxSizing: 'border-box',
        }}
      />

      {/* Result Banner */}
      {result && (
        <div style={{
          padding: '8px 12px',
          borderRadius: '6px',
          backgroundColor: 'var(--pl-success)',
          color: 'var(--pl-text-inverse)',
          fontSize: '12px',
          fontWeight: 500,
          marginBottom: '8px',
        }}>
          {result.created} contacts assigned{result.skipped > 0 ? `, ${result.skipped} skipped (already in campaign)` : ''}
        </div>
      )}

      {/* Select All + Count */}
      {!loading && contacts.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 0',
          borderBottom: '1px solid var(--pl-border-primary)',
          marginBottom: '4px',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={selectedIds.size === contacts.length && contacts.length > 0}
              onChange={toggleSelectAll}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ color: 'var(--pl-text-secondary)' }}>
              {selectedIds.size > 0
                ? `${selectedIds.size} of ${totalContacts} selected`
                : `Select all (${contacts.length} loaded)`
              }
            </span>
          </label>
          <span style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>
            {totalContacts} {FILTER_LABELS[filter].toLowerCase()}
          </span>
        </div>
      )}

      {/* Contact List */}
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
        {loading ? (
          <div>
            <ContactCardSkeleton />
            <div style={{ height: '8px' }} />
            <ContactCardSkeleton />
            <div style={{ height: '8px' }} />
            <ContactCardSkeleton />
          </div>
        ) : contacts.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '24px 12px',
            color: 'var(--pl-text-tertiary)',
            fontSize: '12px',
          }}>
            {filter === 'unassigned' && !selectedCampaignId
              ? 'Select a campaign to see unassigned contacts.'
              : filter === 'unassigned'
                ? 'All contacts are already assigned to this campaign.'
                : filter === 'enriched'
                  ? 'No enriched contacts yet. Open a contact and run enrichment to get started.'
                  : 'No contacts in this workspace yet.'}
          </div>
        ) : (
          <>
            {contacts.map((contact) => (
              <label
                key={contact.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: selectedIds.has(contact.id) ? 'var(--pl-bg-tertiary)' : 'transparent',
                  transition: 'background-color 0.1s',
                  marginBottom: '2px',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(contact.id)}
                  onChange={() => toggleSelect(contact.id)}
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--pl-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {contact.name || contact.email}
                  </div>
                  {contact.name && (
                    <div style={{
                      fontSize: '11px',
                      color: 'var(--pl-text-tertiary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {contact.email}
                    </div>
                  )}
                  {contact.domain && (
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--pl-text-tertiary)',
                    }}>
                      {contact.domain}
                    </div>
                  )}
                </div>
              </label>
            ))}

            {/* Load More */}
            {hasMore && (
              <button
                onClick={() => loadContacts(true)}
                disabled={loadingMore}
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '12px',
                  border: '1px solid var(--pl-border-secondary)',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  color: 'var(--pl-text-secondary)',
                  cursor: loadingMore ? 'not-allowed' : 'pointer',
                  marginTop: '8px',
                }}
              >
                {loadingMore ? 'Loading…' : `Load more (${totalContacts - contacts.length} remaining)`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Sticky Footer */}
      {contacts.length > 0 && (
        <div style={{
          paddingTop: '12px',
          borderTop: '1px solid var(--pl-border-primary)',
          marginTop: '8px',
        }}>
          <button
            onClick={handleAssign}
            disabled={selectedIds.size === 0 || assigning || !firstStage}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '8px',
              backgroundColor: selectedIds.size > 0 && !assigning ? modeColors.color : 'var(--pl-bg-tertiary)',
              color: selectedIds.size > 0 && !assigning ? 'var(--pl-text-inverse)' : 'var(--pl-text-tertiary)',
              cursor: selectedIds.size > 0 && !assigning ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s ease',
            }}
          >
            {assigning
              ? 'Assigning...'
              : `Assign ${selectedIds.size} Contact${selectedIds.size !== 1 ? 's' : ''} to ${selectedCampaign?.name || 'Campaign'}`
            }
          </button>
        </div>
      )}
    </div>
  );
}
