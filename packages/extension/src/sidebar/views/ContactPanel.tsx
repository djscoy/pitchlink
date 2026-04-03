import { useState, useEffect, useCallback } from 'react';
import type { Contact, PipelinePreset, PipelineStage, TransactionMode, IIEResult } from '@pitchlink/shared';
import { MODE_CONFIG } from '@pitchlink/shared';
import { GmailAdapter, ThreadViewData } from '../../gmail-adapter/GmailAdapter';
import { api } from '../../utils/api';
import { ContactCardSkeleton } from '../components/Skeleton';
import { StageSelector } from '../components/StageSelector';
import { ForwardPrompt } from '../../iie/ForwardPrompt';
import { iieClient } from '../../iie/index';

interface ContactPanelProps {
  thread: ThreadViewData;
  mode: TransactionMode;
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

export function ContactPanel({ thread, mode }: ContactPanelProps) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [deals] = useState<DealInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // IIE state
  const [iieResult, setIieResult] = useState<IIEResult | null>(null);
  const [showForwardPrompt, setShowForwardPrompt] = useState(false);
  const [resolvedOriginalEmail, setResolvedOriginalEmail] = useState<string | null>(null);

  const domain = GmailAdapter.extractDomain(
    resolvedOriginalEmail || thread.senderEmail,
  );
  const modeConfig = MODE_CONFIG[mode];

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
      }
    } catch (err) {
      console.error('[ContactPanel] Failed to load contact:', err);
    } finally {
      setLoading(false);
    }
  }, [displayEmail]);

  useEffect(() => {
    loadContact();
  }, [loadContact]);

  // Run IIE analysis when thread opens
  useEffect(() => {
    if (!thread.messageId) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await iieClient.analyzeMessage(thread.messageId, thread.threadId);
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
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [thread.messageId]);

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
      const result = await api.contacts.create({
        email: thread.senderEmail,
        name: thread.senderName || '',
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
      // Reload contact to refresh deal info
      await loadContact();
    } catch (err) {
      console.error('[ContactPanel] Failed to change stage:', err);
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
            {thread.senderName || thread.senderEmail}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', marginBottom: '12px' }}>
            {thread.senderEmail} &middot; {domain}
          </div>
          <button
            onClick={handleAddContact}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              backgroundColor: modeConfig.color,
              color: '#FFFFFF',
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
              <div style={{ fontSize: '14px', fontWeight: 600 }}>
                {contact.name || contact.email}
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

        {/* Enrichment badge */}
        <div style={{ marginTop: '8px' }}>
          <span className={`pl-badge pl-enrichment-${contact.enrichment_status}`}>
            {contact.enrichment_status === 'none' && 'Not enriched'}
            {contact.enrichment_status === 'partial' && 'Partially enriched'}
            {contact.enrichment_status === 'full' && 'Fully enriched'}
          </span>
        </div>
      </div>

      {/* Deals */}
      {deals.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--pl-text-tertiary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Campaigns
          </div>
          {deals.map((deal) => {
            const stages = (deal.campaign.pipeline_preset?.stages_json || []) as PipelineStage[];
            return (
              <div key={deal.id} className="pl-card" style={{ padding: '8px 10px' }}>
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
      )}
    </div>
  );
}
