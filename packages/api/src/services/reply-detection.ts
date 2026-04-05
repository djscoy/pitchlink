import { supabaseAdmin } from '../db/supabase';
import { gmailWatchService } from './gmail-watch';
import { dealsService } from './deals';
import { forwardDetectionService } from './forward-detection';
import { sourceRegistryService } from './source-registry';
import { extractEmail } from '../utils/email';
import { sequencesService } from './sequences';
import type { IIEResult } from '@pitchlink/shared';

/**
 * Reply Detection Service
 *
 * Processes Gmail Pub/Sub notifications to detect replies from tracked contacts.
 * Integrates with IIE (forward detection) — checks for forwards before reply detection.
 * When a reply is detected, optionally auto-advances the deal's pipeline stage.
 */
export const replyDetectionService = {
  /**
   * Process a Gmail Pub/Sub notification.
   * Called from the webhook endpoint.
   */
  async processNotification(emailAddress: string, historyId: string): Promise<void> {
    // 1. Find the user by email
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, workspace_id')
      .eq('email', emailAddress)
      .maybeSingle();

    if (userError || !user) {
      console.warn(`[ReplyDetection] No user found for email: ${emailAddress}`);
      return;
    }

    // 2. Get watch state to find the last known history ID
    const watchState = await gmailWatchService.getWatchState(user.id);
    if (!watchState?.access_token_encrypted) {
      console.warn(`[ReplyDetection] No watch state for user ${user.id}`);
      return;
    }

    const lastHistoryId = watchState.history_id;
    const accessToken = watchState.access_token_encrypted;

    // 3. Fetch Gmail history since last known history ID
    const messages = await this.fetchHistoryChanges(accessToken, lastHistoryId);

    // 4. Update stored history ID
    await gmailWatchService.updateHistoryId(user.id, historyId);

    if (messages.length === 0) return;

    // 5. Check each new message for forwards and replies
    for (const message of messages) {
      await this.checkMessage(user.id, user.workspace_id, accessToken, message.id);
    }
  },

  /**
   * Fetch history changes from Gmail API since the given historyId.
   */
  async fetchHistoryChanges(
    accessToken: string,
    startHistoryId: string | null,
  ): Promise<{ id: string; threadId: string }[]> {
    if (!startHistoryId) return [];

    try {
      const url = `https://www.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn('[ReplyDetection] History ID expired, skipping batch');
          return [];
        }
        throw new Error(`Gmail history fetch failed: ${response.status}`);
      }

      const data = await response.json();
      const messages: { id: string; threadId: string }[] = [];

      for (const record of data.history || []) {
        for (const added of record.messagesAdded || []) {
          if (added.message) {
            messages.push({
              id: added.message.id,
              threadId: added.message.threadId,
            });
          }
        }
      }

      return messages;
    } catch (err) {
      console.error('[ReplyDetection] Failed to fetch history:', err);
      return [];
    }
  },

  /**
   * Check a Gmail message for forwards (IIE) and replies.
   * Forward detection runs first. If it's a forward, attribute to original sender.
   * If not, proceed with standard reply detection.
   */
  async checkMessage(
    _userId: string,
    workspaceId: string,
    accessToken: string,
    messageId: string,
  ): Promise<void> {
    try {
      // Run forward detection first — this also fetches the full message
      const { iieResult, message } = await forwardDetectionService.detectForward(
        workspaceId,
        accessToken,
        messageId,
      );

      if (!message) return;

      const headers = message.payload?.headers || [];
      const fromHeader = headers.find(
        (h: { name: string }) => h.name.toLowerCase() === 'from',
      )?.value || '';
      const senderEmail = extractEmail(fromHeader);
      if (!senderEmail) return;

      // If forward detected with original sender, handle as forward
      if (iieResult.is_forwarded && iieResult.original_sender_email) {
        await this.handleForwardedMessage(
          workspaceId,
          messageId,
          senderEmail,
          iieResult,
        );
        return;
      }

      // Not a forward — proceed with standard reply detection
      await this.checkForReply(workspaceId, senderEmail, messageId);
    } catch (err) {
      console.error(`[ReplyDetection] Error checking message ${messageId}:`, err);
    }
  },

  /**
   * Handle a forwarded message — attribute to original sender.
   */
  async handleForwardedMessage(
    workspaceId: string,
    messageId: string,
    forwardingEmail: string,
    iieResult: IIEResult,
  ): Promise<void> {
    const originalEmail = iieResult.original_sender_email!;

    // Auto-create source registry entry if this wasn't already a registry hit
    if (iieResult.detection_layer !== 'registry') {
      try {
        await sourceRegistryService.create(workspaceId, {
          forwarding_email: forwardingEmail,
          original_sender_email: originalEmail,
          original_sender_name: iieResult.original_sender_name,
          detection_method: iieResult.detection_layer,
          confidence: iieResult.confidence,
        });
        console.log(
          `[IIE] Auto-created source registry: ${forwardingEmail} → ${originalEmail} (${iieResult.detection_layer})`,
        );
      } catch {
        // Upsert may conflict if entry already exists — that's fine
      }
    }

    // Look up or find the original sender as a contact
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('email', originalEmail.toLowerCase())
      .maybeSingle();

    if (!contact) {
      console.log(`[IIE] Original sender ${originalEmail} not a tracked contact`);
      return;
    }

    // Find active deals and log forward_detected activity
    const { data: deals } = await supabaseAdmin
      .from('deals')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('contact_id', contact.id);

    if (!deals || deals.length === 0) return;

    for (const deal of deals) {
      await dealsService.logActivity(deal.id, 'forward_detected', {
        gmail_message_id: messageId,
        forwarding_email: forwardingEmail,
        original_sender: originalEmail,
        detection_layer: iieResult.detection_layer,
        confidence: iieResult.confidence,
        detected_at: new Date().toISOString(),
      });
    }

    console.log(
      `[IIE] Forward detected: ${forwardingEmail} → ${originalEmail} for contact ${contact.id}`,
    );
  },

  /**
   * Check if a message is a reply from a tracked contact.
   * Uses already-extracted sender email (no re-fetch needed).
   */
  async checkForReply(
    workspaceId: string,
    senderEmail: string,
    messageId: string,
  ): Promise<void> {
    // Check if sender is a tracked contact in this workspace
    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('email', senderEmail.toLowerCase())
      .maybeSingle();

    if (!contact) return;

    // Find active deals for this contact
    const { data: deals } = await supabaseAdmin
      .from('deals')
      .select(`
        id,
        current_stage,
        campaign_id,
        campaign:campaigns(pipeline_preset_id, pipeline_preset:pipeline_presets(stages_json))
      `)
      .eq('workspace_id', workspaceId)
      .eq('contact_id', contact.id);

    if (!deals || deals.length === 0) return;

    // Log reply activity and auto-advance if configured
    for (const deal of deals) {
      await dealsService.logActivity(deal.id, 'email_received', {
        gmail_message_id: messageId,
        from: senderEmail,
        detected_at: new Date().toISOString(),
      });

      // Check if auto-advance is configured for the current stage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const preset = (deal as any).campaign?.pipeline_preset;
      if (!preset?.stages_json) continue;

      const stages = preset.stages_json as { id: string; auto_advance_on_reply?: boolean }[];
      const currentStageIdx = stages.findIndex((s) => s.id === deal.current_stage);
      const currentStage = stages[currentStageIdx];
      const nextStage = stages[currentStageIdx + 1];

      if (currentStage?.auto_advance_on_reply && nextStage) {
        await dealsService.changeStage(workspaceId, deal.id, nextStage.id);
        console.log(
          `[ReplyDetection] Auto-advanced deal ${deal.id} from ${deal.current_stage} to ${nextStage.id}`,
        );
      }

      // Auto-pause any active sequence enrollments for this deal
      const paused = await sequencesService.pauseByDeal(deal.id, 'reply_received');
      if (paused.length > 0) {
        console.log(`[ReplyDetection] Auto-paused ${paused.length} sequence enrollment(s) for deal ${deal.id}`);
      }
    }

    console.log(`[ReplyDetection] Reply detected from ${senderEmail} for contact ${contact.id}`);
  },

  /**
   * Get recent replies for a workspace (for sidebar badge/display).
   */
  async getRecentReplies(_workspaceId: string, limit = 20) {
    const { data, error } = await supabaseAdmin
      .from('deal_activities')
      .select(`
        id,
        deal_id,
        data,
        created_at,
        deal:deals(
          id,
          contact:contacts(id, email, name, domain),
          campaign:campaigns(id, name)
        )
      `)
      .eq('type', 'email_received')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).filter((a: any) => a.deal !== null);
  },
};
