/**
 * Forward Detection Service — Inbox Identity Engine (IIE)
 *
 * 4-layer cascade for detecting forwarded emails and identifying the original sender:
 *   Layer 0: Source Registry lookup (instant, cached)
 *   Layer 1: Header parsing (X-Forwarded-To, Received chain)
 *   Layer 2: Body pattern regex (Gmail, Outlook, Yahoo forward blocks)
 *   Layer 3: AI inference (Claude Haiku)
 *
 * Layer 4 (Human Confirmation) runs client-side in the extension sidebar.
 */

import type { IIEResult } from '@pitchlink/shared';
import { supabaseAdmin } from '../db/supabase';
import { extractEmail, extractName } from '../utils/email';
import { aiInferenceService } from './ai-inference';

// ============================================================
// Gmail API Message Types
// ============================================================

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  payload: GmailMessagePart;
}

// ============================================================
// Forward Body Regex Patterns
// ============================================================

// Gmail: "---------- Forwarded message ---------"
const GMAIL_FORWARD_RE =
  /---------- Forwarded message ---------[\s\S]*?From:\s*(.+?)(?:\n|$)/i;

// Outlook: "From: ...\nSent: ...\nTo: ...\nSubject: ..."
const OUTLOOK_FORWARD_RE =
  /(?:_{2,}|-{2,})\s*\n(?:From|Von|De|Da):\s*(.+?)\s*\n(?:Sent|Gesendet|Envoy[eé]|Inviato):\s*.+\s*\n(?:To|An|À|A):\s*.+\s*\n(?:Subject|Betreff|Objet|Oggetto):\s*.+/i;

// Yahoo: "--- Forwarded Message ---"
const YAHOO_FORWARD_RE =
  /--- Forwarded Message ---[\s\S]*?From:\s*(.+?)(?:\n|$)/i;

// Generic "Fwd:" / "Fw:" in a From-like line within the body
const GENERIC_FWD_FROM_RE =
  /(?:^|\n)\s*(?:>{1,2}\s*)?From:\s*(.+?)(?:\n|$)/i;

// ============================================================
// Service
// ============================================================

export const forwardDetectionService = {
  /**
   * Main entry point — run the full cascade on a Gmail message.
   * Returns IIEResult. If detection_layer is 'unresolved', the client
   * should show Layer 4 (human confirmation) UI.
   */
  async detectForward(
    workspaceId: string,
    accessToken: string,
    messageId: string,
  ): Promise<{ iieResult: IIEResult; message: GmailMessage | null }> {
    // Fetch full message (headers + body)
    const message = await this.fetchFullMessage(accessToken, messageId);
    if (!message) {
      return {
        iieResult: notForward(),
        message: null,
      };
    }

    const headers = message.payload.headers || [];
    const fromHeader = headers.find((h) => h.name.toLowerCase() === 'from')?.value || '';
    const senderEmail = extractEmail(fromHeader);

    if (!senderEmail) {
      return { iieResult: notForward(), message };
    }

    // Layer 0: Source Registry lookup
    const registryResult = await this.checkSourceRegistry(workspaceId, senderEmail);
    if (registryResult) {
      return { iieResult: registryResult, message };
    }

    // Layer 1: Header parsing
    const headerResult = this.parseForwardHeaders(headers, senderEmail);
    if (headerResult) {
      return { iieResult: headerResult, message };
    }

    // Layer 2: Body pattern regex
    const bodyText = this.extractBodyText(message.payload);
    if (bodyText) {
      const bodyResult = this.parseForwardBody(bodyText);
      if (bodyResult) {
        return { iieResult: { ...bodyResult, forwarding_email: senderEmail }, message };
      }
    }

    // Layer 3: AI inference (only if we have body text)
    if (bodyText && bodyText.length > 50) {
      try {
        const headersSummary = headers
          .filter((h) =>
            ['from', 'to', 'subject', 'date', 'received', 'x-forwarded-to', 'delivered-to'].includes(
              h.name.toLowerCase(),
            ),
          )
          .map((h) => `${h.name}: ${h.value}`)
          .join('\n');

        const aiResult = await this.inferForwardAI(bodyText, headersSummary);
        if (aiResult) {
          return { iieResult: { ...aiResult, forwarding_email: senderEmail }, message };
        }
      } catch (err) {
        console.error('[IIE] Layer 3 AI inference failed:', err);
      }
    }

    // No layer resolved — return unresolved for potential Layer 4
    return { iieResult: notForward(), message };
  },

  /**
   * Layer 0: Check Source Registry for a known forwarding address.
   */
  async checkSourceRegistry(
    workspaceId: string,
    senderEmail: string,
  ): Promise<IIEResult | null> {
    const { data } = await supabaseAdmin
      .from('source_registry')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('forwarding_email', senderEmail.toLowerCase())
      .maybeSingle();

    if (!data) return null;

    return {
      is_forwarded: true,
      original_sender_email: data.original_sender_email,
      original_sender_name: data.original_sender_name,
      confidence: data.confidence ?? 1.0,
      detection_layer: 'registry',
      forwarding_email: senderEmail,
    };
  },

  /**
   * Layer 1: Parse email headers for forwarding indicators.
   */
  parseForwardHeaders(headers: GmailHeader[], senderEmail: string): IIEResult | null {
    // Check X-Forwarded-To — explicit forward marker
    const xForwardedTo = headers.find(
      (h) => h.name.toLowerCase() === 'x-forwarded-to',
    )?.value;
    if (xForwardedTo) {
      const originalEmail = extractEmail(xForwardedTo);
      if (originalEmail && originalEmail !== senderEmail) {
        return {
          is_forwarded: true,
          original_sender_email: originalEmail,
          confidence: 0.9,
          detection_layer: 'header',
          forwarding_email: senderEmail,
        };
      }
    }

    // Check X-Forwarded-For
    const xForwardedFor = headers.find(
      (h) => h.name.toLowerCase() === 'x-forwarded-for',
    )?.value;
    if (xForwardedFor) {
      const originalEmail = extractEmail(xForwardedFor);
      if (originalEmail && originalEmail !== senderEmail) {
        return {
          is_forwarded: true,
          original_sender_email: originalEmail,
          confidence: 0.9,
          detection_layer: 'header',
          forwarding_email: senderEmail,
        };
      }
    }

    // Check X-Original-To
    const xOriginalTo = headers.find(
      (h) => h.name.toLowerCase() === 'x-original-to',
    )?.value;
    if (xOriginalTo) {
      const originalEmail = extractEmail(xOriginalTo);
      if (originalEmail && originalEmail !== senderEmail) {
        return {
          is_forwarded: true,
          original_sender_email: originalEmail,
          confidence: 0.85,
          detection_layer: 'header',
          forwarding_email: senderEmail,
        };
      }
    }

    // Compare Delivered-To vs To — mismatch suggests forwarding
    const deliveredTo = headers.find(
      (h) => h.name.toLowerCase() === 'delivered-to',
    )?.value;
    const toHeader = headers.find(
      (h) => h.name.toLowerCase() === 'to',
    )?.value;

    if (deliveredTo && toHeader) {
      const deliveredEmail = extractEmail(deliveredTo);
      const toEmail = extractEmail(toHeader);
      if (deliveredEmail && toEmail && deliveredEmail !== toEmail) {
        // The message was delivered to a different address than the To: field
        // This suggests forwarding, but we don't know the original sender from headers alone
        // Fall through to Layer 2/3
      }
    }

    return null;
  },

  /**
   * Layer 2: Parse email body for forwarding patterns.
   */
  parseForwardBody(bodyText: string): IIEResult | null {
    // Try each pattern in order of specificity

    // Gmail forward
    const gmailMatch = bodyText.match(GMAIL_FORWARD_RE);
    if (gmailMatch) {
      const email = extractEmail(gmailMatch[1]);
      const name = extractName(gmailMatch[1]);
      if (email) {
        return {
          is_forwarded: true,
          original_sender_email: email,
          original_sender_name: name || undefined,
          confidence: 0.9,
          detection_layer: 'body_regex',
        };
      }
    }

    // Outlook forward
    const outlookMatch = bodyText.match(OUTLOOK_FORWARD_RE);
    if (outlookMatch) {
      const email = extractEmail(outlookMatch[1]);
      const name = extractName(outlookMatch[1]);
      if (email) {
        return {
          is_forwarded: true,
          original_sender_email: email,
          original_sender_name: name || undefined,
          confidence: 0.9,
          detection_layer: 'body_regex',
        };
      }
    }

    // Yahoo forward
    const yahooMatch = bodyText.match(YAHOO_FORWARD_RE);
    if (yahooMatch) {
      const email = extractEmail(yahooMatch[1]);
      const name = extractName(yahooMatch[1]);
      if (email) {
        return {
          is_forwarded: true,
          original_sender_email: email,
          original_sender_name: name || undefined,
          confidence: 0.85,
          detection_layer: 'body_regex',
        };
      }
    }

    // Generic quoted From: line (lower confidence — could be a reply chain)
    const genericMatch = bodyText.match(GENERIC_FWD_FROM_RE);
    if (genericMatch) {
      const email = extractEmail(genericMatch[1]);
      const name = extractName(genericMatch[1]);
      if (email) {
        return {
          is_forwarded: true,
          original_sender_email: email,
          original_sender_name: name || undefined,
          confidence: 0.6,
          detection_layer: 'body_regex',
        };
      }
    }

    return null;
  },

  /**
   * Layer 3: AI inference via Claude Haiku.
   * Only called when Layers 1-2 fail to resolve.
   */
  async inferForwardAI(
    bodyText: string,
    headersSummary: string,
  ): Promise<IIEResult | null> {
    const result = await aiInferenceService.analyzeForward(bodyText, headersSummary);

    if (result.is_forwarded && result.original_sender_email && result.confidence > 0.8) {
      return {
        is_forwarded: true,
        original_sender_email: result.original_sender_email,
        original_sender_name: result.original_sender_name || undefined,
        confidence: result.confidence,
        detection_layer: 'ai',
      };
    }

    // AI says not a forward, or confidence too low
    if (result.is_forwarded && result.confidence <= 0.8) {
      // Return as unresolved with the best guess for Layer 4
      return {
        is_forwarded: true,
        original_sender_email: result.original_sender_email || undefined,
        original_sender_name: result.original_sender_name || undefined,
        confidence: result.confidence,
        detection_layer: 'unresolved',
      };
    }

    return null;
  },

  /**
   * Fetch a full Gmail message (headers + body).
   */
  async fetchFullMessage(
    accessToken: string,
    messageId: string,
  ): Promise<GmailMessage | null> {
    try {
      const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        console.warn(`[IIE] Failed to fetch message ${messageId}: ${response.status}`);
        return null;
      }

      return (await response.json()) as GmailMessage;
    } catch (err) {
      console.error('[IIE] Error fetching message:', err);
      return null;
    }
  },

  /**
   * Extract plain text body from a Gmail message payload.
   * Recursively traverses multipart MIME structure.
   */
  extractBodyText(payload: GmailMessagePart): string | null {
    // Direct text/plain body
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      return decodeBase64Url(payload.body.data);
    }

    // Multipart — search parts recursively
    if (payload.parts) {
      // Prefer text/plain
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return decodeBase64Url(part.body.data);
        }
      }
      // Fall back to text/html (strip tags)
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          const html = decodeBase64Url(part.body.data);
          return stripHtmlTags(html);
        }
      }
      // Recurse into nested multipart
      for (const part of payload.parts) {
        if (part.parts) {
          const result = this.extractBodyText(part);
          if (result) return result;
        }
      }
    }

    return null;
  },
};

// ============================================================
// Helpers
// ============================================================

function notForward(): IIEResult {
  return {
    is_forwarded: false,
    confidence: 0,
    detection_layer: 'unresolved',
  };
}

function decodeBase64Url(data: string): string {
  // Gmail API uses URL-safe base64
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
