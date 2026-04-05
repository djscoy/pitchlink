import { useState, useEffect, useCallback } from 'react';
import type { TransactionMode, Contact, PipelinePreset, PipelineStage } from '@pitchlink/shared';
import { MODE_CONFIG } from '@pitchlink/shared';
import { api } from '../../utils/api';
import { ContactCardSkeleton } from '../components/Skeleton';

interface BulkAssignViewProps {
  mode: TransactionMode;
  onClose: () => void;
}

interface CampaignOption {
  id: string;
  name: string;
  mode: string;
  pipeline_preset_id: string;
}

const PAGE_SIZE = 50;

export function BulkAssignView({ mode, onClose }: BulkAssignViewProps) {
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalUnassigned, setTotalUnassigned] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [firstStage, setFirstStage] = useState<PipelineStage | null>(null);

  const modeConfig = MODE_CONFIG[mode];

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

  // Load unassigned contacts when campaign or search changes
  const loadContacts = useCallback(async (append = false) => {
    if (!selectedCampaignId) return;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setSelectedIds(new Set());
      setResult(null);
    }

    try {
      const offset = append ? contacts.length : 0;
      const res = await api.contacts.listUnassigned(selectedCampaignId, {
        search: search || undefined,
        limit: PAGE_SIZE,
        offset,
      }) as { data: { contacts: Contact[]; total: number } };

      if (append) {
        setContacts((prev) => [...prev, ...res.data.contacts]);
      } else {
        setContacts(res.data.contacts);
      }
      setTotalUnassigned(res.data.total);
    } catch (err) {
      console.error('[BulkAssign] Failed to load contacts:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [selectedCampaignId, search, contacts.length]);

  // Reload contacts when campaign or search changes
  useEffect(() => {
    if (selectedCampaignId) {
      loadContacts(false);
    }
  }, [selectedCampaignId, search]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const hasMore = contacts.length < totalUnassigned;
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
        <div style={{ fontSize: '14px', fontWeight: 600 }}>Bulk Assign to Campaign</div>
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
          color: '#FFFFFF',
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
                ? `${selectedIds.size} of ${totalUnassigned} selected`
                : `Select all (${contacts.length} loaded)`
              }
            </span>
          </label>
          <span style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>
            {totalUnassigned} unassigned
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
            {selectedCampaignId
              ? 'All contacts are already assigned to this campaign.'
              : 'Select a campaign to see unassigned contacts.'}
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
                {loadingMore ? 'Loading...' : `Load more (${totalUnassigned - contacts.length} remaining)`}
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
              backgroundColor: selectedIds.size > 0 && !assigning ? modeConfig.color : 'var(--pl-bg-tertiary)',
              color: selectedIds.size > 0 && !assigning ? '#FFFFFF' : 'var(--pl-text-tertiary)',
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
