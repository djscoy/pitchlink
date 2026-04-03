-- ============================================================
-- PitchLink Phase 3: Inbox Identity Engine (IIE)
-- ============================================================

-- ============================================================
-- SOURCE REGISTRY
-- Maps forwarding email addresses to original senders.
-- Used by IIE to skip the detection cascade on repeat forwards.
-- ============================================================

CREATE TABLE source_registry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  forwarding_email TEXT NOT NULL,
  original_sender_email TEXT,
  original_sender_name TEXT,
  maps_to_client TEXT,
  maps_to_campaign UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  detection_method TEXT NOT NULL CHECK (detection_method IN ('header', 'body_regex', 'ai', 'human')),
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, forwarding_email)
);

CREATE INDEX idx_source_registry_workspace ON source_registry(workspace_id);
CREATE INDEX idx_source_registry_email ON source_registry(forwarding_email);

CREATE TRIGGER trg_source_registry_updated_at
  BEFORE UPDATE ON source_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE source_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY source_registry_select ON source_registry
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY source_registry_insert ON source_registry
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY source_registry_update ON source_registry
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY source_registry_delete ON source_registry
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );
