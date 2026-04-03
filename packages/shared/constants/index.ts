import type { TransactionMode, PipelineStage } from '../types';

// ============================================================
// Mode Configuration
// ============================================================

export const MODE_CONFIG: Record<
  TransactionMode,
  { label: string; emoji: string; color: string; bgColor: string }
> = {
  buy: {
    label: 'Buy',
    emoji: '\ud83d\udcb8',
    color: '#2563EB',
    bgColor: '#EFF6FF',
  },
  sell: {
    label: 'Sell',
    emoji: '\ud83d\udcb0',
    color: '#059669',
    bgColor: '#ECFDF5',
  },
  exchange: {
    label: 'Exchange',
    emoji: '\ud83d\udd04',
    color: '#7C3AED',
    bgColor: '#F5F3FF',
  },
};

export const TRANSACTION_MODES: TransactionMode[] = ['buy', 'sell', 'exchange'];

// ============================================================
// Pipeline Presets
// ============================================================

function makeStages(names: string[], colors: string[]): PipelineStage[] {
  return names.map((name, i) => ({
    id: name.toLowerCase().replace(/[\s/]+/g, '-'),
    name,
    color: colors[i] || '#6B7280',
    position: i,
  }));
}

export const DEFAULT_PIPELINE_PRESETS: {
  name: string;
  mode: TransactionMode;
  stages: PipelineStage[];
}[] = [
  {
    name: 'Link Building \u2014 Buy',
    mode: 'buy',
    stages: makeStages(
      ['Pitched', 'Quote Received', 'Negotiating', 'Payment Sent', 'Content Live', 'Verified'],
      ['#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8', '#1E40AF'],
    ),
  },
  {
    name: 'Link Building \u2014 Sell',
    mode: 'sell',
    stages: makeStages(
      ['Inquiry In', 'Quote Sent', 'Agreed', 'Payment Received', 'Published', 'Reported'],
      ['#6EE7B7', '#34D399', '#10B981', '#059669', '#047857', '#065F46'],
    ),
  },
  {
    name: 'Link Building \u2014 Exchange',
    mode: 'exchange',
    stages: makeStages(
      ['Proposed', 'Agreed', 'Their Turn', 'Your Turn', 'Both Verified'],
      ['#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED', '#6D28D9'],
    ),
  },
  {
    name: 'General Sales',
    mode: 'sell',
    stages: makeStages(
      ['Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiating', 'Closed Won', 'Closed Lost'],
      ['#D1D5DB', '#93C5FD', '#60A5FA', '#3B82F6', '#F59E0B', '#10B981', '#EF4444'],
    ),
  },
  {
    name: 'Freelance Services',
    mode: 'sell',
    stages: makeStages(
      ['Lead In', 'Proposal Sent', 'Negotiating', 'Contract Signed', 'Invoiced', 'Paid'],
      ['#6EE7B7', '#34D399', '#F59E0B', '#10B981', '#3B82F6', '#059669'],
    ),
  },
  {
    name: 'PR & Media Outreach',
    mode: 'buy',
    stages: makeStages(
      ['Researched', 'Pitched', 'Replied', 'Follow-Up', 'Coverage Secured', 'Reported'],
      ['#93C5FD', '#60A5FA', '#F59E0B', '#3B82F6', '#10B981', '#059669'],
    ),
  },
  {
    name: 'Recruiting',
    mode: 'buy',
    stages: makeStages(
      ['Sourced', 'Contacted', 'Interested', 'Interview', 'Offer', 'Accepted'],
      ['#93C5FD', '#60A5FA', '#F59E0B', '#8B5CF6', '#3B82F6', '#10B981'],
    ),
  },
];

// ============================================================
// Sidebar Dimensions
// ============================================================

export const SIDEBAR = {
  MIN_WIDTH: 220,
  MAX_WIDTH: 540,
  DEFAULT_WIDTH: 360,
  TOP_BAR_HEIGHT: 42,
} as const;

// ============================================================
// API & App Config
// ============================================================

export const APP_CONFIG = {
  APP_NAME: 'PitchLink',
  API_VERSION: 'v1',
  ENRICHMENT_TTL_DAYS: 30,
  GMAIL_WATCH_RENEWAL_DAYS: 6,
  MAX_SEQUENCE_STEPS: 5,
  MAX_NUDGE_DELAY_DAYS: 30,
} as const;

// ============================================================
// Rate Limits
// ============================================================

export const RATE_LIMITS = {
  GENERAL_API: { windowMs: 60_000, max: 100 },
  AI_ENDPOINTS: { windowMs: 60_000, max: 20 },
  WEBHOOK: { windowMs: 60_000, max: 500 },
} as const;
