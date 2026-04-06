/**
 * Auto-Reply Service
 *
 * Checks inbound emails against auto-reply rules and queues responses.
 * Called from reply-detection when a new inbound message is detected.
 */

import { supabaseAdmin } from '../db/supabase';
import { inquiryClassifierService } from './inquiry-classifier';
import { templatesService } from './templates';

interface MessageData {
  messageId: string;
  threadId: string;
  senderEmail: string;
  senderName?: string;
  subject: string;
  bodyText: string;
  toEmail: string;
}

interface AutoReplyRule {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  template_id: string;
  is_enabled: boolean;
  mode: 'auto_send' | 'draft_hold';
  delay_minutes: number;
  match_type: 'ai_classify' | 'all_new';
  receiving_emails: string[];
  max_per_hour: number;
}

export const autoReplyService = {
  /**
   * Check if an inbound message should trigger an auto-reply.
   * Called from reply-detection after a new message is detected.
   */
  async checkAndQueue(
    workspaceId: string,
    _accessToken: string,
    messageData: MessageData,
  ): Promise<void> {
    try {
      // 1. Get enabled auto-reply rules for this workspace
      const { data: rules } = await supabaseAdmin
        .from('auto_reply_rules')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_enabled', true);

      if (!rules || rules.length === 0) return;

      // 2. Check safety: skip if sender is the user's own address
      const { data: ownedEmails } = await supabaseAdmin
        .from('email_accounts')
        .select('email')
        .eq('workspace_id', workspaceId);
      const ownSet = new Set((ownedEmails || []).map((e: { email: string }) => e.email.toLowerCase()));

      // Also check workspace owned_emails
      const { data: workspace } = await supabaseAdmin
        .from('workspaces')
        .select('settings_json')
        .eq('id', workspaceId)
        .maybeSingle();
      const settings = (workspace?.settings_json || {}) as Record<string, unknown>;
      for (const email of ((settings.owned_emails as string[]) || [])) {
        ownSet.add(email.toLowerCase());
      }

      if (ownSet.has(messageData.senderEmail.toLowerCase())) {
        return; // Don't auto-reply to ourselves
      }

      // 3. Check safety: skip if we already have this contact (already replied before)
      const { data: existingContact } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('email', messageData.senderEmail.toLowerCase())
        .maybeSingle();

      if (existingContact) {
        return; // Already a known contact — they've been handled before
      }

      // 4. Check safety: skip auto-reply headers (prevent loops)
      // This is checked at the message level before calling this service

      // 5. Rate limit check
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentCount } = await supabaseAdmin
        .from('auto_reply_queue')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .in('status', ['pending', 'sent', 'drafted'])
        .gte('created_at', oneHourAgo);

      // 6. Process each matching rule
      for (const rule of rules as AutoReplyRule[]) {
        // Rate limit per rule
        if ((recentCount || 0) >= rule.max_per_hour) {
          console.log(`[AutoReply] Rate limit reached (${rule.max_per_hour}/hr), skipping`);
          continue;
        }

        // Check receiving email filter
        if (rule.receiving_emails.length > 0) {
          const toEmailLower = messageData.toEmail.toLowerCase();
          if (!rule.receiving_emails.some((e: string) => e.toLowerCase() === toEmailLower)) {
            continue; // This rule doesn't apply to the receiving address
          }
        }

        // 7. Classify the email if needed
        let classification = 'all_new';
        if (rule.match_type === 'ai_classify') {
          const result = await inquiryClassifierService.classify(
            messageData.subject,
            messageData.bodyText,
          );
          classification = result.type;

          if (!inquiryClassifierService.isInquiry(result.type)) {
            // Not an inquiry — skip
            await this.logSkipped(workspaceId, rule.id, messageData, `not_inquiry (${result.type}, ${result.confidence})`);
            continue;
          }

          if (result.confidence < 0.6) {
            await this.logSkipped(workspaceId, rule.id, messageData, `low_confidence (${result.confidence})`);
            continue;
          }
        }

        // 8. Resolve template with sender context
        const template = await templatesService.getById(workspaceId, rule.template_id);
        if (!template) {
          console.warn(`[AutoReply] Template ${rule.template_id} not found, skipping rule ${rule.id}`);
          continue;
        }

        const resolved = templatesService.resolveVariables(
          template.subject,
          template.body_html,
          {
            contactName: messageData.senderName || messageData.senderEmail.split('@')[0],
            contactEmail: messageData.senderEmail,
            domain: messageData.senderEmail.split('@')[1] || '',
          },
        );

        // 9. Queue the auto-reply
        const scheduledAt = new Date(Date.now() + rule.delay_minutes * 60 * 1000);

        await supabaseAdmin.from('auto_reply_queue').insert({
          workspace_id: workspaceId,
          rule_id: rule.id,
          gmail_message_id: messageData.messageId,
          gmail_thread_id: messageData.threadId,
          sender_email: messageData.senderEmail,
          sender_name: messageData.senderName,
          resolved_subject: resolved.subject,
          resolved_body: resolved.body_html,
          classification,
          scheduled_at: scheduledAt.toISOString(),
          status: 'pending',
        });

        console.log(
          `[AutoReply] Queued ${rule.mode} reply to ${messageData.senderEmail} ` +
          `(${classification}), fires at ${scheduledAt.toISOString()}`,
        );

        // Only one rule should fire per message
        break;
      }
    } catch (err) {
      console.error('[AutoReply] Error checking/queueing auto-reply:', err);
    }
  },

  /**
   * Log a skipped auto-reply for visibility.
   */
  async logSkipped(
    workspaceId: string,
    ruleId: string,
    messageData: MessageData,
    reason: string,
  ): Promise<void> {
    await supabaseAdmin.from('auto_reply_queue').insert({
      workspace_id: workspaceId,
      rule_id: ruleId,
      gmail_message_id: messageData.messageId,
      gmail_thread_id: messageData.threadId,
      sender_email: messageData.senderEmail,
      sender_name: messageData.senderName,
      resolved_subject: '',
      resolved_body: '',
      classification: reason,
      scheduled_at: new Date().toISOString(),
      status: 'skipped',
      skip_reason: reason,
    });
  },
};
