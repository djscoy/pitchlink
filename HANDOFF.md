# PitchLink — New Chat Handoff Document

## What This Is

PitchLink is a **Gmail-native outreach CRM** that runs as a Chrome Extension sidebar inside Gmail. It is NOT a standalone web app. It is a persistent sidebar panel inside Gmail built with React + TypeScript + InboxSDK.

Read `CLAUDE.md` first — it has the full product spec, tech stack, database schema, and development principles. Read `DEVELOPMENT_PLAN.md` for the phase-by-phase build plan.

---

## Current State (as of April 5, 2026)

### Phases Complete

| Phase | Name | Status |
|-------|------|--------|
| 0 | Project Scaffolding | DONE |
| 1 | Core CRM Loop (Contacts, Pipeline, Campaigns, CSV Export) | DONE |
| 2 | Reply Detection (Gmail Pub/Sub) + Email Templates | DONE |
| 3 | Inbox Identity Engine (IIE) — 4-layer forward detection | DONE |
| 4 | AI Compose, Nudge Sequences, Contact Enrichment, Dashboard Metrics, Bulk Assignment | DONE |

### What's Next: Phase 5 — UI Polish, Theme System & Sidebar UX

The core functionality is all built. Phase 5 is about polish:
- CSS custom properties cleanup (remove any remaining hardcoded colors)
- Light/dark theme refinement and contrast audit
- Resizable sidebar with drag handle (220px–540px)
- Compact top bar polish (42px)
- Dashboard campaign cards with progress bars
- Contact card enrichment display polish
- Empty states and loading skeleton improvements
- Error state graceful degradation
- Keyboard shortcuts
- Performance audit

After Phase 5: Phase 6 is Beta & Launch (Sentry, feedback, Chrome Web Store submission, landing page, Stripe).

---

## Project Structure

```
C:\Users\scoy\projects\crm\
├── CLAUDE.md                  ← Full product spec — READ THIS FIRST
├── DEVELOPMENT_PLAN.md        ← Phased build plan with acceptance criteria
├── HANDOFF.md                 ← This file
├── packages/
│   ├── shared/                ← Shared types & constants
│   │   └── types/index.ts     ← All TypeScript interfaces
│   ├── api/                   ← Node.js + Express backend (port 3001)
│   │   └── src/
│   │       ├── routes/        ← 12 route files
│   │       ├── services/      ← 18 service files
│   │       ├── middleware/     ← auth.ts (Google OAuth + Supabase)
│   │       └── db/            ← supabase.ts (admin client)
│   └── extension/             ← Chrome Extension (React + TS + Webpack)
│       ├── src/
│       │   ├── sidebar/       ← Sidebar.tsx + ThemeProvider + views/ + components/
│       │   ├── background/    ← Service worker (MV3)
│       │   ├── gmail-adapter/ ← InboxSDK isolation layer
│       │   ├── iie/           ← Inbox Identity Engine client-side
│       │   ├── cache/         ← IndexedDB offline cache
│       │   └── utils/         ← api.ts (typed API client)
│       ├── manifest.json
│       └── webpack.config.js
└── supabase/
    └── migrations/            ← 7 migration files (00001–00007)
```

---

## Key Files You'll Work With

### Extension — Sidebar Views (10 files)
| File | Purpose |
|------|---------|
| `Sidebar.tsx` | Root component — tabs, routing, thread detection, mode switching |
| `ContactPanel.tsx` | Shows when email thread is open — contact info, campaigns, deals, stage changes, enrichment, sequence enrollment, compose |
| `DashboardView.tsx` | Shows when no thread open + Pipeline tab — metrics grid, campaign list, create campaign |
| `PipelineView.tsx` | Kanban-style view of deals by stage within a campaign |
| `NudgesView.tsx` | Nudges tab — Queue (active enrollments) and Sequences (manage sequences) |
| `TemplatePanel.tsx` | Templates tab — CRUD for email templates with variable system |
| `ComposePanel.tsx` | AI compose overlay — generates contextual emails via Claude API |
| `BulkAssignView.tsx` | Bulk assign contacts to campaigns — select contacts, create deals |
| `OnboardingView.tsx` | First-run onboarding — scans Gmail for existing contacts |
| `HistoryView.tsx` | History tab — deal activity log |
| `SourceRegistryView.tsx` | IIE source registry settings — forwarding address mappings |

### API — Routes (12 files)
`health`, `auth`, `contacts`, `campaigns`, `deals`, `pipeline-presets`, `templates`, `sequences`, `compose`, `iie`, `onboarding`, `gmail-webhook`

### API — Services (18 files)
`contacts`, `campaigns`, `deals`, `pipeline-presets`, `templates`, `sequences`, `sequence-executor`, `enrichment`, `ai-compose`, `nudge-drafter`, `forward-detection`, `ai-inference`, `source-registry`, `reply-detection`, `gmail-watch`, `gmail-scan`, `onboarding-scan`, `deal-classifier`

### Extension — API Client
`packages/extension/src/utils/api.ts` — Typed API client. All requests go through `chrome.runtime.sendMessage` to the service worker, which injects the auth token and proxies to the backend.

---

## Build & Test Commands

```bash
# Build shared types (MUST do first — other packages depend on it)
cd packages/shared && npx tsc

# Typecheck API (doesn't emit, just validates)
npx tsc --noEmit --project packages/api/tsconfig.json

# Build extension (creates dist/ folder for Chrome)
cd packages/extension && npx webpack --mode development

# Start API server (port 3001)
npm run dev --workspace=packages/api

# Start everything (API + extension watch)
npm run dev
```

### Loading the Extension in Chrome
1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select `packages/extension/dist`
4. **IMPORTANT:** After rebuilding, you must click the reload button on the extension card in `chrome://extensions` for changes to take effect. Chrome caches content scripts.

---

## Database

- **Supabase project ID:** `btfdfopavoylnwvuqmre`
- **Workspace ID (dev):** `55fede7f-a8ef-451b-b362-4148f7ae5b3d`
- **RLS:** Every table has `workspace_id`. Row-level security is enforced everywhere.
- **7 migrations** applied (00001–00007)

### Key Tables
`users`, `workspaces`, `email_accounts`, `contacts`, `contact_enrichment`, `campaigns`, `pipeline_presets`, `deals`, `deal_activities`, `templates`, `sequences`, `sequence_enrollments`, `source_registry`, `email_tracking`, `onboarding_scans`, `onboarding_contacts`

### Important Constraints
- `deals` has a unique constraint on `(contact_id, campaign_id)` — NOT `(workspace_id, contact_id, campaign_id)`. The bulk create upsert uses `onConflict: 'contact_id,campaign_id'` with `ignoreDuplicates: true`.
- `contact_enrichment` has a unique constraint on `(contact_id, provider)`.

---

## Auth Flow

1. Extension opens Gmail → InboxSDK injects sidebar
2. Service worker holds Google OAuth token (obtained via `chrome.identity.getAuthToken`)
3. All API requests go through service worker which injects `Authorization: Bearer <google_oauth_token>`
4. API middleware validates the Google token, looks up or auto-provisions user + workspace in Supabase
5. Every service method receives `workspaceId` from the auth middleware

---

## Architecture Decisions & Gotchas

### Extension runs in a cross-origin iframe
The sidebar is inside an iframe injected by InboxSDK. It CANNOT access the Gmail page DOM. All Gmail data comes from the Gmail API via the backend, or through InboxSDK's abstraction layer.

### InboxSDK isolation
All InboxSDK code lives in `gmail-adapter/`. Sidebar components never import InboxSDK directly. The `GmailAdapter` class exposes `onThreadView()` which fires with `ThreadViewData` (sender email, thread ID, message IDs) when the user opens an email.

### API client routing
`api.ts` doesn't call `fetch()` directly. It sends messages to the service worker via `chrome.runtime.sendMessage({ type: 'API_REQUEST', payload })`. The service worker (`background/service-worker.ts`) handles the actual HTTP request with auth token injection.

### Enrichment providers
Pluggable architecture via `EnrichmentProvider` interface. Currently only Hunter.io is implemented. The `enrichmentService.enrich()` method iterates all configured providers, caches results per provider with 30-day TTL, and merges results (first provider wins per field).

### Sequence enrollment lifecycle
`active` → `paused` (manual or reply_received) → `resumed` → `cancelled` or `completed`
- `pauseEnrollment(enrollmentId, reason)` — NO workspaceId param
- `resumeEnrollment(workspaceId, enrollmentId)`
- `cancelEnrollment(workspaceId, enrollmentId)`
- `pauseByDeal(dealId, reason)` — used by reply detection to auto-pause on reply

### AI Compose
Uses Anthropic Claude API (model: `claude-haiku-4-5-20251001`). The `ai-compose` service builds a context-aware prompt with contact data, campaign info, thread history, and mode-specific instructions.

### Three Transaction Modes
- **Buy** (Blue `#2563EB`) — You are acquiring something
- **Sell** (Green `#059669`) — You are fulfilling demand
- **Exchange** (Purple `#7C3AED`) — Both sides deliver

Every campaign, deal, template, and sequence is mode-scoped.

---

## Current Data State (Dev Environment)

- ~590 contacts imported via onboarding scan (real Gmail contacts)
- 1 campaign: "LNC Guest Posts - April 2026" (Buy mode, Link Building preset)
- 1 deal: blake@mybacklinks.co in the campaign at "Quote Received" stage
- 1 sequence: "Guest Post Follow-Up" (2 steps: 3d, 5d)
- 1 active sequence enrollment: blake mybacklinks enrolled in Guest Post Follow-Up
- Enrichment: No API keys configured (Hunter.io key not set), so enrichment returns "No enrichment providers configured"
- Templates: Several templates exist from Phase 2

---

## Known Issues & Improvement Areas

1. **Enrichment error display:** When enrichment fails (no API key), the frontend shows "API error: 400" instead of the actual message "No enrichment providers configured. Add API keys in settings." The error propagation from API → service worker → sidebar could show the actual error message.

2. **DEVELOPMENT_PLAN.md not updated:** The phase checkboxes are all still `[ ]` (not started). They should be marked complete. Consider updating them.

3. **Sequence executor not running:** The `sequence-executor.ts` service has the logic to fire sequence steps when `next_fire_at` is due, but there's no cron job or scheduler actually running it yet. It needs to be called periodically (e.g., every minute via `setInterval` or a proper job scheduler).

4. **Auto-send not implemented:** The Auto-Send toggle (Send Now vs Draft Hold) exists in the Phase 4 spec but the actual sending infrastructure (SendGrid or Gmail API send) is not wired up. Currently compose generates drafts only.

5. **Reply detection Pub/Sub:** The Gmail webhook endpoint and reply detection service exist, but the Pub/Sub subscription may need verification that it's actively receiving push notifications.

6. **No settings UI:** There's no settings panel for managing API keys (enrichment providers), auto-send preferences, or other workspace settings. This would be a good Phase 5 addition.

7. **Theme system:** Dark theme works well. Light theme exists but hasn't been thoroughly tested. Some components may have hardcoded dark-theme colors.

---

## Environment Variables Needed

```
SUPABASE_URL=https://btfdfopavoylnwvuqmre.supabase.co
SUPABASE_ANON_KEY=<key>
SUPABASE_SERVICE_ROLE_KEY=<key>
GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<secret>
EXTENSION_ID=<from chrome://extensions>
PORT=3001
ANTHROPIC_API_KEY=<key>
# HUNTER_API_KEY=<optional, for enrichment>
```

The `.env` file is at the repo root and is loaded by the API server.

---

## Git History (Recent Commits)

```
c866500 feat: campaign assignment UI in contact card, deals-by-contact API
daa3e68 fix: IIE thread ID fallback, Original Message regex, messageID retry
106e702 fix: auth middleware accepts Google OAuth tokens with auto-provisioning
c888df7 fix: use async InboxSDK APIs for thread/message ID resolution
c36e580 feat: Phase 3 — Inbox Identity Engine (IIE) for forward detection
2e375d1 fix: resolve InboxSDK MV3 integration issues for Gmail sidebar
d466d0c feat: PitchLink Phases 0-2 — scaffolding, core CRM, reply detection & templates
```

**IMPORTANT:** The Phase 4 features are NOT committed yet. There are 30+ uncommitted files. You should commit them before starting new work. Here are the uncommitted changes:

**Modified files (existing, updated for Phase 4):**
- `packages/api/src/index.ts` — Added new route imports (compose, onboarding, sequences)
- `packages/api/src/routes/campaigns.ts` — Added dashboard-stats route
- `packages/api/src/routes/contacts.ts` — Added enrichment routes + unassigned route
- `packages/api/src/routes/deals.ts` — Added bulk create route
- `packages/api/src/services/campaigns.ts` — Added getDashboardStats method
- `packages/api/src/services/contacts.ts` — Added listUnassigned method
- `packages/api/src/services/deals.ts` — Added bulkCreate method
- `packages/api/src/services/reply-detection.ts` — Added pauseByDeal on reply
- `packages/extension/src/gmail-adapter/GmailAdapter.ts` — Thread data improvements
- `packages/extension/src/sidebar/Sidebar.tsx` — Added NudgesView, BulkAssignView, OnboardingView
- `packages/extension/src/sidebar/views/ContactPanel.tsx` — Added enrichment, sequences, compose sections
- `packages/extension/src/sidebar/views/DashboardView.tsx` — Added metrics grid, bulk assign button
- `packages/extension/src/utils/api.ts` — Added all new API methods
- `packages/shared/types/index.ts` — Added Sequence, SequenceEnrollment, etc.

**New files (created for Phase 4):**
- `packages/api/src/routes/compose.ts`
- `packages/api/src/routes/onboarding.ts`
- `packages/api/src/routes/sequences.ts`
- `packages/api/src/services/ai-compose.ts`
- `packages/api/src/services/deal-classifier.ts`
- `packages/api/src/services/enrichment.ts`
- `packages/api/src/services/gmail-scan.ts`
- `packages/api/src/services/nudge-drafter.ts`
- `packages/api/src/services/onboarding-scan.ts`
- `packages/api/src/services/sequence-executor.ts`
- `packages/api/src/services/sequences.ts`
- `packages/extension/src/sidebar/views/BulkAssignView.tsx`
- `packages/extension/src/sidebar/views/ComposePanel.tsx`
- `packages/extension/src/sidebar/views/NudgesView.tsx`
- `packages/extension/src/sidebar/views/OnboardingView.tsx`
- `supabase/migrations/00005_onboarding_scan.sql`
- `supabase/migrations/00006_sequences.sql`
- `supabase/migrations/00007_contact_enrichment.sql`

**First thing to do:** Commit all these changes, then start Phase 5.
