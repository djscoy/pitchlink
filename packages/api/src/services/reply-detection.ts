import { supabaseAdmin } from '../db/supabase';
import { gmailWatchService } from './gmail-watch';
import { dealsService } from './deals';

/**
 * Reply Detection Service
 *
 * Processes Gmail Pub/Sub notifications to detect replies from tracked contacts.
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

    // 5. Check each new message for replies from tracked contacts
    for (const message of messages) {
      await this.checkForReply(user.id, user.workspace_id, accessToken, message.id);
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
          // History ID is too old, need to do a full sync
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
   * Check if a Gmail message is a reply from a tracked contact.
   */
  async checkForReply(
    _userId: string,
    workspaceId: string,
    accessToken: string,
    messageId: string,
  ): Promise<void> {
    try {
      // Fetch message metadata (headers only, not full body)
      const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) return;

      const message = await response.json();
      const headers = message.payload?.headers || [];

      // Extract sender email
      const fromHeader = headers.find((h: { name: string }) => h.name === 'From')?.value || '';
      const senderEmail = extractEmail(fromHeader);

      if (!senderEmail) return;

      // Check if sender is a tracked contact in this workspace
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('email', senderEmail.toLowerCase())
        .maybeSingle();

      if (!contact) return; // Not a tracked contact

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
        // Log the reply
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
      }

      console.log(`[ReplyDetection] Reply detected from ${senderEmail} for contact ${contact.id}`);
    } catch (err) {
      console.error(`[ReplyDetection] Error checking message ${messageId}:`, err);
    }
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

    // Filter to workspace-scoped deals
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).filter((a: any) => {
      // deal_activities doesn't have workspace_id directly,
      // but the joined deal does
      return a.deal !== null;
    });
  },
};

// --- Helpers ---

function extractEmail(fromHeader: string): string | null {
  // Parse "Name <email@example.com>" or "email@example.com"
  const match = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([^\s<]+@[^\s>]+)/);
  return match ? match[1].toLowerCase() : null;
}
