-- ============================================================
-- PitchLink Phase 5: Nudge Sequences
-- sequences, sequence_enrollments
-- ============================================================

-- ============================================================
-- SEQUENCES
-- Reusable follow-up sequences with configurable steps
-- ============================================================

CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('buy', 'sell', 'exchange')),
  steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  trigger_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sequences_workspace ON sequences(workspace_id);
CREATE INDEX idx_sequences_mode ON sequences(workspace_id, mode);

-- RLS
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY sequences_workspace_isolation ON sequences
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Updated_at trigger
CREATE TRIGGER sequences_updated_at
  BEFORE UPDATE ON sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEQUENCE ENROLLMENTS
-- Tracks a deal's progress through a sequence
-- ============================================================

CREATE TABLE sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  pause_reason TEXT,
  next_fire_at TIMESTAMPTZ,
  last_fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active enrollment per deal per sequence
CREATE UNIQUE INDEX idx_enrollments_active_unique
  ON sequence_enrollments(deal_id, sequence_id)
  WHERE status IN ('active', 'paused');

CREATE INDEX idx_enrollments_workspace ON sequence_enrollments(workspace_id);
CREATE INDEX idx_enrollments_next_fire ON sequence_enrollments(next_fire_at)
  WHERE status = 'active' AND next_fire_at IS NOT NULL;
CREATE INDEX idx_enrollments_deal ON sequence_enrollments(deal_id);
CREATE INDEX idx_enrollments_sequence ON sequence_enrollments(sequence_id);

-- RLS
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrollments_workspace_isolation ON sequence_enrollments
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Updated_at trigger
CREATE TRIGGER enrollments_updated_at
  BEFORE UPDATE ON sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
