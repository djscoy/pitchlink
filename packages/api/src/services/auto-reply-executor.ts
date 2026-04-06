/**
 * Auto-Reply Executor — Processes the auto-reply queue on a timer.
 *
 * Runs every 60 seconds. For each due item:
 * - auto_send mode: sends email via Gmail API
 * - draft_hold mode: creates Gmail draft for manual review
 *
 * Also auto-creates the contact and assigns to campaign if configured.
 */

import { supabaseAdmin } from '../db/supabase';
import { aiComposeService } from './ai-compose';
import { gmailWatchService } from './gmail-watch';

const EXECUTOR_INTERVAL_MS = 60_000; // 1 minute

interface QueueItem {
  id: string;
  workspace_id: string;
  rule_id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  sender_email: string;
  sender_name: string | null;
  resolved_subject: string;
  resolved_body: string;
  status: string;
  scheduled_at: string;
}

interface AutoReplyRule {
  id: string;
  mode: 'auto_send' | 'draft_hold';
  campaign_id: string | null;
}

export const autoReplyExecutorService = {
  /**
   * Start the executor loop.
   */
  start(): void {
    // Run once on startup
    setTimeout(() => this.processQueue(), 5000);
    // Then every minute
    setInterval(() => this.processQueue(), EXECUTOR_INTERVAL_MS);
    console.log('[AutoReplyExecutor] Started (every 60 seconds)');
  },

  /**
   * Process all due items in the auto-reply queue.
   */
  async processQueue(): Promise<void> {
    try {
      const now = new Date().toISOString();

      const { data: dueItems } = await supabaseAdmin
        .from('auto_reply_queue')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(20);

      if (!dueItems || dueItems.length === 0) return;

      for (const item of dueItems as QueueItem[]) {
        await this.processItem(item);
      }
    } catch (err) {
      console.error('[AutoReplyExecutor] Queue processing error:', err);
    }
  },

  /**
   * Process a single queue item — send or draft.
   */
  async processItem(item: QueueItem): Promise<void> {
    try {
      // Get the rule to determine mode
      const { data: rule } = await supabaseAdmin
        .from('auto_reply_rules')
        .select('id, mode, campaign_id')
        .eq('id', item.rule_id)
        .maybeSingle();

      if (!rule) {
        await this.updateStatus(item.id, 'failed', 'rule_not_found');
        return;
      }

      // Get user's access token
      // Find a user in this workspace
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('workspace_id', item.workspace_id)
        .limit(1)
        .maybeSingle();

      if (!user) {
        await this.updateStatus(item.id, 'failed', 'no_user');
        return;
      }

      const watchState = await gmailWatchService.getWatchState(user.id);
      if (!watchState?.access_token_encrypted) {
        await this.updateStatus(item.id, 'failed', 'no_access_token');
        return;
      }

      const accessToken = watchState.access_token_encrypted;
      const typedRule = rule as AutoReplyRule;

      if (typedRule.mode === 'auto_send') {
        // Send directly
        const messageId = await aiComposeService.sendEmail(
          accessToken,
          item.sender_email,
          item.resolved_subject,
          item.resolved_body,
          item.gmail_thread_id,
        );

        if (messageId) {
          await supabaseAdmin
            .from('auto_reply_queue')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', item.id);
          console.log(`[AutoReplyExecutor] Sent auto-reply to ${item.sender_email}`);
        } else {
          await this.updateStatus(item.id, 'failed', 'send_failed');
        }
      } else {
        // Draft hold — create Gmail draft
        const draftId = await aiComposeService.saveAsGmailDraft(
          accessToken,
          item.sender_email,
          item.resolved_subject,
          item.resolved_body,
          item.gmail_thread_id,
        );

        if (draftId) {
          await supabaseAdmin
            .from('auto_reply_queue')
            .update({ status: 'drafted', draft_id: draftId, sent_at: new Date().toISOString() })
            .eq('id', item.id);
          console.log(`[AutoReplyExecutor] Created draft for ${item.sender_email} (draft: ${draftId})`);
        } else {
          await this.updateStatus(item.id, 'failed', 'draft_failed');
        }
      }

      // Auto-create contact and assign to campaign
      await this.autoCreateContact(item, typedRule);
    } catch (err) {
      console.error(`[AutoReplyExecutor] Error processing item ${item.id}:`, err);
      await this.updateStatus(item.id, 'failed', 'exception');
    }
  },

  /**
   * Auto-create a contact for the sender and optionally assign to campaign.
   */
  async autoCreateContact(item: QueueItem, rule: AutoReplyRule): Promise<void> {
    try {
      const email = item.sender_email.toLowerCase();
      const domain = email.split('@')[1] || '';

      // Check if contact already exists (may have been created between queue and execution)
      const { data: existing } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('workspace_id', item.workspace_id)
        .eq('email', email)
        .maybeSingle();

      let contactId: string;

      if (existing) {
        contactId = existing.id;
      } else {
        const { data: newContact } = await supabaseAdmin
          .from('contacts')
          .insert({
            workspace_id: item.workspace_id,
            email,
            name: item.sender_name || '',
            domain,
          })
          .select('id')
          .single();

        if (!newContact) return;
        contactId = newContact.id;
      }

      // Assign to campaign if configured
      if (rule.campaign_id) {
        // Check if deal already exists
        const { data: existingDeal } = await supabaseAdmin
          .from('deals')
          .select('id')
          .eq('workspace_id', item.workspace_id)
          .eq('contact_id', contactId)
          .eq('campaign_id', rule.campaign_id)
          .maybeSingle();

        if (!existingDeal) {
          // Get the first stage of the campaign's pipeline
          const { data: campaign } = await supabaseAdmin
            .from('campaigns')
            .select('pipeline_preset_id, pipeline_preset:pipeline_presets(stages_json)')
            .eq('id', rule.campaign_id)
            .maybeSingle();

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stages = (campaign as any)?.pipeline_preset?.stages_json as { id: string }[] | undefined;
          // Use second stage (Quote Sent) since we're replying with pricing
          const stage = stages?.[1]?.id || stages?.[0]?.id || 'inquiry_in';

          await supabaseAdmin.from('deals').insert({
            workspace_id: item.workspace_id,
            contact_id: contactId,
            campaign_id: rule.campaign_id,
            current_stage: stage,
            mode: 'sell',
          });
        }
      }
    } catch (err) {
      // Non-fatal — the reply was still sent/drafted
      console.error('[AutoReplyExecutor] Error auto-creating contact:', err);
    }
  },

  async updateStatus(id: string, status: string, reason?: string): Promise<void> {
    await supabaseAdmin
      .from('auto_reply_queue')
      .update({ status, skip_reason: reason })
      .eq('id', id);
  },
};
