-- ============================================================
-- Cleanup: Remove bogus source registry entries
--
-- Bug: IIE Layer 1 incorrectly used X-Forwarded-To header
-- (which contains the DESTINATION email) as the original_sender_email.
-- This created entries mapping real senders → user's own email.
--
-- Fix: Delete any source_registry entry where original_sender_email
-- matches a known user email or email_account in the same workspace.
-- ============================================================

DELETE FROM source_registry
WHERE id IN (
  SELECT sr.id
  FROM source_registry sr
  JOIN users u ON u.workspace_id = sr.workspace_id
  WHERE sr.original_sender_email = u.email
)
OR id IN (
  SELECT sr.id
  FROM source_registry sr
  JOIN email_accounts ea ON ea.workspace_id = sr.workspace_id
  WHERE sr.original_sender_email = ea.email
);
