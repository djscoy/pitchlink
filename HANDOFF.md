# PitchLink — New Chat Handoff Document

## What This Is

PitchLink is a **Gmail-native outreach CRM** that runs as a Chrome Extension sidebar inside Gmail. It is NOT a standalone web app. It is a persistent sidebar panel inside Gmail built with React + TypeScript + InboxSDK.

Read `CLAUDE.md` first — it has the full product spec, tech stack, database schema, and development principles. Read `DEVELOPMENT_PLAN.md` for the phase-by-phase build plan.

---

## Current State (as of April 8, 2026)

### Phases Complete

| Phase | Name | Status |
|-------|------|--------|
| 0 | Project Scaffolding | DONE |
| 1 | Core CRM Loop (Contacts, Pipeline, Campaigns, CSV Export) | DONE |
| 2 | Reply Detection (Gmail Pub/Sub) + Email Templates | DONE |
| 3 | Inbox Identity Engine (IIE) — 4-layer forward detection | DONE |
| 4 | AI Compose, Nudge Sequences, Contact Enrichment, Dashboard Metrics, Bulk Assignment | DONE |
| 5 | UI Polish — Light/dark theme, resizable sidebar, keyboard shortcuts, empty states | DONE |
| 6 | Beta & Launch — Auto-reply system, settings tabs, Railway deployment | IN PROGRESS |
| 7 | Enrichment & Discovery — Explorium/Vibe Prospecting, Hunter.io, Apollo.io | IN PROGRESS |

### What's Working End-to-End

- Chrome Extension sidebar (React + InboxSDK) inside Gmail
- Pipeline view with configurable stages per campaign
- Contact panel with enrichment, compose, sequence enrollment
- Template-based AI compose (Claude API) with variable resolution
- Outbound email detection + auto-advance pipeline stage via Gmail Pub/Sub
- Auto-reply system (AI classifier + pricing template) with draft-hold mode
- Sequence builder with visual banner (fire time, skip step), template per step
- Click-to-thread navigation from Pipeline and History views
- Settings panel (Auto-Reply | My Emails | Forwarding tabs)
- My Email Addresses management (114+ owned addresses for contact identification)
- Light/dark theme system with CSS custom properties
- Keyboard shortcuts (Alt+1-5 tabs, Alt+B/S/X modes, Escape to close)

---

## Deployment

### Railway (Backend API) — LIVE
- **URL:** `https://pitchlinkapi-production.up.railway.app`
- **Health check:** `https://pitchlinkapi-production.up.railway.app/api/health`
- **Railway project:** `terrific-ambition` → `@pitchlink/api` service
- **Auto-deploy:** Connected to `djscoy/pitchlink` `main` branch on GitHub
- **Background jobs running 24/7:**
  - Sequence executor: fires every 5 minutes
  - Auto-reply executor: fires every 60 seconds
- **Environment:** `NODE_ENV=production`, env vars set in Railway dashboard
- **Config:** `railway.json` at repo root (build/start commands, restart policy)
- **CORS:** Production blocks localhost, allows `chrome-extension://` origins
- **Health check is currently DISABLED** in Railway settings (was causing deploy failures). Can re-enable once stable.

### GCP Pub/Sub (Gmail Notifications) — LIVE
- **Project:** `PitchLinkCRM`
- **Topic:** `pitchlink-gmail-notifications`
- **Subscription:** `pitchlink-gmail-notifications-sub` (Push type)
- **Push endpoint:** `https://pitchlinkapi-production.up.railway.app/api/gmail/webhook`

### Supabase (Database) — LIVE
- **Project ID:** `btfdfopavoylnwvuqmre`
- **9 migrations** applied (00001–00009)

### Chrome Extension
- **Build:** `npm run build --workspace=packages/extension` (webpack production mode)
- **API target:** Production build → Railway URL, dev build → `localhost:3001`
- **Configured via:** `webpack.DefinePlugin` injects `__API_BASE__` at build time
- **Dev mode:** `npm run dev` uses localhost as always

---

## Project Structure

```
C:\Users\scoy\projects\crm\
├── CLAUDE.md                  ← Full product spec — READ THIS FIRST
├── DEVELOPMENT_PLAN.md        ← Phased build plan with acceptance criteria
├── HANDOFF.md                 ← This file
├── railway.json               ← Railway deployment config
├── packages/
│   ├── shared/                ← Shared types & constants (CommonJS output)
│   │   ├── types/index.ts     ← All TypeScript interfaces
│   │   ├── constants/index.ts ← Modes, colors, pipeline presets, rate limits
│   │   └── theme/index.ts     ← CSS custom properties and theme utilities
│   ├── api/                   ← Node.js + Express backend
│   │   └── src/
│   │       ├── index.ts       ← Express app, route mounting, executor startup
│   │       ├── routes/        ← 14 route files
│   │       ├── services/      ← 17+ service files
│   │       ├── middleware/     ← auth.ts, rate-limit.ts
│   │       ├── db/            ← supabase.ts (admin client)
│   │       └── utils/         ← email.ts (parsing helpers)
│   └── extension/             ← Chrome Extension (React + TS + Webpack)
│       ├── src/
│       │   ├── sidebar/       ← Sidebar.tsx + ThemeProvider + views/ + components/ + hooks/
│       │   ├── background/    ← Service worker (MV3) — proxies API requests with auth
│       │   ├── gmail-adapter/ ← InboxSDK isolation layer
│       │   ├── iie/           ← Inbox Identity Engine client-side
│       │   ├── cache/         ← IndexedDB offline cache
│       │   ├── utils/         ← api.ts (typed API client via chrome.runtime.sendMessage)
│       │   ├── globals.d.ts   ← TypeScript declaration for __API_BASE__
│       │   └── styles/        ← CSS (theme system)
│       ├── manifest.json
│       └── webpack.config.js  ← DefinePlugin for API_BASE (dev vs prod)
└── supabase/
    └── migrations/            ← 9 migration files (00001–00009)
```

---

## Key Files

### Extension — Sidebar Views (12+ files)
| File | Purpose |
|------|---------|
| `Sidebar.tsx` | Root component — tabs, routing, thread detection, mode switching |
| `ContactPanel.tsx` | Thread view — contact info, deals, stage changes, enrichment, sequences, compose |
| `DashboardView.tsx` | No-thread view — metrics grid, campaign list, create campaign |
| `PipelineView.tsx` | Kanban-style view of deals by stage within a campaign |
| `NudgesView.tsx` | Queue (active enrollments) and Sequences library |
| `TemplatePanel.tsx` | Templates tab — CRUD with variable system |
| `ComposePanel.tsx` | AI compose — generates contextual emails via Claude API |
| `HistoryView.tsx` | History tab — global deal activity log |
| `DiscoveryView.tsx` | Discovery tab — domain/people search for prospecting |
| `BulkAssignView.tsx` | Bulk assign contacts to campaigns |
| `OnboardingView.tsx` | First-run onboarding — scans Gmail for contacts |
| `AutoReplySettingsView.tsx` | Auto-reply rule configuration and queue |
| `MyEmailsView.tsx` | Manage owned email addresses (for contact identification) |
| `SourceRegistryView.tsx` | IIE forwarding address mappings |

### API — Routes (14 files)
`health`, `auth`, `contacts`, `campaigns`, `deals`, `pipeline-presets`, `templates`, `sequences`, `compose`, `iie`, `onboarding`, `gmail-webhook`, `replies`, `auto-reply`, `discovery`

### API — Key Services
| Service | Purpose |
|---------|---------|
| `reply-detection.ts` | Processes Gmail Pub/Sub notifications — reply detect, outbound detect, auto-reply trigger |
| `sequence-executor.ts` | Fires due sequence steps every 5 min, creates Gmail drafts |
| `auto-reply-executor.ts` | Processes auto-reply queue every 60s |
| `auto-reply.ts` | Classifies inbound emails, matches rules, queues responses |
| `ai-compose.ts` | Claude API for email generation + Gmail draft creation |
| `inquiry-classifier.ts` | AI classification for auto-reply (is_inquiry, confidence) |
| `sequences.ts` | Sequence CRUD & enrollment lifecycle |
| `enrichment.ts` | Multi-provider contact enrichment (Hunter, Apollo, DataForSEO, Explorium) |
| `discovery.ts` | Contact discovery/prospecting provider integrations |
| `forward-detection.ts` | IIE 4-layer cascade for identifying forwarded email senders |
| `gmail-watch.ts` | Register/renew Gmail Pub/Sub watches |

---

## Database

- **Supabase project ID:** `btfdfopavoylnwvuqmre`
- **Workspace ID (dev):** `55fede7f-a8ef-451b-b362-4148f7ae5b3d`
- **RLS:** Every table has `workspace_id`. Row-level security is enforced everywhere.
- **9 migrations** applied (00001–00009)

### Key Tables
`users`, `workspaces`, `email_accounts`, `contacts`, `contact_enrichment`, `campaigns`, `pipeline_presets`, `deals`, `deal_activities`, `templates`, `sequences`, `sequence_enrollments`, `source_registry`, `email_tracking`, `onboarding_state`, `gmail_watch_state`, `auto_reply_config`, `inquiry_classifications`

### Important Constraints
- `deals` has a unique constraint on `(contact_id, campaign_id)` — NOT `(workspace_id, contact_id, campaign_id)`
- `contact_enrichment` has a unique constraint on `(contact_id, provider)`

---

## Current Data State

- **1 user:** `mail@scoyagency.com`
- **1 workspace**
- **4 campaigns:**
  - LiveNewsChat.eu (sell mode)
  - LNC Guest Posts April 2026 (buy mode)
  - Test Campaign Q2 (buy mode)
  - Q2 2026 Link Exchange (exchange mode)
- **~590 contacts** imported via onboarding scan
- **114 owned email addresses** in workspace settings
- Templates, sequences, deals all populated

### Active LNC Sell Campaign
Selling guest posts on livenewschat.eu. Current pricing:
- $125 Regular Niches
- $150 Essay Writing / Finance/Forex / Legal Injury
- $195 Casino, Sportsbook, CBD, Crypto, Dating
- Link Insertions: $85 Regular, $125 Finance, $175 Casino
- Terms: 2-3 dofollow links, no sponsored tag, permanent, 36hr TAT, payment after live link

---

## Auth Flow

1. Extension opens Gmail → InboxSDK injects sidebar
2. Service worker holds Google OAuth token (obtained via `chrome.identity.getAuthToken`)
3. All API requests go through service worker which injects `Authorization: Bearer <google_oauth_token>`
4. API middleware validates the Google token, looks up or auto-provisions user + workspace in Supabase
5. Every service method receives `workspaceId` from the auth middleware

---

## Architecture Decisions & Gotchas

### Extension API routing
The extension sidebar does NOT call `fetch()` directly. All requests go: sidebar → `chrome.runtime.sendMessage({ type: 'API_REQUEST' })` → service worker → `fetch(API_BASE + path)` with auth token → backend API.

The `API_BASE` is injected at webpack build time:
- Dev build (`--mode development`): `http://localhost:3001/api`
- Prod build (`--mode production`): `https://pitchlinkapi-production.up.railway.app/api`

### InboxSDK isolation
All InboxSDK code lives in `gmail-adapter/`. Sidebar components never import InboxSDK directly. The `GmailAdapter` class exposes `onThreadView()` which fires with thread data when the user opens an email.

### Three Transaction Modes
- **Buy** (Blue `#2563EB`) — You are acquiring something
- **Sell** (Green `#059669`) — You are fulfilling demand
- **Exchange** (Purple `#7C3AED`) — Both sides deliver

Every campaign, deal, template, and sequence is mode-scoped.

### Sequence enrollment lifecycle
`active` → `paused` (manual or reply_received) → `resumed` → `cancelled` or `completed`
- Reply detection auto-pauses active enrollments when a contact replies

### Auto-reply flow
Inbound email → reply-detection service → auto-reply service classifies → matches rule → resolves template → queues with delay → auto-reply executor fires (draft or send)

### Draft-Hold Mode
User preference: save to Gmail Drafts for review instead of auto-sending. Both sequences and auto-replies support this.

---

## Build & Test Commands

```bash
# Start everything (API + extension watch) for local development
npm run dev

# Build all packages
npm run build

# Build shared types (MUST do first — other packages depend on it)
npm run build --workspace=packages/shared

# Build API
npm run build --workspace=packages/api

# Build extension (production — points to Railway)
npm run build --workspace=packages/extension

# Build extension (dev — points to localhost)
npm run dev --workspace=packages/extension

# Typecheck everything
npm run typecheck
```

### Loading the Extension in Chrome
1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select `packages/extension/dist`
4. After rebuilding, click the reload button on the extension card

---

## Known Issues

1. **Extension may lose auth session** — restart API server + refresh Gmail to fix
2. **Gmail Pub/Sub watch** needs periodic renewal (every 7 days) — currently manual
3. **Enrichment providers** — most API keys not configured yet (Hunter, Apollo, Explorium)
4. **Railway health check disabled** — was causing deploy failures, can re-enable later
5. **Auto-send not implemented** — sequences and auto-reply create drafts only (by user preference)

---

## What's Next

### Phase 6 (remaining)
- Sentry monitoring integration
- Chrome Web Store listing
- Landing page
- Stripe billing integration
- Re-enable Railway health check

### Phase 7 (remaining)
- Enrichment provider configuration UI in settings
- Discovery search optimization
- Bulk enrichment improvements

### Phase 8+
- Team collaboration (multi-user workspaces)
- Client reporting (white-label reports for clients)
- White-label reseller layer
- Mobile support (Gmail Workspace Add-On)

---

## Environment Variables

### Local Development (`.env` at repo root)
```
SUPABASE_URL=https://btfdfopavoylnwvuqmre.supabase.co
SUPABASE_ANON_KEY=<key>
SUPABASE_SERVICE_ROLE_KEY=<key>
GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<secret>
EXTENSION_ID=<from chrome://extensions>
PORT=3001
NODE_ENV=development
ANTHROPIC_API_KEY=<key>
GCP_PROJECT_ID=<project-id>
GCP_PUBSUB_TOPIC=pitchlink-gmail-notifications
GMAIL_WEBHOOK_URL=https://pitchlinkapi-production.up.railway.app/api/gmail/webhook
```

### Railway Production (set in Railway dashboard)
Same vars as above, plus `NODE_ENV=production`. Do NOT set `PORT` — Railway injects it automatically.

---

## Git History (Recent)

```
ab3e87a fix: set Railway production URL and remove health check for stable deploy
e590ab0 chore: trigger Railway redeploy
b4c278e fix: compile shared package to CommonJS for Railway Node.js runtime
97e8731 feat: Railway deployment — configurable API_BASE, production CORS, health check
c7a0bcc feat: enhanced sequence builder — visual banner with fire time, skip step, template per step
239f136 feat: click history activity to jump to contact's Gmail thread
c307431 feat: click contact name in pipeline to jump to their Gmail thread
0c409b8 feat: auto-advance pipeline stage when user sends email to contact
fbb2990 feat: template-based AI compose — pick a template, AI personalizes it
abbade6 fix: split settings into tabbed layout (Auto-Reply | My Emails | Forwarding)
1c14b7f feat: auto-reply system for inbound guest post inquiries
40a410b feat: add Vibe Prospecting (Explorium) as enrichment & discovery provider
58a3698 feat: Phase 2B — contact enrichment, discovery, and IIE fix
```

All changes are committed and pushed to `main`. Railway auto-deploys on push.
