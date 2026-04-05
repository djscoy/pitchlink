/**
 * Onboarding Scan Orchestrator — Coordinates the full inbox scan pipeline.
 *
 * Flow:
 *   1. Create scan record (pending)
 *   2. Phase 1: Header-only Gmail scan → aggregate contacts
 *   3. Phase 2: AI deal classification on contacts passing min_interactions
 *   4. Phase 3: Auto-draft nudges for "quoted_no_followup" contacts
 *   5. Save all discovered contacts to onboarding_contacts staging table
 *   6. Auto-detect forwarding addresses → pre-populate source_registry
 *
 * Runs asynchronously — progress tracked via onboarding_scans table.
 */

import { supabaseAdmin } from '../db/supabase';
import { gmailScanService } from './gmail-scan';
import { dealClassifierService, ClassificationInput } from './deal-classifier';
import { nudgeDrafterService, NudgeInput } from './nudge-drafter';

export const onboardingScanService = {
  /**
   * Start a new onboarding scan. Returns the scan ID immediately.
   * The actual scan runs asynchronously.
   */
  async startScan(
    workspaceId: string,
    userId: string,
    accessToken: string,
    userEmail: string,
    timeRangeDays: number,
    minInteractions: number,
    extraExcludeEmails?: string[],
  ): Promise<string> {
    // Create scan record
    const { data: scan, error } = await supabaseAdmin
      .from('onboarding_scans')
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        status: 'pending',
        time_range_days: timeRangeDays,
        min_interactions: minInteractions,
      })
      .select('id')
      .single();

    if (error || !scan) {
      throw new Error(`Failed to create scan: ${error?.message || 'unknown'}`);
    }

    const scanId = scan.id;

    // Run the scan pipeline asynchronously (don't await)
    this.runScanPipeline(scanId, workspaceId, userId, accessToken, userEmail, timeRangeDays, minInteractions, extraExcludeEmails)
      .catch((err) => {
        console.error(`[OnboardingScan] Pipeline failed for scan ${scanId}:`, err);
        this.updateScanStatus(scanId, 'failed', { error_message: err.message });
      });

    return scanId;
  },

  /**
   * Full scan pipeline — runs asynchronously.
   */
  async runScanPipeline(
    scanId: string,
    workspaceId: string,
    _userId: string,
    accessToken: string,
    userEmail: string,
    timeRangeDays: number,
    minInteractions: number,
    extraExcludeEmails?: string[],
  ): Promise<void> {
    // Load workspace settings for exclusion lists
    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('settings_json')
      .eq('id', workspaceId)
      .single();

    const settings = (workspace?.settings_json || {}) as { excluded_emails?: string[]; excluded_domains?: string[] };

    // Build exclusion sets from workspace settings + per-scan extras
    const excludeEmails = new Set<string>([
      ...(settings.excluded_emails || []).map((e: string) => e.toLowerCase()),
      ...(extraExcludeEmails || []).map((e: string) => e.toLowerCase()),
      userEmail.toLowerCase(), // always exclude the user's own email
    ]);
    const excludeDomains = new Set<string>(
      (settings.excluded_domains || []).map((d: string) => d.toLowerCase()),
    );

    console.log(`[OnboardingScan] Exclusions: ${excludeEmails.size} emails, ${excludeDomains.size} domains`);

    // Phase 1: Gmail scan
    await this.updateScanStatus(scanId, 'scanning', { started_at: new Date().toISOString() });

    const contacts = await gmailScanService.scanInbox(
      accessToken,
      userEmail,
      timeRangeDays,
      minInteractions,
      async (progress) => {
        // Update progress periodically (throttled by caller)
        await supabaseAdmin
          .from('onboarding_scans')
          .update({
            total_messages: progress.totalMessages,
            scanned_messages: progress.scannedMessages,
            total_contacts_found: progress.contactsFound,
            forwarding_addresses_found: progress.forwardingAddresses,
          })
          .eq('id', scanId);
      },
      excludeEmails,
      excludeDomains,
    );

    await supabaseAdmin
      .from('onboarding_scans')
      .update({
        total_contacts_found: contacts.size,
      })
      .eq('id', scanId);

    // Phase 2: Deal classification
    await this.updateScanStatus(scanId, 'classifying');

    const contactArray = Array.from(contacts.values());
    const classificationInputs: ClassificationInput[] = contactArray.map((c) => ({
      email: c.email,
      name: c.name,
      sentCount: c.sentCount,
      receivedCount: c.receivedCount,
      lastInteractionAt: c.lastInteractionAt,
    }));

    const classifications = await dealClassifierService.classifyBatch(classificationInputs);

    // Map classification results by email
    const classMap = new Map(classifications.map((c) => [c.email, c]));

    await supabaseAdmin
      .from('onboarding_scans')
      .update({ classified_contacts: classifications.length })
      .eq('id', scanId);

    // Phase 3: Auto-draft nudges for "quoted_no_followup"
    await this.updateScanStatus(scanId, 'drafting');

    const nudgeCandidates: NudgeInput[] = contactArray
      .filter((c) => {
        const cls = classMap.get(c.email);
        return cls?.dealStatus === 'quoted_no_followup';
      })
      .map((c) => ({
        email: c.email,
        name: c.name,
        domain: c.domain,
        sentCount: c.sentCount,
        receivedCount: c.receivedCount,
        classificationReason: classMap.get(c.email)?.reason || '',
      }));

    const savedDrafts = nudgeCandidates.length > 0
      ? await nudgeDrafterService.generateAndSaveDrafts(accessToken, nudgeCandidates)
      : [];

    const draftMap = new Map(savedDrafts.map((d) => [d.email, d]));

    await supabaseAdmin
      .from('onboarding_scans')
      .update({ drafts_created: savedDrafts.length })
      .eq('id', scanId);

    // Save all contacts to staging table
    const rows = contactArray.map((c) => {
      const cls = classMap.get(c.email);
      const draft = draftMap.get(c.email);
      return {
        scan_id: scanId,
        workspace_id: workspaceId,
        email: c.email,
        name: c.name,
        domain: c.domain,
        interaction_count: c.interactionCount,
        last_interaction_at: c.lastInteractionAt,
        sent_count: c.sentCount,
        received_count: c.receivedCount,
        deal_status: cls?.dealStatus || 'unclassified',
        deal_status_confidence: cls?.confidence || 0,
        classification_reason: cls?.reason,
        nudge_subject: draft?.subject,
        nudge_body: draft?.body,
        nudge_gmail_draft_id: draft?.gmailDraftId,
        is_forwarding_address: c.isForwardingAddress,
        forwards_to_email: c.forwardsToEmail,
        status: 'pending',
      };
    });

    // Insert in batches to avoid payload limits
    const insertBatchSize = 100;
    for (let i = 0; i < rows.length; i += insertBatchSize) {
      const batch = rows.slice(i, i + insertBatchSize);
      const { error: insertError } = await supabaseAdmin
        .from('onboarding_contacts')
        .insert(batch);

      if (insertError) {
        console.error('[OnboardingScan] Failed to insert contacts batch:', insertError);
      }
    }

    // Auto-populate source registry for forwarding addresses
    const forwardingContacts = contactArray.filter((c) => c.isForwardingAddress && c.forwardsToEmail);
    let fwdCount = 0;

    for (const fwd of forwardingContacts) {
      // Check if already in source registry
      const { data: existing } = await supabaseAdmin
        .from('source_registry')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('forwarding_email', fwd.email)
        .maybeSingle();

      if (!existing) {
        await supabaseAdmin
          .from('source_registry')
          .insert({
            workspace_id: workspaceId,
            forwarding_email: fwd.email,
            original_sender_email: fwd.forwardsToEmail,
            detection_method: 'header',
            confidence: 0.8,
          });
        fwdCount++;
      }
    }

    // Mark complete
    await this.updateScanStatus(scanId, 'complete', {
      completed_at: new Date().toISOString(),
      forwarding_addresses_found: fwdCount,
    });
  },

  /**
   * Get scan progress.
   */
  async getScanProgress(scanId: string, workspaceId: string) {
    const { data, error } = await supabaseAdmin
      .from('onboarding_scans')
      .select('id, status, total_messages, scanned_messages, total_contacts_found, classified_contacts, drafts_created, forwarding_addresses_found, error_message')
      .eq('id', scanId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) return null;
    return data;
  },

  /**
   * Get discovered contacts for a scan.
   */
  async getScanContacts(
    scanId: string,
    workspaceId: string,
    opts?: { status?: string; deal_status?: string; limit?: number; offset?: number },
  ) {
    let query = supabaseAdmin
      .from('onboarding_contacts')
      .select('*', { count: 'exact' })
      .eq('scan_id', scanId)
      .eq('workspace_id', workspaceId)
      .order('interaction_count', { ascending: false });

    if (opts?.status) query = query.eq('status', opts.status);
    if (opts?.deal_status) query = query.eq('deal_status', opts.deal_status);
    if (opts?.limit) query = query.limit(opts.limit);
    if (opts?.offset) query = query.range(opts.offset, opts.offset + (opts.limit || 50) - 1);

    const { data, count, error } = await query;
    if (error) throw error;
    return { contacts: data || [], total: count || 0 };
  },

  /**
   * Update a single onboarding contact (accept/reject/edit).
   */
  async updateContact(
    contactId: string,
    workspaceId: string,
    updates: { status?: string; name?: string; deal_status?: string },
  ) {
    const { data, error } = await supabaseAdmin
      .from('onboarding_contacts')
      .update(updates)
      .eq('id', contactId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Commit accepted onboarding contacts to the main contacts table.
   * Creates contacts and (optionally) assigns them to a campaign.
   */
  async commitContacts(
    scanId: string,
    workspaceId: string,
    campaignId?: string,
  ) {
    // Get all accepted contacts
    const { data: accepted, error } = await supabaseAdmin
      .from('onboarding_contacts')
      .select('*')
      .eq('scan_id', scanId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'accepted');

    if (error) throw error;
    if (!accepted || accepted.length === 0) return { imported: 0 };

    let imported = 0;

    for (const oc of accepted) {
      // Check if contact already exists
      const { data: existing } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('email', oc.email)
        .maybeSingle();

      let contactId: string;

      if (existing) {
        contactId = existing.id;
      } else {
        const { data: newContact, error: createError } = await supabaseAdmin
          .from('contacts')
          .insert({
            workspace_id: workspaceId,
            email: oc.email,
            name: oc.name,
            domain: oc.domain,
            tags: [],
            custom_fields: {},
            enrichment_status: 'none',
          })
          .select('id')
          .single();

        if (createError) {
          console.error(`[OnboardingScan] Failed to create contact ${oc.email}:`, createError);
          continue;
        }
        contactId = newContact.id;
      }

      // If campaign specified, create a deal
      if (campaignId) {
        // Get pipeline preset for the campaign
        const { data: campaign } = await supabaseAdmin
          .from('campaigns')
          .select('pipeline_preset_id, mode')
          .eq('id', campaignId)
          .single();

        if (campaign) {
          const { data: preset } = await supabaseAdmin
            .from('pipeline_presets')
            .select('stages_json')
            .eq('id', campaign.pipeline_preset_id)
            .single();

          const stages = (preset?.stages_json || []) as Array<{ id: string }>;
          const initialStage = stages.length > 0 ? stages[0].id : '';

          // Check if deal already exists
          const { data: existingDeal } = await supabaseAdmin
            .from('deals')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('contact_id', contactId)
            .eq('campaign_id', campaignId)
            .maybeSingle();

          if (!existingDeal) {
            await supabaseAdmin
              .from('deals')
              .insert({
                workspace_id: workspaceId,
                contact_id: contactId,
                campaign_id: campaignId,
                mode: campaign.mode,
                current_stage: initialStage,
                metadata: {},
              });
          }
        }
      }

      // Mark as imported
      await supabaseAdmin
        .from('onboarding_contacts')
        .update({ status: 'imported' })
        .eq('id', oc.id);

      imported++;
    }

    return { imported };
  },

  /**
   * Check if user has completed onboarding (has any completed scan).
   */
  async hasCompletedOnboarding(workspaceId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('onboarding_scans')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('status', 'complete')
      .limit(1);

    return (data?.length ?? 0) > 0;
  },

  /**
   * Update scan status and optional extra fields.
   */
  async updateScanStatus(
    scanId: string,
    status: string,
    extra?: Record<string, unknown>,
  ) {
    const update: Record<string, unknown> = { status, ...extra };
    await supabaseAdmin
      .from('onboarding_scans')
      .update(update)
      .eq('id', scanId);
  },
};
