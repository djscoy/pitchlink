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
  excluded_emails?: string[];
  excluded_domains?: string[];
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
  | 'tag_removed'
  | 'forward_detected';

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
  original_sender_email?: string;
  original_sender_name?: string;
  maps_to_client?: string;
  maps_to_campaign?: string;
  detection_method: IIEDetectionLayer;
  confidence: number;
  created_at: string;
  updated_at: string;
}

// --- Inbox Identity Engine (IIE) ---

export type IIEDetectionLayer = 'registry' | 'header' | 'body_regex' | 'ai' | 'human' | 'unresolved';

export interface IIEResult {
  is_forwarded: boolean;
  original_sender_email?: string;
  original_sender_name?: string;
  confidence: number;
  detection_layer: IIEDetectionLayer;
  forwarding_email?: string;
}

export interface IIEAnalyzeRequest {
  gmail_message_id: string;
  thread_id?: string;
}

export interface IIEConfirmRequest {
  forwarding_email: string;
  original_sender_email: string;
  original_sender_name?: string;
  is_forward: boolean;
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

// --- Onboarding ---

export type OnboardingScanStatus = 'pending' | 'scanning' | 'classifying' | 'drafting' | 'complete' | 'failed' | 'committing' | 'committed' | 'commit_failed';

export type DealStatus = 'waiting_for_reply' | 'quoted_no_followup' | 'active_conversation' | 'completed_deal' | 'unclassified';

export type OnboardingContactStatus = 'pending' | 'accepted' | 'rejected' | 'imported';

export interface OnboardingScan {
  id: string;
  workspace_id: string;
  user_id: string;
  status: OnboardingScanStatus;
  time_range_days: number;
  min_interactions: number;
  total_messages: number;
  scanned_messages: number;
  total_contacts_found: number;
  classified_contacts: number;
  drafts_created: number;
  forwarding_addresses_found: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OnboardingContact {
  id: string;
  scan_id: string;
  workspace_id: string;
  email: string;
  name?: string;
  domain?: string;
  interaction_count: number;
  last_interaction_at?: string;
  sent_count: number;
  received_count: number;
  deal_status?: DealStatus;
  deal_status_confidence: number;
  classification_reason?: string;
  nudge_subject?: string;
  nudge_body?: string;
  nudge_gmail_draft_id?: string;
  is_forwarding_address: boolean;
  forwards_to_email?: string;
  status: OnboardingContactStatus;
  created_at: string;
  updated_at: string;
}

export interface OnboardingScanConfig {
  time_range_days: number;
  min_interactions: number;
  exclude_emails?: string[];
}

export interface OnboardingScanProgress {
  id: string;
  status: OnboardingScanStatus;
  total_messages: number;
  scanned_messages: number;
  total_contacts_found: number;
  classified_contacts: number;
  drafts_created: number;
  forwarding_addresses_found: number;
  error_message?: string;
}

// --- Auto-Reply ---

export interface AutoReplyRule {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  template_id: string;
  is_enabled: boolean;
  mode: 'auto_send' | 'draft_hold';
  delay_minutes: number;
  match_type: 'ai_classify' | 'all_new';
  receiving_emails: string[];
  max_per_hour: number;
  created_at: string;
  updated_at: string;
  template?: { id: string; name: string };
}

export type AutoReplyQueueStatus = 'pending' | 'sent' | 'drafted' | 'skipped' | 'failed';

export interface AutoReplyQueueItem {
  id: string;
  workspace_id: string;
  rule_id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  sender_email: string;
  sender_name: string | null;
  resolved_subject: string;
  resolved_body: string;
  status: AutoReplyQueueStatus;
  classification: string | null;
  scheduled_at: string;
  sent_at: string | null;
  draft_id: string | null;
  skip_reason: string | null;
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
