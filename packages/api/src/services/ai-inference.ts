/**
 * AI Inference Service
 *
 * Thin wrapper around the Anthropic Claude API for structured inference tasks.
 * Used by IIE Layer 3 for forward detection.
 */

import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic(); // uses ANTHROPIC_API_KEY env var
  }
  return client;
}

interface ForwardAnalysisResult {
  is_forwarded: boolean;
  original_sender_email: string | null;
  original_sender_name: string | null;
  confidence: number;
}

export const aiInferenceService = {
  /**
   * Analyze an email to determine if it's a forward and identify the original sender.
   * Uses Claude Haiku for cost efficiency (~$0.001/call).
   */
  async analyzeForward(emailBody: string, emailHeaders: string): Promise<ForwardAnalysisResult> {
    const anthropic = getClient();

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Analyze this email. Is it a forwarded message? If so, identify the ORIGINAL sender (not the person who forwarded it).

Look for:
- Forward headers or markers
- Quoted/nested messages from a different sender
- Phrases like "FYI", "See below", "Forwarding this"
- Embedded From/To/Subject blocks from another email

Headers:
${emailHeaders.slice(0, 1000)}

Body:
${emailBody.slice(0, 2000)}

Return ONLY valid JSON with no other text:
{"is_forwarded": boolean, "original_sender_email": "email or null", "original_sender_name": "name or null", "confidence": 0.0-1.0}`,
        },
      ],
    });

    // Extract text from response
    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      // Parse JSON from response, handling potential markdown code blocks
      const jsonStr = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(jsonStr) as ForwardAnalysisResult;

      return {
        is_forwarded: Boolean(parsed.is_forwarded),
        original_sender_email: parsed.original_sender_email || null,
        original_sender_name: parsed.original_sender_name || null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      };
    } catch {
      console.warn('[AIInference] Failed to parse AI response:', text);
      return {
        is_forwarded: false,
        original_sender_email: null,
        original_sender_name: null,
        confidence: 0,
      };
    }
  },
};
