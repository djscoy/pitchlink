-- ============================================================
-- PitchLink Phase 2: Templates + Gmail Watch State
-- ============================================================

-- ============================================================
-- GMAIL WATCH STATE
-- Tracks Gmail Pub/Sub watch registration per user
-- ============================================================

CREATE TABLE gmail_watch_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  history_id TEXT,
  watch_expiry TIMESTAMPTZ,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gmail_watch_user ON gmail_watch_state(user_id);
CREATE INDEX idx_gmail_watch_expiry ON gmail_watch_state(watch_expiry);

CREATE TRIGGER trg_gmail_watch_updated_at
  BEFORE UPDATE ON gmail_watch_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TEMPLATES
-- ============================================================

CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('buy', 'sell', 'exchange')),
  category TEXT DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  variables TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_templates_workspace ON templates(workspace_id);
CREATE INDEX idx_templates_mode ON templates(mode);

CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE gmail_watch_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Gmail Watch State: user can only access own record
CREATE POLICY gmail_watch_select ON gmail_watch_state
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY gmail_watch_insert ON gmail_watch_state
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY gmail_watch_update ON gmail_watch_state
  FOR UPDATE USING (user_id = auth.uid());

-- Templates: workspace-scoped
CREATE POLICY templates_select ON templates
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY templates_insert ON templates
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY templates_update ON templates
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY templates_delete ON templates
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

-- ============================================================
-- Add auto_advance_on_reply to pipeline stage config
-- (No schema change needed — it's already in stages_json JSONB)
-- Just documenting that stages_json entries can include:
--   { "auto_advance_on_reply": true }
-- ============================================================
