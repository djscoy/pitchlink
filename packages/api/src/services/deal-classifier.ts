/**
 * Deal Classifier Service — AI-powered deal status classification for onboarding.
 *
 * Two-tier approach:
 *   Tier 0: Rule-based heuristics (free, instant)
 *   Tier 1: AI classification via Claude Haiku (for ambiguous contacts)
 *
 * Batches contacts (10 per AI call) for cost efficiency.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DealStatus } from '@pitchlink/shared';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export interface ClassificationInput {
  email: string;
  name: string | null;
  sentCount: number;
  receivedCount: number;
  lastInteractionAt: string | null;
  /** Snippet of the last message body for AI context (optional) */
  lastMessageSnippet?: string;
}

export interface ClassificationResult {
  email: string;
  dealStatus: DealStatus;
  confidence: number;
  reason: string;
}

export const dealClassifierService = {
  /**
   * Classify a batch of contacts. Applies Tier 0 rules first,
   * then uses AI for remaining ambiguous contacts.
   */
  async classifyBatch(contacts: ClassificationInput[]): Promise<ClassificationResult[]> {
    const results: ClassificationResult[] = [];
    const needsAI: ClassificationInput[] = [];

    // Tier 0: Rule-based classification
    for (const contact of contacts) {
      const ruleResult = this.classifyByRules(contact);
      if (ruleResult) {
        results.push(ruleResult);
      } else {
        needsAI.push(contact);
      }
    }

    // Tier 1: AI classification for ambiguous contacts (batches of 5)
    console.log(`[DealClassifier] Tier 0 classified ${results.length}/${contacts.length}. ${needsAI.length} need AI.`);
    if (needsAI.length > 0) {
      const batchSize = 5;
      for (let i = 0; i < needsAI.length; i += batchSize) {
        const batch = needsAI.slice(i, i + batchSize);
        try {
          const aiResults = await this.classifyWithAI(batch);
          results.push(...aiResults);
        } catch (err) {
          console.error('[DealClassifier] AI classification failed for batch:', err);
          // Fallback: mark as unclassified
          for (const contact of batch) {
            results.push({
              email: contact.email,
              dealStatus: 'unclassified',
              confidence: 0,
              reason: 'AI classification failed',
            });
          }
        }
      }
    }

    return results;
  },

  /**
   * Tier 0: Rule-based classification.
   * Returns null if the contact needs AI classification.
   */
  classifyByRules(contact: ClassificationInput): ClassificationResult | null {
    const { email, sentCount, receivedCount, lastInteractionAt } = contact;

    const daysSinceLastInteraction = lastInteractionAt
      ? Math.floor((Date.now() - new Date(lastInteractionAt).getTime()) / (1000 * 60 * 60 * 24))
      : Infinity;

    // --- NOISE FILTERS (run first) ---

    // Inbound-only with high volume and never replied = likely newsletter/spam
    // Real contacts rarely send 5+ messages without you ever replying
    if (sentCount === 0 && receivedCount >= 5) {
      return {
        email,
        dealStatus: 'unclassified',
        confidence: 0.85,
        reason: `Likely automated: received ${receivedCount} message(s), never replied`,
      };
    }

    // Inbound-only, never replied, old = not a real deal
    if (sentCount === 0 && receivedCount > 0 && daysSinceLastInteraction > 30) {
      return {
        email,
        dealStatus: 'unclassified',
        confidence: 0.7,
        reason: `Inbound only, never replied, ${daysSinceLastInteraction}d ago`,
      };
    }

    // --- REAL CONTACT CLASSIFICATION ---

    // No messages from them at all — they never responded
    if (receivedCount === 0 && sentCount > 0) {
      return {
        email,
        dealStatus: 'waiting_for_reply',
        confidence: 0.9,
        reason: `Sent ${sentCount} message(s), no response received`,
      };
    }

    // Inbound-only, recent, low volume = someone reached out, we haven't replied yet
    if (sentCount === 0 && receivedCount > 0 && receivedCount < 5 && daysSinceLastInteraction <= 30) {
      return {
        email,
        dealStatus: 'waiting_for_reply',
        confidence: 0.75,
        reason: `Received ${receivedCount} message(s), never replied`,
      };
    }

    // Recent back-and-forth (within last 14 days, both sides sent)
    if (sentCount > 0 && receivedCount > 0 && daysSinceLastInteraction <= 14) {
      return {
        email,
        dealStatus: 'active_conversation',
        confidence: 0.85,
        reason: `Active exchange (${sentCount} sent, ${receivedCount} received, last ${daysSinceLastInteraction}d ago)`,
      };
    }

    // Stale conversation (15-60 days, both sides exchanged)
    if (sentCount > 0 && receivedCount > 0 && daysSinceLastInteraction > 14 && daysSinceLastInteraction <= 60) {
      if (sentCount > receivedCount) {
        return {
          email,
          dealStatus: 'waiting_for_reply',
          confidence: 0.7,
          reason: `Sent ${sentCount} vs received ${receivedCount}, last ${daysSinceLastInteraction}d ago`,
        };
      }
      return {
        email,
        dealStatus: 'active_conversation',
        confidence: 0.6,
        reason: `Exchange (${sentCount} sent, ${receivedCount} received), last ${daysSinceLastInteraction}d ago`,
      };
    }

    // Old conversation that went quiet — both sides exchanged, likely completed
    if (sentCount > 0 && receivedCount > 0 && daysSinceLastInteraction > 60) {
      return {
        email,
        dealStatus: 'completed_deal',
        confidence: 0.7,
        reason: `Conversation ended ${daysSinceLastInteraction}d ago`,
      };
    }

    // Ambiguous — needs AI
    return null;
  },

  /**
   * Tier 1: AI classification via Claude Haiku.
   * Processes a batch of up to 10 contacts in a single API call.
   */
  async classifyWithAI(contacts: ClassificationInput[]): Promise<ClassificationResult[]> {
    const anthropic = getClient();

    const contactSummaries = contacts.map((c, i) => {
      const daysSince = c.lastInteractionAt
        ? Math.floor((Date.now() - new Date(c.lastInteractionAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      let summary = `${i + 1}. ${c.email} (${c.name || 'unknown'}) — sent: ${c.sentCount}, received: ${c.receivedCount}`;
      if (daysSince !== null) summary += `, last interaction: ${daysSince}d ago`;
      if (c.lastMessageSnippet) summary += `\n   Last message snippet: "${c.lastMessageSnippet.slice(0, 200)}"`;
      return summary;
    }).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Classify these email contacts into deal statuses for a CRM onboarding scan. For each contact, determine the most likely status.

Statuses:
- "waiting_for_reply" — user sent last message, no response yet
- "quoted_no_followup" — user sent a quote/price/proposal, contact didn't reply
- "active_conversation" — recent back-and-forth exchange
- "completed_deal" — deal/conversation concluded

Contacts:
${contactSummaries}

Return ONLY a JSON array with no other text:
[{"email": "...", "deal_status": "...", "confidence": 0.0-1.0, "reason": "brief explanation"}]`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(jsonStr) as Array<{
        email: string;
        deal_status: string;
        confidence: number;
        reason: string;
      }>;

      return parsed.map((p) => ({
        email: p.email,
        dealStatus: validateDealStatus(p.deal_status),
        confidence: typeof p.confidence === 'number' ? p.confidence : 0.5,
        reason: p.reason || 'AI classified',
      }));
    } catch {
      console.warn('[DealClassifier] Failed to parse AI response:', text);
      return contacts.map((c) => ({
        email: c.email,
        dealStatus: 'unclassified' as DealStatus,
        confidence: 0,
        reason: 'AI response parsing failed',
      }));
    }
  },
};

function validateDealStatus(status: string): DealStatus {
  const valid: DealStatus[] = ['waiting_for_reply', 'quoted_no_followup', 'active_conversation', 'completed_deal'];
  if (valid.includes(status as DealStatus)) return status as DealStatus;
  return 'unclassified';
}
