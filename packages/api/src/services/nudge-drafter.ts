/**
 * Nudge Drafter Service — Auto-drafts follow-up emails for onboarding.
 *
 * For contacts classified as "quoted_no_followup", generates a personalized
 * follow-up email and saves it as a Gmail Draft.
 */

import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export interface NudgeInput {
  email: string;
  name: string | null;
  domain: string;
  sentCount: number;
  receivedCount: number;
  classificationReason: string;
}

export interface NudgeDraft {
  email: string;
  subject: string;
  body: string;
}

export interface SavedDraft {
  email: string;
  subject: string;
  body: string;
  gmailDraftId: string;
}

export const nudgeDrafterService = {
  /**
   * Generate nudge drafts for a batch of contacts using AI.
   */
  async generateNudges(contacts: NudgeInput[]): Promise<NudgeDraft[]> {
    if (contacts.length === 0) return [];

    const anthropic = getClient();
    const results: NudgeDraft[] = [];

    // Process in batches of 5 for manageable AI responses
    const batchSize = 5;
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

      const contactList = batch.map((c, idx) => {
        return `${idx + 1}. To: ${c.name || c.email} (${c.email}, domain: ${c.domain})
   Context: Sent ${c.sentCount} emails, received ${c.receivedCount}. Status: ${c.classificationReason}`;
      }).join('\n');

      try {
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: `Draft short, professional follow-up emails for these contacts. Each email should be a friendly nudge referencing the prior conversation. Keep them concise (2-3 sentences).

Contacts:
${contactList}

Return ONLY a JSON array with no other text:
[{"email": "...", "subject": "Following up", "body": "Hi [Name],\\n\\n..."}]`,
            },
          ],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(jsonStr) as NudgeDraft[];
        results.push(...parsed);
      } catch (err) {
        console.error('[NudgeDrafter] AI generation failed for batch:', err);
        // Skip failed batch
      }
    }

    return results;
  },

  /**
   * Save a nudge as a Gmail Draft.
   * Uses Gmail API drafts.create endpoint.
   */
  async saveAsGmailDraft(
    accessToken: string,
    toEmail: string,
    subject: string,
    body: string,
  ): Promise<string | null> {
    try {
      // Build RFC 2822 message
      const rawMessage = [
        `To: ${toEmail}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].join('\r\n');

      // Base64url encode
      const encoded = Buffer.from(rawMessage)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/drafts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: { raw: encoded },
        }),
      });

      if (!response.ok) {
        console.error(`[NudgeDrafter] Failed to create draft: ${response.status}`);
        return null;
      }

      const draft = await response.json();
      return draft.id;
    } catch (err) {
      console.error('[NudgeDrafter] Error creating Gmail draft:', err);
      return null;
    }
  },

  /**
   * Generate nudges and save them all as Gmail Drafts.
   */
  async generateAndSaveDrafts(
    accessToken: string,
    contacts: NudgeInput[],
  ): Promise<SavedDraft[]> {
    const nudges = await this.generateNudges(contacts);
    const saved: SavedDraft[] = [];

    for (const nudge of nudges) {
      const draftId = await this.saveAsGmailDraft(
        accessToken,
        nudge.email,
        nudge.subject,
        nudge.body,
      );

      if (draftId) {
        saved.push({
          email: nudge.email,
          subject: nudge.subject,
          body: nudge.body,
          gmailDraftId: draftId,
        });
      }
    }

    return saved;
  },
};
