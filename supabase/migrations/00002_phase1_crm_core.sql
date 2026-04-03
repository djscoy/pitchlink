-- ============================================================
-- PitchLink Phase 1: Core CRM Tables
-- contacts, campaigns, pipeline_presets, deals, deal_activities
-- ============================================================

-- ============================================================
-- PIPELINE PRESETS
-- ============================================================

CREATE TABLE pipeline_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,  -- NULL = system default
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('buy', 'sell', 'exchange')),
  stages_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pipeline_presets_workspace ON pipeline_presets(workspace_id);
CREATE INDEX idx_pipeline_presets_mode ON pipeline_presets(mode);

CREATE TRIGGER trg_pipeline_presets_updated_at
  BEFORE UPDATE ON pipeline_presets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CONTACTS
-- ============================================================

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT DEFAULT '',
  domain TEXT DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT DEFAULT '',
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  enrichment_status TEXT NOT NULL DEFAULT 'none' CHECK (enrichment_status IN ('none', 'partial', 'full')),
  enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, email)
);

CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_domain ON contacts(domain);
CREATE INDEX idx_contacts_tags ON contacts USING gin(tags);

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CAMPAIGNS
-- ============================================================

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  client_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('buy', 'sell', 'exchange')),
  pipeline_preset_id UUID NOT NULL REFERENCES pipeline_presets(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaigns_workspace ON campaigns(workspace_id);
CREATE INDEX idx_campaigns_mode ON campaigns(mode);
CREATE INDEX idx_campaigns_status ON campaigns(status);

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DEALS
-- ============================================================

CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL,  -- stage id from pipeline preset's stages_json
  mode TEXT NOT NULL CHECK (mode IN ('buy', 'sell', 'exchange')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id, campaign_id)  -- one deal per contact per campaign
);

CREATE INDEX idx_deals_workspace ON deals(workspace_id);
CREATE INDEX idx_deals_contact ON deals(contact_id);
CREATE INDEX idx_deals_campaign ON deals(campaign_id);
CREATE INDEX idx_deals_stage ON deals(current_stage);

CREATE TRIGGER trg_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DEAL ACTIVITIES
-- ============================================================

CREATE TABLE deal_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'stage_changed', 'note_added', 'email_sent', 'email_received',
    'contact_enriched', 'sequence_enrolled', 'sequence_paused',
    'sequence_completed', 'tag_added', 'tag_removed'
  )),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deal_activities_deal ON deal_activities(deal_id);
CREATE INDEX idx_deal_activities_type ON deal_activities(type);
CREATE INDEX idx_deal_activities_created ON deal_activities(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE pipeline_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;

-- Pipeline Presets: system defaults (workspace_id IS NULL) readable by all, workspace-specific by members
CREATE POLICY pipeline_presets_select ON pipeline_presets
  FOR SELECT USING (
    workspace_id IS NULL
    OR workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY pipeline_presets_insert ON pipeline_presets
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY pipeline_presets_update ON pipeline_presets
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY pipeline_presets_delete ON pipeline_presets
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

-- Contacts: workspace-scoped
CREATE POLICY contacts_select ON contacts
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY contacts_insert ON contacts
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY contacts_update ON contacts
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY contacts_delete ON contacts
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

-- Campaigns: workspace-scoped
CREATE POLICY campaigns_select ON campaigns
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY campaigns_insert ON campaigns
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY campaigns_update ON campaigns
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY campaigns_delete ON campaigns
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

-- Deals: workspace-scoped
CREATE POLICY deals_select ON deals
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY deals_insert ON deals
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY deals_update ON deals
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY deals_delete ON deals
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
  );

-- Deal Activities: accessible if deal is accessible (via deal's workspace)
CREATE POLICY deal_activities_select ON deal_activities
  FOR SELECT USING (
    deal_id IN (
      SELECT id FROM deals
      WHERE workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
    )
  );

CREATE POLICY deal_activities_insert ON deal_activities
  FOR INSERT WITH CHECK (
    deal_id IN (
      SELECT id FROM deals
      WHERE workspace_id IN (SELECT workspace_id FROM users WHERE id = auth.uid())
    )
  );

-- ============================================================
-- SEED: Default Pipeline Presets (system-level, workspace_id = NULL)
-- ============================================================

INSERT INTO pipeline_presets (workspace_id, name, mode, stages_json, is_default) VALUES

-- Link Building — Buy
(NULL, 'Link Building — Buy', 'buy', '[
  {"id": "pitched", "name": "Pitched", "color": "#93C5FD", "position": 0},
  {"id": "quote-received", "name": "Quote Received", "color": "#60A5FA", "position": 1},
  {"id": "negotiating", "name": "Negotiating", "color": "#3B82F6", "position": 2},
  {"id": "payment-sent", "name": "Payment Sent", "color": "#2563EB", "position": 3},
  {"id": "content-live", "name": "Content Live", "color": "#1D4ED8", "position": 4},
  {"id": "verified", "name": "Verified", "color": "#1E40AF", "position": 5}
]'::jsonb, true),

-- Link Building — Sell
(NULL, 'Link Building — Sell', 'sell', '[
  {"id": "inquiry-in", "name": "Inquiry In", "color": "#6EE7B7", "position": 0},
  {"id": "quote-sent", "name": "Quote Sent", "color": "#34D399", "position": 1},
  {"id": "agreed", "name": "Agreed", "color": "#10B981", "position": 2},
  {"id": "payment-received", "name": "Payment Received", "color": "#059669", "position": 3},
  {"id": "published", "name": "Published", "color": "#047857", "position": 4},
  {"id": "reported", "name": "Reported", "color": "#065F46", "position": 5}
]'::jsonb, true),

-- Link Building — Exchange
(NULL, 'Link Building — Exchange', 'exchange', '[
  {"id": "proposed", "name": "Proposed", "color": "#C4B5FD", "position": 0},
  {"id": "agreed", "name": "Agreed", "color": "#A78BFA", "position": 1},
  {"id": "their-turn", "name": "Their Turn", "color": "#8B5CF6", "position": 2},
  {"id": "your-turn", "name": "Your Turn", "color": "#7C3AED", "position": 3},
  {"id": "both-verified", "name": "Both Verified", "color": "#6D28D9", "position": 4}
]'::jsonb, true),

-- General Sales
(NULL, 'General Sales', 'sell', '[
  {"id": "lead", "name": "Lead", "color": "#D1D5DB", "position": 0},
  {"id": "contacted", "name": "Contacted", "color": "#93C5FD", "position": 1},
  {"id": "qualified", "name": "Qualified", "color": "#60A5FA", "position": 2},
  {"id": "proposal-sent", "name": "Proposal Sent", "color": "#3B82F6", "position": 3},
  {"id": "negotiating", "name": "Negotiating", "color": "#F59E0B", "position": 4},
  {"id": "closed-won", "name": "Closed Won", "color": "#10B981", "position": 5},
  {"id": "closed-lost", "name": "Closed Lost", "color": "#EF4444", "position": 6}
]'::jsonb, true),

-- Freelance Services
(NULL, 'Freelance Services', 'sell', '[
  {"id": "lead-in", "name": "Lead In", "color": "#6EE7B7", "position": 0},
  {"id": "proposal-sent", "name": "Proposal Sent", "color": "#34D399", "position": 1},
  {"id": "negotiating", "name": "Negotiating", "color": "#F59E0B", "position": 2},
  {"id": "contract-signed", "name": "Contract Signed", "color": "#10B981", "position": 3},
  {"id": "invoiced", "name": "Invoiced", "color": "#3B82F6", "position": 4},
  {"id": "paid", "name": "Paid", "color": "#059669", "position": 5}
]'::jsonb, true),

-- PR & Media Outreach
(NULL, 'PR & Media Outreach', 'buy', '[
  {"id": "researched", "name": "Researched", "color": "#93C5FD", "position": 0},
  {"id": "pitched", "name": "Pitched", "color": "#60A5FA", "position": 1},
  {"id": "replied", "name": "Replied", "color": "#F59E0B", "position": 2},
  {"id": "follow-up", "name": "Follow-Up", "color": "#3B82F6", "position": 3},
  {"id": "coverage-secured", "name": "Coverage Secured", "color": "#10B981", "position": 4},
  {"id": "reported", "name": "Reported", "color": "#059669", "position": 5}
]'::jsonb, true),

-- Recruiting
(NULL, 'Recruiting', 'buy', '[
  {"id": "sourced", "name": "Sourced", "color": "#93C5FD", "position": 0},
  {"id": "contacted", "name": "Contacted", "color": "#60A5FA", "position": 1},
  {"id": "interested", "name": "Interested", "color": "#F59E0B", "position": 2},
  {"id": "interview", "name": "Interview", "color": "#8B5CF6", "position": 3},
  {"id": "offer", "name": "Offer", "color": "#3B82F6", "position": 4},
  {"id": "accepted", "name": "Accepted", "color": "#10B981", "position": 5}
]'::jsonb, true);
