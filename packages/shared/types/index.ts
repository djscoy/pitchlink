// ============================================================
// PitchLink Core Types
// ============================================================

// --- Transaction Modes ---

export type TransactionMode = 'buy' | 'sell' | 'exchange';

// --- User & Workspace ---

export interface User {
  id: string;
  email: string;
  google_id: string;
  name: string;
  avatar_url?: string;
  plan_tier: PlanTier;
  workspace_id: string;
  created_at: string;
  updated_at: string;
}

export type PlanTier = 'free' | 'starter' | 'agency' | 'enterprise';

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  plan: PlanTier;
  settings_json: WorkspaceSettings;
  branding_json?: WorkspaceBranding;
  reseller_id?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSettings {
  default_mode: TransactionMode;
  auto_enrich_on_create: boolean;
  theme_preference: 'light' | 'dark' | 'system';
  enabled_verticals: string[];
}

export interface WorkspaceBranding {
  logo_url?: string;
  primary_color?: string;
  company_name?: string;
}

// --- Email Accounts ---

export interface EmailAccount {
  id: string;
  workspace_id: string;
  user_id: string;
  email: string;
  display_name: string;
  is_primary: boolean;
  is_send_as: boolean;
}

// --- Contacts ---

export interface Contact {
  id: string;
  workspace_id: string;
  email: string;
  name?: string;
  domain?: string;
  tags: string[];
  notes?: string;
  custom_fields: Record<string, string>;
  enrichment_status: EnrichmentStatus;
  enriched_at?: string;
  created_at: string;
  updated_at: string;
}

export type EnrichmentStatus = 'none' | 'partial' | 'full';

// --- Contact Enrichment ---

export interface ContactEnrichment {
  id: string;
  contact_id: string;
  provider: string;
  data_json: Record<string, unknown>;
  fetched_at: string;
  expires_at: string;
}

// --- Campaigns ---

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  client_id?: string;
  mode: TransactionMode;
  pipeline_preset_id: string;
  status: CampaignStatus;
  created_at: string;
  updated_at: string;
}

export type CampaignStatus = 'active' | 'paused' | 'archived' | 'completed';

// --- Pipeline ---

export interface PipelinePreset {
  id: string;
  workspace_id?: string; // null = system default
  name: string;
  mode: TransactionMode;
  stages_json: PipelineStage[];
  is_default: boolean;
}

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  icon?: string;
  position: number;
  auto_advance_on_reply?: boolean;
}

// --- Deals ---

export interface Deal {
  id: string;
  workspace_id: string;
  contact_id: string;
  campaign_id: string;
  current_stage: string; // stage id from pipeline preset
  mode: TransactionMode;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DealActivity {
  id: string;
  deal_id: string;
  type: DealActivityType;
  data: Record<string, unknown>;
  created_at: string;
}

export type DealActivityType =
  | 'stage_changed'
  | 'note_added'
  | 'email_sent'
  | 'email_received'
  | 'contact_enriched'
  | 'sequence_enrolled'
  | 'sequence_paused'
  | 'sequence_completed'
  | 'tag_added'
  | 'tag_removed';

// --- Templates ---

export interface Template {
  id: string;
  workspace_id: string;
  name: string;
  mode: TransactionMode;
  category?: string;
  subject: string;
  body_html: string;
  variables: string[];
  created_at: string;
  updated_at: string;
}

// --- Sequences ---

export interface Sequence {
  id: string;
  workspace_id: string;
  name: string;
  mode: TransactionMode;
  steps_json: SequenceStep[];
  trigger_rules: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  id: string;
  position: number;
  delay_days: number;
  template_id?: string;
  use_ai_generate: boolean;
  subject?: string;
  body_html?: string;
}

export interface SequenceEnrollment {
  id: string;
  sequence_id: string;
  deal_id: string;
  current_step: number;
  status: SequenceEnrollmentStatus;
  next_fire_at?: string;
  created_at: string;
  updated_at: string;
}

export type SequenceEnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled';

// --- Source Registry (IIE) ---

export interface SourceRegistryEntry {
  id: string;
  workspace_id: string;
  forwarding_email: string;
  maps_to_client?: string;
  maps_to_campaign?: string;
  created_at: string;
}

// --- Email Tracking ---

export interface EmailTracking {
  id: string;
  workspace_id: string;
  deal_id: string;
  gmail_message_id: string;
  direction: 'inbound' | 'outbound';
  template_id?: string;
  created_at: string;
}

// --- API Response Types ---

export interface ApiResponse<T> {
  data: T;
  error?: never;
}

export interface ApiError {
  data?: never;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;
