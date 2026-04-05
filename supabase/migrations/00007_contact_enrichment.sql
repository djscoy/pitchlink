-- ============================================================
-- Contact Enrichment
-- Stores cached enrichment data from external providers.
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_enrichment (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,          -- 'hunter', 'apollo', 'dataforseo', 'clearbit'
  data_json   JSONB NOT NULL DEFAULT '{}',
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),

  UNIQUE (contact_id, provider)
);

CREATE INDEX idx_enrichment_contact ON contact_enrichment(contact_id);
CREATE INDEX idx_enrichment_expires ON contact_enrichment(expires_at);

-- RLS
ALTER TABLE contact_enrichment ENABLE ROW LEVEL SECURITY;

CREATE POLICY enrichment_workspace_isolation ON contact_enrichment
  USING (
    contact_id IN (
      SELECT id FROM contacts WHERE workspace_id = current_setting('app.workspace_id', true)::uuid
    )
  );
