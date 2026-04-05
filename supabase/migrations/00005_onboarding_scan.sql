-- ============================================================
-- PitchLink Phase 4: AI Onboarding Intelligence System
-- ============================================================

-- ============================================================
-- ONBOARDING SCANS
-- Tracks the state and progress of inbox scan jobs.
-- ============================================================

CREATE TABLE onboarding_scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scanning', 'classifying', 'drafting', 'complete', 'failed')),
  time_range_days INTEGER NOT NULL DEFAULT 90,
  min_interactions INTEGER NOT NULL DEFAULT 1,
  -- Progress tracking
  total_messages INTEGER DEFAULT 0,
  scanned_messages INTEGER DEFAULT 0,
  total_contacts_found INTEGER DEFAULT 0,
  classified_contacts INTEGER DEFAULT 0,
  drafts_created INTEGER DEFAULT 0,
  forwarding_addresses_found INTEGER DEFAULT 0,
  -- Errors
  error_message TEXT,
  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_scans_workspace ON onboarding_scans(workspace_id);
CREATE INDEX idx_onboarding_scans_user ON onboarding_scans(user_id);

CREATE TRIGGER trg_onboarding_scans_updated_at
  BEFORE UPDATE ON onboarding_scans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ONBOARDING CONTACTS
-- Staging table: contacts discovered during scan, pending user review.
-- Users can accept/reject/edit before committing to main contacts table.
-- ============================================================

CREATE TABLE onboarding_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_id UUID NOT NULL REFERENCES onboarding_scans(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Contact info (extracted from email headers)
  email TEXT NOT NULL,
  name TEXT,
  domain TEXT,
  -- Interaction stats
  interaction_count INTEGER NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  sent_count INTEGER NOT NULL DEFAULT 0,
  received_count INTEGER NOT NULL DEFAULT 0,
  -- AI classification
  deal_status TEXT CHECK (deal_status IN ('waiting_for_reply', 'quoted_no_followup', 'active_conversation', 'completed_deal', 'unclassified')),
  deal_status_confidence REAL DEFAULT 0,
  classification_reason TEXT,
  -- Nudge draft (if applicable)
  nudge_subject TEXT,
  nudge_body TEXT,
  nudge_gmail_draft_id TEXT,
  -- Forward detection
  is_forwarding_address BOOLEAN DEFAULT FALSE,
  forwards_to_email TEXT,
  -- User review
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'imported')),
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_contacts_scan ON onboarding_contacts(scan_id);
CREATE INDEX idx_onboarding_contacts_workspace ON onboarding_contacts(workspace_id);
CREATE INDEX idx_onboarding_contacts_email ON onboarding_contacts(email);
CREATE INDEX idx_onboarding_contacts_status ON onboarding_contacts(status);

CREATE TRIGGER trg_onboarding_contacts_updated_at
  BEFORE UPDATE ON onboarding_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE onboarding_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_scans_select ON onboarding_scans
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY onboarding_scans_insert ON onboarding_scans
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY onboarding_scans_update ON onboarding_scans
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

ALTER TABLE onboarding_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_contacts_select ON onboarding_contacts
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY onboarding_contacts_insert ON onboarding_contacts
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY onboarding_contacts_update ON onboarding_contacts
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY onboarding_contacts_delete ON onboarding_contacts
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );
