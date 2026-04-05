/**
 * OnboardingView — Multi-step wizard for AI inbox scan onboarding.
 *
 * Screens:
 *   1. Config — Choose time range and min interactions
 *   2. Progress — Real-time scan progress
 *   3. Review — Review discovered contacts, accept/reject
 *   4. Complete — Summary and "Start using PitchLink"
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  OnboardingScanProgress,
  OnboardingContact,
  DealStatus,
  OnboardingScanStatus,
} from '@pitchlink/shared';
import { api } from '../../utils/api';

type OnboardingStep = 'config' | 'progress' | 'review' | 'complete';

interface OnboardingViewProps {
  onComplete: () => void;
  onSkip: () => void;
}

const DEAL_STATUS_LABELS: Record<DealStatus, { label: string; color: string }> = {
  waiting_for_reply: { label: 'Waiting for reply', color: '#F59E0B' },
  quoted_no_followup: { label: 'Quoted, no follow-up', color: '#EF4444' },
  active_conversation: { label: 'Active conversation', color: '#10B981' },
  completed_deal: { label: 'Completed', color: '#6B7280' },
  unclassified: { label: 'Unclassified', color: '#9CA3AF' },
};

const TIME_RANGES = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '6 months', value: 180 },
  { label: '12 months', value: 365 },
];

export function OnboardingView({ onComplete, onSkip }: OnboardingViewProps) {
  const [step, setStep] = useState<OnboardingStep>('config');
  const [timeRange, setTimeRange] = useState(90);
  const [minInteractions, setMinInteractions] = useState(1);
  const [scanId, setScanId] = useState<string | null>(null);
  const [progress, setProgress] = useState<OnboardingScanProgress | null>(null);
  const [contacts, setContacts] = useState<OnboardingContact[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DealStatus | 'all'>('all');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start the scan
  const handleStartScan = async () => {
    setError(null);
    try {
      const result = await api.onboarding.startScan({
        time_range_days: timeRange,
        min_interactions: minInteractions,
      }) as { data: { scan_id: string } };

      setScanId(result.data.scan_id);
      setStep('progress');
    } catch (err) {
      setError('Failed to start scan. Please try again.');
      console.error('[Onboarding] Start scan error:', err);
    }
  };

  // Poll for progress
  useEffect(() => {
    if (step !== 'progress' || !scanId) return;

    const poll = async () => {
      try {
        const result = await api.onboarding.getScanProgress(scanId) as { data: OnboardingScanProgress };
        setProgress(result.data);

        if (result.data.status === 'complete') {
          if (pollRef.current) clearInterval(pollRef.current);
          // Load contacts
          await loadContacts(scanId);
          setStep('review');
        } else if (result.data.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setError(result.data.error_message || 'Scan failed');
        }
      } catch (err) {
        console.error('[Onboarding] Poll error:', err);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, scanId]);

  const loadContacts = useCallback(async (sid: string) => {
    try {
      // Load all contacts in pages of 500
      let allContacts: OnboardingContact[] = [];
      let offset = 0;
      let total = 0;
      const pageSize = 500;

      do {
        const result = await api.onboarding.getScanContacts(sid, {
          limit: pageSize,
          offset,
        }) as { data: { contacts: OnboardingContact[]; total: number } };

        allContacts = allContacts.concat(result.data.contacts);
        total = result.data.total;
        offset += pageSize;
      } while (offset < total);

      setContacts(allContacts);
      setContactsTotal(total);
    } catch (err) {
      console.error('[Onboarding] Load contacts error:', err);
    }
  }, []);

  // Accept/reject a contact
  const handleContactAction = async (contactId: string, action: 'accepted' | 'rejected') => {
    try {
      await api.onboarding.updateContact(contactId, { status: action });
      setContacts((prev) => prev.map((c) =>
        c.id === contactId ? { ...c, status: action } : c,
      ));
    } catch (err) {
      console.error('[Onboarding] Update contact error:', err);
    }
  };

  // Accept all visible — batch in groups of 20 for speed
  const handleAcceptAll = async () => {
    const pending = filteredContacts.filter((c) => c.status === 'pending');
    const batchSize = 20;

    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      await Promise.all(
        batch.map((contact) =>
          api.onboarding.updateContact(contact.id, { status: 'accepted' }).catch(() => {}),
        ),
      );
      // Update local state after each batch
      setContacts((prev) => {
        const batchIds = new Set(batch.map((c) => c.id));
        return prev.map((c) => batchIds.has(c.id) ? { ...c, status: 'accepted' as const } : c);
      });
    }
  };

  // Restart onboarding — clear old data and go back to config
  const handleRestart = async () => {
    try {
      if (scanId) {
        await api.onboarding.restartScan(scanId);
      }
    } catch (err) {
      console.error('[Onboarding] Restart error:', err);
    }
    // Reset all local state
    setScanId(null);
    setProgress(null);
    setContacts([]);
    setContactsTotal(0);
    setImportResult(null);
    setError(null);
    setFilter('all');
    setStep('config');
  };

  // Reject all visible
  const handleRejectAll = async () => {
    const pending = filteredContacts.filter((c) => c.status === 'pending');
    const batchSize = 20;

    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      await Promise.all(
        batch.map((contact) =>
          api.onboarding.updateContact(contact.id, { status: 'rejected' }).catch(() => {}),
        ),
      );
      setContacts((prev) => {
        const batchIds = new Set(batch.map((c) => c.id));
        return prev.map((c) => batchIds.has(c.id) ? { ...c, status: 'rejected' as const } : c);
      });
    }
  };

  // Commit and finish — fires async, polls for completion
  const handleCommit = async () => {
    if (!scanId) return;
    setImporting(true);
    setError(null);
    try {
      await api.onboarding.commitContacts(scanId);

      // Poll for commit completion
      const pollCommit = setInterval(async () => {
        try {
          const result = await api.onboarding.getScanProgress(scanId) as { data: OnboardingScanProgress & { status: string } };
          const status = result.data.status;
          if (status === 'committed') {
            clearInterval(pollCommit);
            setImportResult({ imported: acceptedCount });
            setImporting(false);
            setStep('complete');
          } else if (status === 'commit_failed') {
            clearInterval(pollCommit);
            setError('Import failed. Try again or restart the scan.');
            setImporting(false);
          }
        } catch {
          // Keep polling
        }
      }, 2000);
    } catch (err) {
      setError('Failed to start import.');
      setImporting(false);
      console.error('[Onboarding] Commit error:', err);
    }
  };

  const filteredContacts = filter === 'all'
    ? contacts
    : contacts.filter((c) => c.deal_status === filter);

  const acceptedCount = contacts.filter((c) => c.status === 'accepted').length;
  const rejectedCount = contacts.filter((c) => c.status === 'rejected').length;
  const pendingInFilter = filteredContacts.filter((c) => c.status === 'pending').length;

  // Count per deal_status for filter pills
  const statusCounts = contacts.reduce((acc, c) => {
    const ds = c.deal_status || 'unclassified';
    acc[ds] = (acc[ds] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Step: Config */}
      {step === 'config' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '20px', marginBottom: '4px' }}>&#128270;</div>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
              Welcome to PitchLink
            </div>
            <div style={{ fontSize: '12px', color: 'var(--pl-text-secondary)' }}>
              Scan your inbox to import contacts and classify deals automatically.
            </div>
          </div>

          {/* Time Range */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
              Time Range
            </label>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {TIME_RANGES.map((tr) => (
                <button
                  key={tr.value}
                  onClick={() => setTimeRange(tr.value)}
                  style={{
                    padding: '5px 10px',
                    fontSize: '12px',
                    border: timeRange === tr.value ? '1px solid #2563EB' : '1px solid var(--pl-border-secondary)',
                    borderRadius: '6px',
                    backgroundColor: timeRange === tr.value ? '#2563EB' : 'transparent',
                    color: timeRange === tr.value ? '#FFFFFF' : 'var(--pl-text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Min Interactions */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
              Minimum Interactions
            </label>
            <select
              value={minInteractions}
              onChange={(e) => setMinInteractions(parseInt(e.target.value, 10))}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid var(--pl-border-secondary)',
                backgroundColor: 'var(--pl-bg-primary)',
                color: 'var(--pl-text-primary)',
              }}
            >
              <option value={1}>1+ interactions (all contacts)</option>
              <option value={2}>2+ interactions</option>
              <option value={3}>3+ interactions</option>
              <option value={5}>5+ interactions</option>
            </select>
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: '#EF4444', marginBottom: '8px' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleStartScan}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              cursor: 'pointer',
              marginBottom: '8px',
            }}
          >
            Scan My Inbox
          </button>
          <button
            onClick={onSkip}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '12px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: 'var(--pl-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            Skip for now
          </button>
        </div>
      )}

      {/* Step: Progress */}
      {step === 'progress' && progress && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', marginBottom: '8px' }}>
            {statusIcon(progress.status)}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
            {statusLabel(progress.status)}
          </div>

          {/* Progress bar */}
          {progress.scanned_messages > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{
                height: '6px',
                borderRadius: '3px',
                backgroundColor: 'var(--pl-bg-tertiary)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  // During scanning, show progress as scanned/total_listed. Both grow together
                  // so we pulse between 60-90% to show activity. When classifying/drafting, show 100%.
                  width: progress.status === 'scanning'
                    ? `${Math.min(95, (progress.scanned_messages / Math.max(progress.total_messages, progress.scanned_messages + 1)) * 100)}%`
                    : '100%',
                  backgroundColor: '#2563EB',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', marginTop: '4px' }}>
                {progress.scanned_messages.toLocaleString()} messages scanned
              </div>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', color: 'var(--pl-text-secondary)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--pl-text-primary)' }}>
                {progress.total_contacts_found}
              </div>
              contacts
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--pl-text-primary)' }}>
                {progress.classified_contacts}
              </div>
              classified
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '16px', color: 'var(--pl-text-primary)' }}>
                {progress.drafts_created}
              </div>
              drafts
            </div>
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: '#EF4444', marginTop: '12px' }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>
              Review Contacts ({filter === 'all' ? contactsTotal : `${filteredContacts.length}/${contactsTotal}`})
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={handleAcceptAll}
                disabled={pendingInFilter === 0}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  border: '1px solid #10B981',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  color: pendingInFilter > 0 ? '#10B981' : 'var(--pl-text-tertiary)',
                  cursor: pendingInFilter > 0 ? 'pointer' : 'default',
                }}
              >
                {filter === 'all' ? `Accept All (${pendingInFilter})` : `Accept ${pendingInFilter}`}
              </button>
              {filter !== 'all' && pendingInFilter > 0 && (
                <button
                  onClick={handleRejectAll}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    border: '1px solid #EF4444',
                    borderRadius: '4px',
                    backgroundColor: 'transparent',
                    color: '#EF4444',
                    cursor: 'pointer',
                  }}
                >
                  Reject {pendingInFilter}
                </button>
              )}
            </div>
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <FilterPill label={`All (${contacts.length})`} active={filter === 'all'} onClick={() => setFilter('all')} />
            {(Object.keys(DEAL_STATUS_LABELS) as DealStatus[]).map((ds) => {
              const count = statusCounts[ds] || 0;
              if (count === 0) return null;
              return (
                <FilterPill
                  key={ds}
                  label={`${DEAL_STATUS_LABELS[ds].label} (${count})`}
                  color={DEAL_STATUS_LABELS[ds].color}
                  active={filter === ds}
                  onClick={() => setFilter(ds)}
                />
              );
            })}
          </div>

          {/* Contact list */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {filteredContacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onAccept={() => handleContactAction(contact.id, 'accepted')}
                onReject={() => handleContactAction(contact.id, 'rejected')}
              />
            ))}
            {filteredContacts.length === 0 && (
              <div style={{ fontSize: '12px', color: 'var(--pl-text-tertiary)', textAlign: 'center', padding: '16px' }}>
                No contacts match this filter.
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid var(--pl-border-primary)' }}>
            <div style={{ fontSize: '11px', color: 'var(--pl-text-secondary)', marginBottom: '8px' }}>
              {acceptedCount} accepted, {rejectedCount} rejected, {contacts.length - acceptedCount - rejectedCount} pending
            </div>

            {error && (
              <div style={{ fontSize: '12px', color: '#EF4444', marginBottom: '8px' }}>
                {error}
              </div>
            )}

            <button
              onClick={handleCommit}
              disabled={acceptedCount === 0 || importing}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '6px',
                backgroundColor: acceptedCount > 0 ? '#2563EB' : 'var(--pl-bg-tertiary)',
                color: acceptedCount > 0 ? '#FFFFFF' : 'var(--pl-text-tertiary)',
                cursor: acceptedCount > 0 ? 'pointer' : 'default',
                marginBottom: '6px',
              }}
            >
              {importing ? 'Importing...' : `Import ${acceptedCount} Contact${acceptedCount !== 1 ? 's' : ''}`}
            </button>
            <button
              onClick={handleRestart}
              style={{
                width: '100%',
                padding: '6px',
                fontSize: '11px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                color: 'var(--pl-text-tertiary)',
                cursor: 'pointer',
              }}
            >
              Restart Scan
            </button>
          </div>
        </div>
      )}

      {/* Step: Complete */}
      {step === 'complete' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>&#9989;</div>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
            Onboarding Complete
          </div>
          <div style={{ fontSize: '13px', color: 'var(--pl-text-secondary)', marginBottom: '16px' }}>
            {importResult?.imported || 0} contact{(importResult?.imported || 0) !== 1 ? 's' : ''} imported into PitchLink.
          </div>

          {progress && progress.drafts_created > 0 && (
            <div style={{
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--pl-bg-secondary)',
              fontSize: '12px',
              color: 'var(--pl-text-secondary)',
              marginBottom: '12px',
            }}>
              {progress.drafts_created} follow-up draft{progress.drafts_created !== 1 ? 's' : ''} saved to your Gmail Drafts folder.
            </div>
          )}

          {progress && progress.forwarding_addresses_found > 0 && (
            <div style={{
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: 'var(--pl-bg-secondary)',
              fontSize: '12px',
              color: 'var(--pl-text-secondary)',
              marginBottom: '12px',
            }}>
              {progress.forwarding_addresses_found} forwarding address{progress.forwarding_addresses_found !== 1 ? 'es' : ''} detected and added to Source Registry.
            </div>
          )}

          <button
            onClick={onComplete}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              cursor: 'pointer',
              marginBottom: '8px',
            }}
          >
            Start Using PitchLink
          </button>
          <button
            onClick={handleRestart}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: '12px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: 'var(--pl-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            Restart Scan
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ContactCard({
  contact,
  onAccept,
  onReject,
}: {
  contact: OnboardingContact;
  onAccept: () => void;
  onReject: () => void;
}) {
  const statusInfo = contact.deal_status ? DEAL_STATUS_LABELS[contact.deal_status] : null;
  const isDecided = contact.status === 'accepted' || contact.status === 'rejected';

  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: '6px',
        border: '1px solid var(--pl-border-primary)',
        marginBottom: '4px',
        backgroundColor: isDecided
          ? contact.status === 'accepted' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(107, 114, 128, 0.05)'
          : 'var(--pl-bg-primary)',
        opacity: contact.status === 'rejected' ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contact.name || contact.email}
          </div>
          {contact.name && (
            <div style={{ fontSize: '11px', color: 'var(--pl-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {contact.email}
            </div>
          )}
        </div>

        {!isDecided ? (
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
            <button
              onClick={onAccept}
              title="Accept"
              style={{
                width: '24px', height: '24px',
                border: '1px solid #10B981',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                color: '#10B981',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              &#10003;
            </button>
            <button
              onClick={onReject}
              title="Reject"
              style={{
                width: '24px', height: '24px',
                border: '1px solid #EF4444',
                borderRadius: '4px',
                backgroundColor: 'transparent',
                color: '#EF4444',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              &#10005;
            </button>
          </div>
        ) : (
          <div style={{ fontSize: '10px', color: contact.status === 'accepted' ? '#10B981' : '#6B7280', flexShrink: 0, marginLeft: '8px' }}>
            {contact.status === 'accepted' ? 'Accepted' : 'Rejected'}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
        {statusInfo && (
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '4px',
            backgroundColor: statusInfo.color + '20',
            color: statusInfo.color,
          }}>
            {statusInfo.label}
          </span>
        )}
        <span style={{ fontSize: '10px', color: 'var(--pl-text-tertiary)' }}>
          {contact.sent_count}&#8593; {contact.received_count}&#8595;
        </span>
        {contact.nudge_gmail_draft_id && (
          <span style={{ fontSize: '10px', color: '#F59E0B' }}>
            Draft saved
          </span>
        )}
        {contact.is_forwarding_address && (
          <span style={{ fontSize: '10px', color: '#8B5CF6' }}>
            Forwarding
          </span>
        )}
      </div>

      {contact.classification_reason && (
        <div style={{ fontSize: '10px', color: 'var(--pl-text-tertiary)', marginTop: '2px' }}>
          {contact.classification_reason}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '2px 8px',
        fontSize: '10px',
        border: active ? '1px solid ' + (color || '#2563EB') : '1px solid var(--pl-border-secondary)',
        borderRadius: '10px',
        backgroundColor: active ? (color || '#2563EB') + '20' : 'transparent',
        color: active ? (color || '#2563EB') : 'var(--pl-text-tertiary)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

// ============================================================
// Helpers
// ============================================================

function statusIcon(status: OnboardingScanStatus): string {
  switch (status) {
    case 'scanning': return '\u{1F50D}';
    case 'classifying': return '\u{1F9E0}';
    case 'drafting': return '\u{270F}\uFE0F';
    case 'complete': return '\u2705';
    case 'failed': return '\u274C';
    default: return '\u23F3';
  }
}

function statusLabel(status: OnboardingScanStatus): string {
  switch (status) {
    case 'pending': return 'Preparing scan...';
    case 'scanning': return 'Scanning your inbox...';
    case 'classifying': return 'Classifying deals with AI...';
    case 'drafting': return 'Drafting follow-ups...';
    case 'complete': return 'Scan complete!';
    case 'failed': return 'Scan failed';
    default: return status;
  }
}
