/**
 * Email parsing utilities shared across services.
 */

/**
 * Extract an email address from a From header value.
 * Handles formats: "Name <email@example.com>" and "email@example.com"
 */
export function extractEmail(fromHeader: string): string | null {
  const match = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([^\s<]+@[^\s>]+)/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extract display name from a From header value.
 * Returns the name portion of "Name <email@example.com>", or null.
 */
export function extractName(fromHeader: string): string | null {
  const match = fromHeader.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : null;
}
