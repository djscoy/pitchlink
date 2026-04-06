/**
 * Inquiry Classifier — Uses Claude Haiku to classify inbound emails.
 *
 * Determines if an email is a guest post / link insertion inquiry
 * vs spam, newsletter, or unrelated communication.
 * Cost: ~$0.001 per classification.
 */

import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export type InquiryType =
  | 'guest_post_inquiry'
  | 'link_insertion_inquiry'
  | 'collaboration_inquiry'
  | 'not_inquiry';

interface ClassificationResult {
  type: InquiryType;
  confidence: number;
}

export const inquiryClassifierService = {
  /**
   * Classify an inbound email as a guest post inquiry or not.
   * Uses subject + first 500 chars of body for efficiency.
   */
  async classify(subject: string, body: string): Promise<ClassificationResult> {
    const anthropic = getClient();
    const truncatedBody = body.slice(0, 500);

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 128,
        messages: [
          {
            role: 'user',
            content: `Classify this inbound email. Is the sender asking to buy a guest post, link insertion, or content placement on a website?

Subject: ${subject}
Body: ${truncatedBody}

Return ONLY valid JSON:
{"type": "guest_post_inquiry" | "link_insertion_inquiry" | "collaboration_inquiry" | "not_inquiry", "confidence": 0.0-1.0}

- "guest_post_inquiry": sender wants to publish/buy a guest post or sponsored article
- "link_insertion_inquiry": sender wants to buy a link placement in existing content
- "collaboration_inquiry": sender proposes content collaboration, exchange, or partnership
- "not_inquiry": newsletter, spam, internal, invoice, notification, or unrelated`,
          },
        ],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(jsonStr) as ClassificationResult;

      return {
        type: parsed.type || 'not_inquiry',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      };
    } catch (err) {
      console.error('[InquiryClassifier] Classification failed:', err);
      return { type: 'not_inquiry', confidence: 0 };
    }
  },

  /**
   * Check if a classification type is an actionable inquiry.
   */
  isInquiry(type: InquiryType): boolean {
    return type === 'guest_post_inquiry' || type === 'link_insertion_inquiry' || type === 'collaboration_inquiry';
  },
};
