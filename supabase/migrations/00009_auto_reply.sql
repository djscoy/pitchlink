-- Auto-reply rules and queue for automated inbound inquiry responses
-- Supports two modes: 'auto_send' (sends after delay) and 'draft_hold' (creates Gmail draft for review)

CREATE TABLE auto_reply_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  template_id UUID NOT NULL REFERENCES templates(id),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  mode TEXT NOT NULL CHECK (mode IN ('auto_send', 'draft_hold')) DEFAULT 'draft_hold',
  delay_minutes INTEGER NOT NULL DEFAULT 10,
  match_type TEXT NOT NULL CHECK (match_type IN ('ai_classify', 'all_new')) DEFAULT 'ai_classify',
  receiving_emails TEXT[] DEFAULT '{}',
  max_per_hour INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auto_reply_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES auto_reply_rules(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  resolved_subject TEXT NOT NULL,
  resolved_body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'drafted', 'skipped', 'failed')) DEFAULT 'pending',
  classification TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  draft_id TEXT,
  skip_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auto_reply_queue_scheduled ON auto_reply_queue(scheduled_at)
  WHERE status = 'pending';

CREATE INDEX idx_auto_reply_rules_workspace ON auto_reply_rules(workspace_id)
  WHERE is_enabled = true;

-- RLS policies
ALTER TABLE auto_reply_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_reply_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auto_reply_rules_workspace" ON auto_reply_rules
  FOR ALL USING (workspace_id = current_setting('app.workspace_id')::UUID);

CREATE POLICY "auto_reply_queue_workspace" ON auto_reply_queue
  FOR ALL USING (workspace_id = current_setting('app.workspace_id')::UUID);
