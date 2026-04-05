/**
 * Gmail Scan Service — Inbox scanning for onboarding.
 *
 * Phase 1: Header-only scan (format=metadata) for contact aggregation.
 * Phase 2: Full fetch only for contacts passing min_interactions threshold.
 *
 * Uses the same Gmail API access pattern as forward-detection.ts.
 */

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessageMetadata {
  id: string;
  threadId: string;
  payload: {
    headers: GmailHeader[];
  };
}

interface GmailMessageListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface ScannedContact {
  email: string;
  name: string | null;
  domain: string;
  interactionCount: number;
  sentCount: number;
  receivedCount: number;
  lastInteractionAt: string | null;
  threadIds: Set<string>;
  /** If this address appears in X-Forwarded-To or similar headers */
  isForwardingAddress: boolean;
  forwardsToEmail: string | null;
}

export interface ScanProgress {
  totalMessages: number;
  scannedMessages: number;
  contactsFound: number;
  forwardingAddresses: number;
}

type ProgressCallback = (progress: ScanProgress) => void;

export const gmailScanService = {
  /**
   * Scan Gmail inbox for contacts within a time range.
   * Returns aggregated contact map keyed by email.
   */
  async scanInbox(
    accessToken: string,
    userEmail: string,
    timeRangeDays: number,
    minInteractions: number,
    onProgress?: ProgressCallback,
    excludeEmails?: Set<string>,
    excludeDomains?: Set<string>,
  ): Promise<Map<string, ScannedContact>> {
    const contacts = new Map<string, ScannedContact>();
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - timeRangeDays);
    const afterStr = formatGmailDate(afterDate);

    // Gmail search query: all messages in the time range, exclude spam/trash
    const query = `after:${afterStr} -in:spam -in:trash`;

    let pageToken: string | undefined;
    let totalListed = 0;
    let scanned = 0;
    let forwardingCount = 0;

    do {
      // List messages (IDs only, paginated)
      const listResult = await this.listMessages(accessToken, query, pageToken);
      if (!listResult.messages || listResult.messages.length === 0) break;

      totalListed += listResult.messages.length;

      // Fetch metadata in batches of 20
      const batchSize = 20;
      for (let i = 0; i < listResult.messages.length; i += batchSize) {
        const batch = listResult.messages.slice(i, i + batchSize);
        const metadataResults = await Promise.all(
          batch.map((msg) => this.fetchMessageMetadata(accessToken, msg.id)),
        );

        for (const metadata of metadataResults) {
          if (!metadata) continue;
          scanned++;

          const result = this.extractContactFromMetadata(metadata, userEmail);
          if (!result) continue;

          // Filter: skip excluded emails, excluded domains, and automated senders
          if (excludeEmails?.has(result.email)) continue;
          const emailDomain = result.email.split('@')[1];
          if (emailDomain && excludeDomains?.has(emailDomain)) continue;
          if (isAutomatedSender(result.email)) continue;

          const existing = contacts.get(result.email);
          if (existing) {
            existing.interactionCount++;
            if (result.direction === 'sent') existing.sentCount++;
            else existing.receivedCount++;
            if (result.date && (!existing.lastInteractionAt || result.date > existing.lastInteractionAt)) {
              existing.lastInteractionAt = result.date;
            }
            existing.threadIds.add(metadata.threadId);
            if (result.isForwardingAddress && !existing.isForwardingAddress) {
              existing.isForwardingAddress = true;
              existing.forwardsToEmail = result.forwardsToEmail;
              forwardingCount++;
            }
          } else {
            contacts.set(result.email, {
              email: result.email,
              name: result.name,
              domain: result.email.split('@')[1] || '',
              interactionCount: 1,
              sentCount: result.direction === 'sent' ? 1 : 0,
              receivedCount: result.direction === 'received' ? 1 : 0,
              lastInteractionAt: result.date,
              threadIds: new Set([metadata.threadId]),
              isForwardingAddress: result.isForwardingAddress,
              forwardsToEmail: result.forwardsToEmail,
            });
            if (result.isForwardingAddress) forwardingCount++;
          }
        }

        onProgress?.({
          totalMessages: totalListed,
          scannedMessages: scanned,
          contactsFound: contacts.size,
          forwardingAddresses: forwardingCount,
        });
      }

      pageToken = listResult.nextPageToken;
    } while (pageToken);

    // Filter by min_interactions
    for (const [email, contact] of contacts) {
      if (contact.interactionCount < minInteractions) {
        contacts.delete(email);
      }
    }

    return contacts;
  },

  /**
   * List Gmail messages matching a query.
   */
  async listMessages(
    accessToken: string,
    query: string,
    pageToken?: string,
  ): Promise<GmailMessageListResponse> {
    const params = new URLSearchParams({
      q: query,
      maxResults: '500',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const url = `https://www.googleapis.com/gmail/v1/users/me/messages?${params}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error(`[GmailScan] List messages failed: ${response.status}`);
      return {};
    }

    return response.json();
  },

  /**
   * Fetch message metadata only (headers, no body).
   */
  async fetchMessageMetadata(
    accessToken: string,
    messageId: string,
  ): Promise<GmailMessageMetadata | null> {
    try {
      const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=X-Forwarded-To`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  },

  /**
   * Extract contact info from message metadata.
   * Returns null for messages that don't yield a useful contact
   * (e.g., emails from the user themselves with no external recipient).
   */
  extractContactFromMetadata(
    metadata: GmailMessageMetadata,
    userEmail: string,
  ): {
    email: string;
    name: string | null;
    direction: 'sent' | 'received';
    date: string | null;
    isForwardingAddress: boolean;
    forwardsToEmail: string | null;
  } | null {
    const headers = metadata.payload.headers;
    const fromHeader = headers.find((h) => h.name.toLowerCase() === 'from')?.value || '';
    const toHeader = headers.find((h) => h.name.toLowerCase() === 'to')?.value || '';
    const dateHeader = headers.find((h) => h.name.toLowerCase() === 'date')?.value || '';
    const xForwardedTo = headers.find((h) => h.name.toLowerCase() === 'x-forwarded-to')?.value;

    const fromEmail = extractEmailAddr(fromHeader);
    const fromName = extractNameFromHeader(fromHeader);
    const toEmail = extractEmailAddr(toHeader);

    if (!fromEmail) return null;

    const userEmailLower = userEmail.toLowerCase();
    const date = dateHeader ? new Date(dateHeader).toISOString() : null;

    // Detect forwarding address — only use X-Forwarded-To (explicit forwarding signal).
    // Delivered-To vs To mismatch is normal email routing, not forwarding.
    let isForwardingAddress = false;
    let forwardsToEmail: string | null = null;

    if (xForwardedTo) {
      const fwdEmail = extractEmailAddr(xForwardedTo);
      // Only flag as forwarding if X-Forwarded-To points to a DIFFERENT address
      // than both the sender AND the user. Google Workspace sets X-Forwarded-To
      // to the user's own address for normal routing — that's not a real forward.
      if (fwdEmail && fwdEmail !== fromEmail.toLowerCase() && fwdEmail !== userEmailLower) {
        isForwardingAddress = true;
        forwardsToEmail = fwdEmail;
      }
    }

    // Determine if this is a sent or received message
    if (fromEmail.toLowerCase() === userEmailLower) {
      // User sent this — the contact is the recipient
      if (!toEmail || toEmail.toLowerCase() === userEmailLower) return null;
      return {
        email: toEmail.toLowerCase(),
        name: extractNameFromHeader(toHeader),
        direction: 'sent',
        date,
        isForwardingAddress: false,
        forwardsToEmail: null,
      };
    } else {
      // User received this — the contact is the sender
      return {
        email: fromEmail.toLowerCase(),
        name: fromName,
        direction: 'received',
        date,
        isForwardingAddress,
        forwardsToEmail,
      };
    }
  },
};

// ============================================================
// Automated Sender Detection
// ============================================================

/** Prefixes that indicate automated/system senders */
const AUTOMATED_PREFIXES = [
  'noreply@', 'no-reply@', 'no_reply@',
  'donotreply@', 'do-not-reply@', 'do_not_reply@',
  'mailer-daemon@', 'postmaster@',
  'bounce@', 'bounces@',
  'notifications@', 'notification@',
  'alerts@', 'alert@',
  'updates@', 'update@',
  'news@', 'newsletter@', 'newsletters@',
  'digest@', 'weekly@', 'daily@',
  'support@', 'help@', 'info@',
  'billing@', 'invoice@', 'invoices@',
  'receipts@', 'receipt@',
  'feedback@', 'survey@',
  'calendar-notification@',
  'drive-shares-dm-noreply@',
];

/** Suffixes that indicate automated senders */
const AUTOMATED_SUFFIXES = [
  '-noreply@', '-no-reply@', '_noreply@',
  '-notifications@', '-alerts@',
  '-daemon@',
];

/** Domains that are entirely automated/notification senders */
const AUTOMATED_DOMAINS = new Set([
  'facebookmail.com',
  'googlemail.com', // mailer-daemon
  'e.linkedin.com',
  'bounce.google.com',
  'postmaster.twitter.com',
  'email.notifications.google.com',
  'redditmail.com',
  'quora.com',
  'medium.com',
  'substack.com',
  'mailchimp.com',
  'sendgrid.net',
  'amazonses.com',
  'mandrillapp.com',
  'constantcontact.com',
  'mailgun.org',
  'em.paypal.com',
  'cc.yahoo-inc.com',
]);

/** Specific automated sender addresses */
const AUTOMATED_ADDRESSES = new Set([
  'groups-noreply@linkedin.com',
  'invitations@linkedin.com',
  'security-noreply@linkedin.com',
  'messages-noreply@linkedin.com',
  'jobs-noreply@linkedin.com',
  'noreply-dmarc-support@google.com',
  'google-workspace-alerts-noreply@google.com',
  'no-reply@accounts.google.com',
  'calendar-notification@google.com',
  'drive-shares-dm-noreply@google.com',
  'mailer-daemon@googlemail.com',
  'dmarcreport@microsoft.com',
  'team@mail.notion.so',
  'hello@mail.apollo.io',
  'hello@thejuicer.io',
  'friendupdates@facebookmail.com',
  'circulationoffers@email.globe.com',
]);

/**
 * Detect if an email is from an automated sender (newsletter, noreply, system notification).
 */
function isAutomatedSender(email: string): boolean {
  const lower = email.toLowerCase();
  const domain = lower.split('@')[1];

  // Check exact address match
  if (AUTOMATED_ADDRESSES.has(lower)) return true;

  // Check domain
  if (domain && AUTOMATED_DOMAINS.has(domain)) return true;

  // Check prefix patterns
  for (const prefix of AUTOMATED_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }

  // Check suffix patterns (before the @)
  const localPart = lower.split('@')[0];
  for (const suffix of AUTOMATED_SUFFIXES) {
    const suffixLocal = suffix.split('@')[0];
    if (localPart.endsWith(suffixLocal)) return true;
  }

  return false;
}

// ============================================================
// Helpers
// ============================================================

function extractEmailAddr(header: string): string | null {
  const match = header.match(/<([^>]+)>/) || header.match(/([^\s<,]+@[^\s>,]+)/);
  return match ? match[1].toLowerCase() : null;
}

function extractNameFromHeader(header: string): string | null {
  const match = header.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : null;
}

function formatGmailDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}
