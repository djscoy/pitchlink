/**
 * AI Compose Service — Generates contextual emails using Claude.
 *
 * Mode-aware: adjusts tone and intent based on Buy/Sell/Exchange mode.
 * Can optionally save the result as a Gmail Draft.
 */

import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export interface ComposeRequest {
  contactEmail: string;
  contactName?: string;
  contactDomain?: string;
  campaignName?: string;
  currentStage?: string;
  mode: 'buy' | 'sell' | 'exchange';
  threadSubject?: string;
  instruction?: string; // e.g. "ask about their pricing for a homepage link"
  replyContext?: string; // last few messages for reply context
}

export interface ComposeResult {
  subject: string;
  body: string;
}

const MODE_PROMPTS: Record<string, string> = {
  buy: 'You are helping the user ACQUIRE something (e.g., buying a guest post, backlink, service). The user is the buyer reaching out to a seller/publisher. Be professional, concise, and show genuine interest in what the contact offers.',
  sell: 'You are helping the user SELL or FULFILL a service (e.g., publishing a guest post, providing a link placement). The user is the seller responding to an inquiry. Be helpful, clear about next steps, and professional.',
  exchange: 'You are helping the user propose or manage a MUTUAL EXCHANGE (e.g., reciprocal links, content swaps). Both sides deliver value. Be collaborative and clear about what each side provides.',
};

export const aiComposeService = {
  /**
   * Generate an email draft using Claude.
   */
  async generateDraft(request: ComposeRequest): Promise<ComposeResult> {
    const anthropic = getClient();

    const contactLabel = request.contactName
      ? `${request.contactName} (${request.contactEmail})`
      : request.contactEmail;

    const contextParts: string[] = [];
    if (request.campaignName) contextParts.push(`Campaign: ${request.campaignName}`);
    if (request.currentStage) contextParts.push(`Pipeline stage: ${request.currentStage}`);
    if (request.contactDomain) contextParts.push(`Contact's domain: ${request.contactDomain}`);
    if (request.threadSubject) contextParts.push(`Thread subject: ${request.threadSubject}`);

    const contextBlock = contextParts.length > 0
      ? `\nContext:\n${contextParts.join('\n')}`
      : '';

    const replyBlock = request.replyContext
      ? `\nRecent conversation:\n${request.replyContext.slice(0, 3000)}`
      : '';

    const instructionBlock = request.instruction
      ? `\nUser instruction: ${request.instruction}`
      : '\nWrite an appropriate outreach email based on the context.';

    const isReply = Boolean(request.replyContext || request.threadSubject);

    const prompt = `${MODE_PROMPTS[request.mode] || MODE_PROMPTS.buy}

Draft a ${isReply ? 'reply' : 'new'} email to: ${contactLabel}
${contextBlock}${replyBlock}${instructionBlock}

Guidelines:
- Keep it short (3-5 sentences for outreach, 2-3 for follow-ups)
- Sound human, not templated
- No placeholder text like [YOUR NAME] — leave the sign-off as just a dash or nothing
- Match the ${request.mode} mode tone

Return ONLY valid JSON with no other text:
{"subject": "...", "body": "..."}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(jsonStr) as ComposeResult;
      return {
        subject: parsed.subject || '',
        body: parsed.body || '',
      };
    } catch {
      console.warn('[AICompose] Failed to parse AI response:', text);
      return { subject: '', body: text };
    }
  },

  /**
   * Save composed email as a Gmail Draft.
   * Reuses the same pattern as nudge-drafter.
   */
  async saveAsGmailDraft(
    accessToken: string,
    toEmail: string,
    subject: string,
    body: string,
    threadId?: string,
  ): Promise<string | null> {
    try {
      const rawMessage = [
        `To: ${toEmail}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].join('\r\n');

      const encoded = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // If threadId is provided, attach draft to the existing thread
      const messagePayload: Record<string, unknown> = { raw: encoded };
      if (threadId) {
        messagePayload.threadId = threadId;
      }

      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/drafts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: messagePayload }),
      });

      if (!response.ok) {
        console.error(`[AICompose] Failed to create draft: ${response.status}`);
        return null;
      }

      const draft = await response.json();
      return draft.id;
    } catch (err) {
      console.error('[AICompose] Error creating Gmail draft:', err);
      return null;
    }
  },

  /**
   * Send an email directly via Gmail API (not as a draft).
   * Used by auto-reply in auto_send mode.
   */
  async sendEmail(
    accessToken: string,
    toEmail: string,
    subject: string,
    body: string,
    threadId?: string,
  ): Promise<string | null> {
    try {
      const rawMessage = [
        `To: ${toEmail}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].join('\r\n');

      const encoded = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const messagePayload: Record<string, unknown> = { raw: encoded };
      if (threadId) {
        messagePayload.threadId = threadId;
      }

      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      });

      if (!response.ok) {
        console.error(`[AICompose] Failed to send email: ${response.status}`);
        return null;
      }

      const result = await response.json();
      return result.id;
    } catch (err) {
      console.error('[AICompose] Error sending email:', err);
      return null;
    }
  },
};
