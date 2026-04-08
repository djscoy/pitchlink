import { useState, useEffect, useCallback } from 'react';
import type { Contact, PipelinePreset, PipelineStage, TransactionMode, IIEResult, Sequence, SequenceStep } from '@pitchlink/shared';

import { useModeColors } from '../hooks/useModeColors';
import { useToastContext } from '../ToastContext';
import { GmailAdapter, ThreadViewData } from '../../gmail-adapter/GmailAdapter';
import { api } from '../../utils/api';
import { ContactCardSkeleton } from '../components/Skeleton';
import { StageSelector } from '../components/StageSelector';
import { ForwardPrompt } from '../../iie/ForwardPrompt';
import { iieClient } from '../../iie/index';
import { ComposePanel } from './ComposePanel';

interface ContactPanelProps {
  thread: ThreadViewData;
  mode: TransactionMode;
  onNavigateToTab?: (tab: string) => void;
}

interface DealInfo {
  id: string;
  current_stage: string;
  campaign: {
    id: string;
    name: string;
    pipeline_preset: PipelinePreset;
  };
}

interface CampaignOption {
  id: string;
  name: string;
  mode: string;
  pipeline_preset_id: string;
  pipeline_preset?: PipelinePreset;
}

function formatFireTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  let relative: string;
  if (diffHours < 0) relative = 'overdue';
  else if (diffHours < 1) relative = 'fires soon';
  else if (diffHours < 24) relative = `fires in ${diffHours}h`;
  else relative = `fires in ${Math.round(diffHours / 24)}d`;

  const absolute = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ', ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  return `${relative} (${absolute})`;
}

export function ContactPanel({ thread, mode, onNavigateToTab }: ContactPanelProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [deals, setDeals] = useState<DealInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [showCompose, setShowCompose] = useState(false);

  // Enrichment state
  const [enrichmentData, setEnrichmentData] = useState<Record<string, unknown> | null>(null);
  const [showEnrichment, setShowEnrichment] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // Sequence enrollment state
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [enrollments, setEnrollments] = useState<{ id: string; sequence: { id: string; name: string; steps_json: SequenceStep[] }; current_step: number; status: string; pause_reason?: string; next_fire_at?: string }[]>([]);
  const [showEnroll, setShowEnroll] = useState(false);
  const [selectedSequenceId, setSelectedSequenceId] = useState('');
  const [enrollingDealId, setEnrollingDealId] = useState('');

  // IIE state
  const [iieResult, setIieResult] = useState<IIEResult | null>(null);
  const [iieComplete, setIieComplete] = useState(false);
  const [showForwardPrompt, setShowForwardPrompt] = useState(false);
  const [resolvedOriginalEmail, setResolvedOriginalEmail] = useState<string | null>(null);

  const showToast = useToastContext();
  const domain = GmailAdapter.extractDomain(
    resolvedOriginalEmail || thread.senderEmail,
  );
  const modeColors = useModeColors(mode);

  // Determine which email to display/lookup — original sender if forward resolved
  const displayEmail = resolvedOriginalEmail || thread.senderEmail;

  const loadContact = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.contacts.lookup(displayEmail) as { data: Contact | null };
      setContact(result.data);

      if (result.data) {
        setEditName(result.data.name || '');
        setEditNotes(result.data.notes || '');

        // Load deals for this contact
        try {
          const dealsResult = await api.deals.listByContact(result.data.id) as { data: DealInfo[] };
          setDeals(dealsResult.data || []);
        } catch (dealErr) {
          console.error('[ContactPanel] Failed to load deals:', dealErr);
        }
      }
    } catch (err) {
      console.error('[ContactPanel] Failed to load contact:', err);
    } finally {
      setLoading(false);
    }
  }, [displayEmail]);

  // Load campaigns for the current mode (for "Add to Campaign" dropdown)
  const loadCampaigns = useCallback(async () => {
    try {
      const result = await api.campaigns.list({ mode, status: 'active' }) as { data: { campaigns: CampaignOption[]; total: number } };
      setCampaigns(result.data?.campaigns || []);
    } catch (err) {
      console.error('[ContactPanel] Failed to load campaigns:', err);
    }
  }, [mode]);

  const loadEnrichment = useCallback(async () => {
    if (!contact) return;
    try {
      const res = await api.contacts.getEnrichment(contact.id) as { data: { summary: Record<string, unknown> } };
      if (res.data?.summary && Object.keys(res.data.summary).length > 0) {
        setEnrichmentData(res.data.summary);
      }
    } catch (err) {
      console.error('[ContactPanel] Failed to load enrichment:', err);
    }
  }, [contact]);

  useEffect(() => { loadEnrichment(); }, [loadEnrichment]);

  const loadSequences = useCallback(async () => {
    try {
      const res = await api.sequences.list({ mode }) as { data: { sequences: Sequence[] } };
      setSequences(res.data?.sequences || []);
    } catch (err) {
      console.error('[ContactPanel] Failed to load sequences:', err);
    }
  }, [mode]);

  const loadEnrollments = useCallback(async () => {
    if (deals.length === 0) return;
    try {
      const allEnrollments: typeof enrollments = [];
      for (const deal of deals) {
        const res = await api.sequences.enrollmentsByDeal(deal.id) as { data: typeof enrollments };
        if (res.data) allEnrollments.push(...res.data);
      }
      setEnrollments(allEnrollments);
    } catch (err) {
      console.error('[ContactPanel] Failed to load enrollments:', err);
    }
  }, [deals]);

  useEffect(() => { loadSequences(); }, [loadSequences]);
  useEffect(() => { loadEnrollments(); }, [loadEnrollments]);

  // Wait for IIE to complete before loading contact — prevents race condition
  // where forwarded emails get looked up with the forwarding address
  useEffect(() => {
    if (iieComplete) {
      loadContact();
    }
  }, [iieComplete, loadContact]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Run IIE analysis when thread opens
  // If messageId is missing (page reload race), use threadId as fallback
  useEffect(() => {
    if (!thread.messageId && !thread.threadId) {
      // No IDs at all — skip IIE, allow contact load with sender email
      setIieComplete(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Use messageId if available, fall back to threadId
        const result = await iieClient.analyzeMessage(
          thread.messageId || thread.threadId,
          thread.threadId,
        );
        if (cancelled) return;

        setIieResult(result);

        if (iieClient.isResolved(result)) {
          // Forward resolved — load original sender's contact
          setResolvedOriginalEmail(result.original_sender_email!);
        } else if (iieClient.shouldShowPrompt(result)) {
          setShowForwardPrompt(true);
        }
      } catch (err) {
        console.error('[ContactPanel] IIE analysis failed:', err);
      } finally {
        if (!cancelled) {
          setIieComplete(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [thread.messageId, thread.threadId]);

  const handleForwardConfirm = async (email: string, name?: string) => {
    try {
      await iieClient.confirmAttribution({
        forwarding_email: thread.senderEmail,
        original_sender_email: email,
        original_sender_name: name,
        is_forward: true,
      });
      setShowForwardPrompt(false);
      setResolvedOriginalEmail(email);
    } catch (err) {
      console.error('[ContactPanel] Forward confirm failed:', err);
    }
  };

  const handleNotForward = async () => {
    try {
      await iieClient.confirmAttribution({
        forwarding_email: thread.senderEmail,
        original_sender_email: '',
        is_forward: false,
      });
      setShowForwardPrompt(false);
    } catch (err) {
      console.error('[ContactPanel] Not-forward confirm failed:', err);
    }
  };

  const handleAddContact = async () => {
    try {
      // Use resolved original sender email when IIE detected a forward
      const contactEmail = displayEmail;
      const contactName = resolvedOriginalEmail
        ? (iieResult?.original_sender_name || thread.senderName || '')
        : (thread.senderName || '');
      const result = await api.contacts.create({
        email: contactEmail,
        name: contactName,
        domain,
      }) as { data: Contact };

      setContact(result.data);
      setEditName(result.data.name || '');
    } catch (err) {
      console.error('[ContactPanel] Failed to create contact:', err);
    }
  };

  const handleSaveEdit = async () => {
    if (!contact) return;
    try {
      const result = await api.contacts.update(contact.id, {
        name: editName,
        notes: editNotes,
      }) as { data: Contact };

      setContact(result.data);
      setIsEditing(false);
    } catch (err) {
      console.error('[ContactPanel] Failed to update contact:', err);
    }
  };

  const handleStageChange = async (dealId: string, newStage: string) => {
    try {
      await api.deals.changeStage(dealId, newStage);
      await loadContact();
      showToast('Stage updated', 'success');
    } catch (err) {
      console.error('[ContactPanel] Failed to change stage:', err);
      showToast('Failed to change stage', 'error');
    }
  };

  const handleEnrich = async () => {
    if (!contact) return;
    setEnriching(true);
    setEnrichError(null);
    try {
      const res = await api.contacts.enrich(contact.id) as { data: { data: Record<string, unknown>; providers_used: string[] } };
      setEnrichmentData(res.data.data);
      setShowEnrichment(true);
      // Reload contact to get updated enrichment_status
      loadContact();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Enrichment failed';
      setEnrichError(msg);
    } finally {
      setEnriching(false);
    }
  };

  const handleEnroll = async () => {
    if (!selectedSequenceId || !enrollingDealId) return;
    try {
      await api.sequences.enroll(selectedSequenceId, enrollingDealId);
      setShowEnroll(false);
      setSelectedSequenceId('');
      setEnrollingDealId('');
      loadEnrollments();
      showToast('Contact enrolled in sequence', 'success');
    } catch (err) {
      console.error('[ContactPanel] Failed to enroll:', err);
      showToast('Failed to enroll in sequence', 'error');
    }
  };

  // Sequence action error state
  const [seqActionError, setSeqActionError] = useState<string | null>(null);

  const handlePauseEnrollment = async (enrollmentId: string) => {
    setSeqActionError(null);
    try {
      await api.sequences.pauseEnrollment(enrollmentId);
      loadEnrollments();
    } catch (err) {
      console.error('[ContactPanel] Failed to pause enrollment:', err);
      setSeqActionError('Failed to pause sequence');
    }
  };

  const handleResumeEnrollment = async (enrollmentId: string) => {
    setSeqActionError(null);
    try {
      await api.sequences.resumeEnrollment(enrollmentId);
      loadEnrollments();
    } catch (err) {
      console.error('[ContactPanel] Failed to resume enrollment:', err);
      setSeqActionError('Failed to resume sequence');
    }
  };

  const handleCancelEnrollment = async (enrollmentId: string) => {
    setSeqActionError(null);
    try {
      await api.sequences.cancelEnrollment(enrollmentId);
      loadEnrollments();
    } catch (err) {
      console.error('[ContactPanel] Failed to cancel enrollment:', err);
      setSeqActionError('Failed to cancel enrollment');
    }
  };

  const handleSkipStep = async (enrollmentId: string) => {
    setSeqActionError(null);
    try {
      await api.sequences.skipStep(enrollmentId);
      loadEnrollments();
    } catch (err) {
      console.error('[ContactPanel] Failed to skip step:', err);
      setSeqActionError('Failed to skip step');
    }
  };

  const handleAddToCampaign = async () => {
    if (!contact || !selectedCampaignId) return;
    const campaign = campaigns.find((c) => c.id === selectedCampaignId);
    if (!campaign) return;

    // Get the first stage of the pipeline preset as initial stage
    let initialStage = '';
    try {
      const presetResult = await api.presets.get(campaign.pipeline_preset_id) as { data: PipelinePreset };
      const stages = (presetResult.data?.stages_json || []) as PipelineStage[];
      initialStage = stages.length > 0 ? stages[0].id : '';
    } catch {
      console.error('[ContactPanel] Failed to load preset');
      return;
    }

    try {
      await api.deals.create({
        contact_id: contact.id,
        campaign_id: selectedCampaignId,
        mode,
        initial_stage: initialStage,
      });
      setShowAddDeal(false);
      setSelectedCampaignId('');
      await loadContact();
    } catch (err) {
      console.error('[ContactPanel] Failed to add to campaign:', err);
    }
  };

  if (loading) return <ContactCardSkeleton />;

  // --- Forward Prompt (Layer 4) ---
  const forwardBanner = showForwardPrompt ? (
    <ForwardPrompt
      senderEmail={thread.senderEmail}
      bestGuess={iieResult?.original_sender_email}
      bestGuessName={iieResult?.original_sender_name}
      onConfirm={handleForwardConfirm}
      onNotForward={handleNotForward}
    />
  ) : resolvedOriginalEmail ? (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: '6px',
        backgroundColor: 'var(--pl-bg-secondary)',
        border: '1px solid var(--pl-border-secondary)',
        fontSize: '11px',
        color: 'var(--pl-text-secondary)',
        marginBottom: '8px',
      }}
    >
      Forwarded from <strong>{thread.senderEmail}</strong>
    </div>
  ) : null;

  // --- New Contact Card ---
  if (!contact) {
    return (
      <div>
        {forwardBanner}
        <div
          style={{
            padding: '16px 12px',
            borderRadius: '8px',
            border: '1px dashed var(--pl-border-secondary)',
            backgroundColor: 'var(--pl-bg-secondary)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
            New Contact
          </div>
          <div style={{ fontSize: '12px', color: 'var(--pl-text-secondary)', marginBottom: '4px' }}>
            {resolvedOriginalEmail
              ? (iieResult?.original_sender_name || displayEmail)
              : (thread.senderName || displayEmail)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', marginBottom: '12px' }}>
            {displayEmail} &middot; {domain}
          </div>
          <button
            onClick={handleAddContact}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              backgroundColor: modeColors.color,
              color: 'var(--pl-text-inverse)',
              cursor: 'pointer',
            }}
          >
            + Add to PitchLink
          </button>
        </div>
      </div>
    );
  }

  // --- Existing Contact Card ---
  return (
    <div>
      {forwardBanner}
      <div className="pl-card">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            {isEditing ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Contact name"
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  border: '1px solid var(--pl-border-secondary)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  backgroundColor: 'var(--pl-bg-primary)',
                  color: 'var(--pl-text-primary)',
                  width: '100%',
                }}
              />
            ) : (
              <div style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {contact.name || contact.email}
                {contact.enrichment_status && contact.enrichment_status !== 'none' && (
                  <span
                    className={`pl-enrichment-${contact.enrichment_status === 'full' ? 'full' : 'partial'}`}
                    title={`Enrichment: ${contact.enrichment_status}`}
                  />
                )}
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--pl-text-secondary)', marginTop: '2px' }}>
              {contact.email}
            </div>
            {contact.domain && (
              <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', marginTop: '1px' }}>
                {contact.domain}
              </div>
            )}
          </div>

          <button
            onClick={() => {
              if (isEditing) handleSaveEdit();
              else setIsEditing(true);
            }}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '11px',
              color: 'var(--pl-text-secondary)',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            {isEditing ? 'Save' : 'Edit'}
          </button>
        </div>

        {/* Tags */}
        {contact.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
            {contact.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: '1px 6px',
                  fontSize: '10px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--pl-bg-tertiary)',
                  color: 'var(--pl-text-secondary)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Notes (editing) */}
        {isEditing && (
          <textarea
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Notes..."
            rows={3}
            style={{
              width: '100%',
              marginTop: '8px',
              padding: '6px 8px',
              fontSize: '12px',
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-bg-primary)',
              color: 'var(--pl-text-primary)',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        )}

        {/* Notes (display) */}
        {!isEditing && contact.notes && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--pl-text-secondary)' }}>
            {contact.notes}
          </div>
        )}

        {/* Action buttons row */}
        <div style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={handleEnrich}
            disabled={enriching}
            style={{
              padding: '3px 10px',
              fontSize: '11px',
              fontWeight: 600,
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: enriching ? 'var(--pl-bg-tertiary)' : 'transparent',
              color: enriching ? 'var(--pl-text-tertiary)' : 'var(--pl-text-secondary)',
              cursor: enriching ? 'not-allowed' : 'pointer',
            }}
          >
            {enriching ? 'Enriching...' : contact.enrichment_status === 'none' ? 'Enrich' : 'Re-enrich'}
          </button>
          {enrichmentData && (
            <button
              onClick={() => setShowEnrichment(!showEnrichment)}
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: showEnrichment ? 'var(--pl-bg-tertiary)' : 'transparent',
                color: 'var(--pl-text-tertiary)',
                cursor: 'pointer',
              }}
            >
              {showEnrichment ? 'Hide data' : 'Show data'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowCompose(!showCompose)}
            style={{
              padding: '3px 10px',
              fontSize: '11px',
              fontWeight: 600,
              border: `1px solid ${modeColors.color}`,
              borderRadius: '4px',
              backgroundColor: showCompose ? modeColors.color : 'transparent',
              color: showCompose ? 'var(--pl-text-inverse)' : modeColors.color,
              cursor: 'pointer',
            }}
          >
            {showCompose ? 'Close' : 'Compose'}
          </button>
        </div>
        {enrichError && (
          <div style={{ fontSize: '11px', color: 'var(--pl-error)', marginTop: '4px' }}>{enrichError}</div>
        )}
      </div>

      {/* Enrichment Data */}
      {showEnrichment && enrichmentData && (
        <div className="pl-card" style={{ marginTop: '6px', padding: '10px' }}>
          <EnrichmentDataDisplay data={enrichmentData} />
        </div>
      )}

      {/* AI Compose Panel */}
      {showCompose && (
        <ComposePanel
          mode={mode}
          contactEmail={contact.email}
          contactName={contact.name}
          contactDomain={contact.domain}
          campaignName={deals.length > 0 ? deals[0].campaign.name : undefined}
          currentStage={deals.length > 0 ? deals[0].current_stage : undefined}
          threadSubject={thread.subject}
          threadId={thread.threadId !== 'pending' ? thread.threadId : undefined}
          onClose={() => setShowCompose(false)}
        />
      )}

      {/* Deals / Campaigns */}
      <div style={{ marginTop: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Campaigns
          </div>
          {campaigns.length > 0 && !showAddDeal && (
            <button
              onClick={() => setShowAddDeal(true)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '11px',
                color: modeColors.color,
                cursor: 'pointer',
                padding: '0 4px',
              }}
            >
              + Add
            </button>
          )}
        </div>

        {/* Add to campaign form */}
        {showAddDeal && (
          <div className="pl-card" style={{ padding: '8px 10px', marginBottom: '6px' }}>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              style={{
                width: '100%',
                padding: '4px 6px',
                fontSize: '12px',
                borderRadius: '4px',
                border: '1px solid var(--pl-border-secondary)',
                backgroundColor: 'var(--pl-bg-primary)',
                color: 'var(--pl-text-primary)',
                marginBottom: '6px',
              }}
            >
              <option value="">Select campaign...</option>
              {campaigns
                .filter((c) => !deals.some((d) => d.campaign.id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowAddDeal(false); setSelectedCampaignId(''); }}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
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
                onClick={handleAddToCampaign}
                disabled={!selectedCampaignId}
                style={{
                  padding: '3px 8px',
                  fontSize: '11px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: selectedCampaignId ? modeColors.color : 'var(--pl-bg-tertiary)',
                  color: selectedCampaignId ? 'var(--pl-text-inverse)' : 'var(--pl-text-tertiary)',
                  cursor: selectedCampaignId ? 'pointer' : 'default',
                }}
              >
                Assign
              </button>
            </div>
          </div>
        )}

        {deals.length === 0 && !showAddDeal && (
          <div style={{ fontSize: '12px', color: 'var(--pl-text-tertiary)', fontStyle: 'italic' }}>
            Not assigned to any campaign
          </div>
        )}

        {deals.map((deal) => {
          const stages = (deal.campaign.pipeline_preset?.stages_json || []) as PipelineStage[];
          return (
            <div key={deal.id} className="pl-card" style={{ padding: '8px 10px', marginBottom: '4px' }}>
              <div style={{ fontSize: '12px', fontWeight: 500, marginBottom: '4px' }}>
                {deal.campaign.name}
              </div>
              <StageSelector
                stages={stages}
                currentStageId={deal.current_stage}
                onSelect={(stageId) => handleStageChange(deal.id, stageId)}
              />
            </div>
          );
        })}
      </div>

      {/* Sequence Enrollments */}
      {deals.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Sequences
            </div>
            {!showEnroll && (
              sequences.length > 0 ? (
                <button
                  onClick={() => {
                    setShowEnroll(true);
                    // Auto-select deal if only one exists
                    if (deals.length === 1) {
                      setEnrollingDealId(deals[0].id);
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '11px',
                    color: modeColors.color,
                    cursor: 'pointer',
                    padding: '0 4px',
                  }}
                >
                  + Enroll
                </button>
              ) : (
                <button
                  onClick={() => onNavigateToTab?.('nudges')}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '11px',
                    color: modeColors.color,
                    cursor: 'pointer',
                    padding: '0 4px',
                  }}
                  title="Go to Nudges tab to create a sequence"
                >
                  Create one &rarr;
                </button>
              )
            )}
          </div>

          {/* Enroll form */}
          {showEnroll && (
            <div className="pl-card" style={{ padding: '8px 10px', marginBottom: '6px' }}>
              {/* Only show deal selector if multiple deals */}
              {deals.length > 1 && (
                <select
                  value={enrollingDealId}
                  onChange={(e) => setEnrollingDealId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: '12px',
                    borderRadius: '4px',
                    border: '1px solid var(--pl-border-secondary)',
                    backgroundColor: 'var(--pl-bg-primary)',
                    color: 'var(--pl-text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  <option value="">Select campaign...</option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>{d.campaign.name}</option>
                  ))}
                </select>
              )}
              <select
                value={selectedSequenceId}
                onChange={(e) => setSelectedSequenceId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: '12px',
                  borderRadius: '4px',
                  border: '1px solid var(--pl-border-secondary)',
                  backgroundColor: 'var(--pl-bg-primary)',
                  color: 'var(--pl-text-primary)',
                  marginBottom: '6px',
                }}
              >
                <option value="">Select sequence...</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({(s.steps_json || []).length} steps)
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowEnroll(false); setSelectedSequenceId(''); setEnrollingDealId(''); }}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
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
                  onClick={handleEnroll}
                  disabled={!selectedSequenceId || !enrollingDealId}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    border: 'none',
                    borderRadius: '4px',
                    backgroundColor: selectedSequenceId && enrollingDealId ? modeColors.color : 'var(--pl-bg-tertiary)',
                    color: selectedSequenceId && enrollingDealId ? 'var(--pl-text-inverse)' : 'var(--pl-text-tertiary)',
                    cursor: selectedSequenceId && enrollingDealId ? 'pointer' : 'default',
                  }}
                >
                  Enroll
                </button>
              </div>
            </div>
          )}

          {/* Sequence action error */}
          {seqActionError && (
            <div style={{ fontSize: '11px', color: 'var(--pl-error)', marginBottom: '6px' }}>
              {seqActionError}
            </div>
          )}

          {/* Active enrollments */}
          {enrollments.filter((e) => e.status === 'active' || e.status === 'paused').map((enrollment) => {
            const totalSteps = enrollment.sequence.steps_json?.length || 0;
            const stepLabel = `Step ${enrollment.current_step + 1}/${totalSteps}`;
            const isActive = enrollment.status === 'active';
            const isPaused = enrollment.status === 'paused';

            return (
              <div key={enrollment.id} className="pl-card" style={{
                padding: '10px 12px', marginBottom: '6px',
                borderLeft: `3px solid ${isActive ? 'var(--pl-success, #22C55E)' : 'var(--pl-warning, #F59E0B)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{
                    display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                    backgroundColor: isActive ? 'var(--pl-success, #22C55E)' : 'var(--pl-warning, #F59E0B)',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--pl-text-primary)' }}>
                    {enrollment.sequence.name}
                  </span>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--pl-text-secondary)', marginBottom: '8px', paddingLeft: '14px' }}>
                  {stepLabel}
                  {isPaused && (
                    <span style={{ color: 'var(--pl-warning, #F59E0B)' }}>
                      {' '}&middot; paused{enrollment.pause_reason && ` (${enrollment.pause_reason === 'reply_received' ? 'replied' : enrollment.pause_reason})`}
                    </span>
                  )}
                  {isActive && enrollment.next_fire_at && (
                    <span> &middot; {formatFireTime(enrollment.next_fire_at)}</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '4px', paddingLeft: '14px' }}>
                  {isPaused ? (
                    <button
                      onClick={() => handleResumeEnrollment(enrollment.id)}
                      aria-label="Resume sequence"
                      style={{
                        padding: '2px 8px', fontSize: '10px', fontWeight: 600, border: 'none',
                        borderRadius: '4px', backgroundColor: modeColors.color,
                        color: 'var(--pl-text-inverse)', cursor: 'pointer',
                      }}
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePauseEnrollment(enrollment.id)}
                      aria-label="Pause sequence"
                      style={{
                        padding: '2px 8px', fontSize: '10px',
                        border: '1px solid var(--pl-border-secondary)', borderRadius: '4px',
                        backgroundColor: 'transparent', color: 'var(--pl-text-secondary)', cursor: 'pointer',
                      }}
                    >
                      Pause
                    </button>
                  )}
                  {isActive && (
                    <button
                      onClick={() => handleSkipStep(enrollment.id)}
                      aria-label="Skip current step"
                      style={{
                        padding: '2px 8px', fontSize: '10px',
                        border: '1px solid var(--pl-border-secondary)', borderRadius: '4px',
                        backgroundColor: 'transparent', color: 'var(--pl-text-secondary)', cursor: 'pointer',
                      }}
                    >
                      Skip Step
                    </button>
                  )}
                  <button
                    onClick={() => handleCancelEnrollment(enrollment.id)}
                    aria-label="Cancel enrollment"
                    style={{
                      padding: '2px 8px', fontSize: '10px',
                      border: '1px solid var(--pl-border-secondary)', borderRadius: '4px',
                      backgroundColor: 'transparent', color: 'var(--pl-text-tertiary)', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })}

          {enrollments.length === 0 && !showEnroll && (
            <div style={{ fontSize: '12px', color: 'var(--pl-text-tertiary)', fontStyle: 'italic' }}>
              Not enrolled in any sequence
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Enrichment Data Display ---

const ENRICHMENT_SECTIONS: { label: string; keys: string[] }[] = [
  { label: 'Contact', keys: ['full_name', 'first_name', 'last_name', 'job_title', 'position', 'company', 'company_name', 'location', 'city', 'country', 'phone'] },
  { label: 'Company', keys: ['company_size', 'employee_count', 'industry', 'revenue', 'funding', 'tech_stack', 'founded'] },
  { label: 'Social', keys: ['linkedin', 'linkedin_url', 'twitter', 'twitter_url', 'github', 'github_url', 'facebook', 'website'] },
  { label: 'SEO', keys: ['domain_rating', 'monthly_traffic', 'spam_score', 'backlinks', 'referring_domains', 'niche'] },
];

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^www\./i.test(value);
}

function EnrichmentDataDisplay({ data }: { data: Record<string, unknown> }) {
  const flatEntries = Object.entries(data).filter(
    ([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object'
  );

  const usedKeys = new Set<string>();
  const sections: { label: string; entries: [string, unknown][] }[] = [];

  for (const section of ENRICHMENT_SECTIONS) {
    const entries = flatEntries.filter(([k]) => section.keys.includes(k));
    if (entries.length > 0) {
      sections.push({ label: section.label, entries });
      entries.forEach(([k]) => usedKeys.add(k));
    }
  }

  // Remaining keys that don't fit any section
  const otherEntries = flatEntries.filter(([k]) => !usedKeys.has(k));
  if (otherEntries.length > 0) {
    sections.push({ label: 'Other', entries: otherEntries });
  }

  if (sections.length === 0) {
    return <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)' }}>No enrichment data available.</div>;
  }

  return (
    <div>
      {sections.map((section) => (
        <div key={section.label} style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--pl-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
            {section.label}
          </div>
          {section.entries.map(([key, value]) => {
            const strValue = String(value);
            const clickable = isUrl(strValue);
            return (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '11px' }}>
                <span style={{ color: 'var(--pl-text-tertiary)', textTransform: 'capitalize' }}>
                  {key.replace(/_/g, ' ')}
                </span>
                {clickable ? (
                  <a
                    href={strValue.startsWith('http') ? strValue : `https://${strValue}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--pl-info)',
                      maxWidth: '60%',
                      textAlign: 'right',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: 'none',
                    }}
                  >
                    {strValue.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                ) : (
                  <span style={{ color: 'var(--pl-text-primary)', maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {strValue}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
