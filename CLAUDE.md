# PITCHLINK

## What This Is

PitchLink is a **Gmail-native outreach CRM** that lives inside Gmail as a Chrome Extension sidebar. It is NOT a standalone web app. It is a persistent sidebar panel inside Gmail that transforms into a full pipeline, contact database, sequence manager, and client reporting tool — without the user ever leaving their inbox.

## Who It's For

Any business that runs deals through email. Launch vertical is guest post & link building agencies, but the architecture supports any industry: sales, recruiting, PR, freelancing, wholesale, real estate — any outreach-driven workflow.

## The Three Transaction Modes

Every deal follows one of three patterns. The mode determines pipeline stages, sidebar context, AI templates, and nudge logic.

- **💸 Buy Mode (Blue #2563EB)** — You are acquiring something. You initiate, pitch, negotiate, pay, verify.
- **💰 Sell Mode (Green #059669)** — You are fulfilling inbound demand. They reach out, you qualify, quote, deliver.
- **🔄 Exchange Mode (Purple #7C3AED)** — Both sides deliver. Two parallel checklists, two verification steps.

## Core Differentiators

### 1. Gmail-Native
Lives inside Gmail. Not integrated with Gmail. Not syncing to Gmail. INSIDE it. Chrome Extension (InboxSDK + React) for desktop. Workspace Add-On (Card Service) for mobile (Phase 2).

### 2. Configurable Pipeline Engine
Pipeline stages are NOT hardcoded. Users choose from vertical presets (Link Building, Sales, Freelance, PR, Recruiting) or define custom stages. Each stage has a name, color, position, and optional automation trigger.

### 3. Inbox Identity Engine (IIE)
Four-layer forward detection cascade that correctly identifies the original sender of forwarded emails:
- **Layer 1 — Header Parsing:** X-Forwarded-To, Delivered-To, Received chain
- **Layer 2 — Body Pattern Regex:** Gmail/Outlook/Yahoo forward blocks, manual forward phrases
- **Layer 3 — AI Inference:** Claude API with structured prompt (~$0.001/call)
- **Layer 4 — Human Confirmation:** Sidebar prompt for unresolvable cases, one-click, remembered forever

Results cached to **Source Registry** — a settings table mapping forwarding addresses to client campaigns. Auto-detect with manual override.

### 4. AI Compose + Auto-Send Engine
- Mode-aware AI compose overlay (Claude API)
- Two auto-send sub-modes: send immediately on schedule, OR save to Gmail Drafts for manual review
- Nudge sequences: schedule-based, auto-pause on reply detection, resume control in sidebar

### 5. Contact Enrichment & Discovery
Two complementary capabilities that turn PitchLink from a passive CRM into an active prospecting tool:

**Enrichment (enrich contacts you already have):**
When a contact is added or an email is opened, PitchLink can auto-enrich with data from external providers. Enrichment is modular — different verticals get different data:
- **Universal:** Full name, company, job title, LinkedIn URL, social profiles, company size, location
- **SEO vertical (optional):** Domain Rating, monthly traffic, spam score, backlink profile, niche category
- **Sales vertical (optional):** Company revenue, funding stage, tech stack, employee count
- **Recruiting vertical (optional):** Candidate seniority, skills, current employer

Enrichment providers (pluggable architecture — swap or stack):
- **Hunter.io** — email verification + company data (good free tier)
- **Apollo.io API** — rich company + person data (strong for sales/recruiting)
- **DataForSEO** — domain metrics, DR, traffic (SEO vertical)
- **Clearbit / People Data Labs** — deep person + company enrichment (premium)

Enrichment runs: on contact creation (auto), on-demand via sidebar button, or in bulk via campaign-level "Enrich All" action.

**Discovery (find NEW contacts you don't have yet):**
A prospecting panel in the sidebar where users can search for contacts by criteria and add them directly to campaigns:
- Search by domain → find email addresses associated with a website
- Search by niche/industry → find relevant sites and contacts
- Search by role/title at a company → find decision-makers
- Filter by domain metrics (DR, traffic) for SEO users

Discovery providers:
- **Hunter.io Domain Search** — find emails by domain
- **Apollo.io Search** — find people by company, title, industry
- **Google Custom Search API** — find sites by niche keywords (for SEO prospecting)

Discovery results appear in sidebar as cards with one-click "Add to Campaign" action.

### 6. White-Label Reseller Layer
Agencies can resell PitchLink under their own brand. Multi-tenant architecture with row-level security, custom branding, subdomain routing.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Chrome Extension | React + TypeScript + InboxSDK (Manifest V3) |
| Backend API | Node.js + Express (deploy to Railway or Render) |
| Database | PostgreSQL via Supabase (RLS for multi-tenant) |
| Auth | Supabase Auth + Google OAuth 2.0 |
| Email Data | Gmail API (OAuth scopes) |
| IIE Forward Detection | mailparser + custom regex + Claude API |
| Pipeline Engine | PostgreSQL + configurable JSON schema |
| Domain Metrics | DataForSEO API (optional module, enable per vertical) |
| Contact Enrichment | Hunter.io + Apollo.io + Clearbit/PDL (pluggable, vertical-specific) |
| Contact Discovery | Hunter.io Domain Search + Apollo.io Search + Google Custom Search API |
| AI Drafting | Anthropic Claude API (Haiku for speed, Sonnet for complex) |
| Email Sequences | Custom Node.js + SendGrid |
| Reply Detection | Gmail Pub/Sub push notifications (not polling) |
| Offline Cache | IndexedDB via `idb` library (offline-first reads) |
| File Storage | Supabase Storage |
| Analytics | PostHog (self-hosted) |
| Monitoring | Sentry + Uptime Robot |
| Rate Limiting | express-rate-limit (per-user, per-endpoint) |

## Project Structure

```
pitchlink/
├── CLAUDE.md                  ← You are here
├── DEVELOPMENT_PLAN.md        ← Phased build spec with acceptance criteria
├── packages/
│   ├── extension/             ← Chrome Extension (React + TS + InboxSDK)
│   │   ├── src/
│   │   │   ├── sidebar/       ← Sidebar React components (+ ThemeProvider)
│   │   │   ├── compose/       ← Compose window integration
│   │   │   ├── background/    ← Service worker (Manifest V3)
│   │   │   ├── gmail-adapter/ ← Thin InboxSDK isolation layer (swappable)
│   │   │   ├── iie/           ← Inbox Identity Engine (client-side layers)
│   │   │   ├── cache/         ← IndexedDB offline cache layer
│   │   │   └── utils/
│   │   ├── manifest.json
│   │   ├── webpack.config.js
│   │   └── package.json
│   ├── api/                   ← Backend API (Node.js + Express)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   └── db/
│   │   └── package.json
│   └── shared/                ← Shared types & utilities
│       ├── types/
│       └── package.json
├── supabase/
│   ├── migrations/            ← Database migrations
│   └── seed.sql               ← Pipeline presets, default templates
├── .env.example
└── package.json               ← Monorepo root (npm workspaces)
```

## Database Schema (Core Tables)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| users | id, email, google_id, name, plan_tier, workspace_id | User accounts |
| workspaces | id, name, owner_id, plan, settings_json, branding_json, reseller_id | Multi-tenant workspace |
| email_accounts | id, workspace_id, user_id, email, display_name, is_primary, is_send_as | Gmail aliases & send-as addresses |
| contacts | id, workspace_id, email, name, domain, tags[], notes, custom_fields{}, enrichment_status, enriched_at | Contact database |
| contact_enrichment | id, contact_id, provider, data_json{}, fetched_at, expires_at | Cached enrichment data per provider |
| campaigns | id, workspace_id, name, client_id, mode, pipeline_preset_id, status | Groups contacts into projects |
| pipeline_presets | id, workspace_id, name, mode, stages_json[], is_default | Configurable pipeline definitions |
| deals | id, workspace_id, contact_id, campaign_id, current_stage, mode, metadata{} | Contact's position in pipeline |
| deal_activities | id, deal_id, type, data{}, created_at | Activity log per deal |
| templates | id, workspace_id, name, mode, category, subject, body_html, variables[] | Email template library |
| sequences | id, workspace_id, name, mode, steps_json[], trigger_rules{} | Nudge/follow-up sequences |
| sequence_enrollments | id, sequence_id, deal_id, current_step, status, next_fire_at | Sequence progress tracking |
| source_registry | id, workspace_id, forwarding_email, maps_to_client, maps_to_campaign | IIE Source Registry |
| email_tracking | id, workspace_id, deal_id, gmail_message_id, direction, template_id | Email event tracking |

**CRITICAL:** Every table has workspace_id. Row-level security enforces data isolation. This is non-negotiable for white-label multi-tenancy.

## Pipeline Presets (Ship With These)

### Link Building — Buy
Pitched → Quote Received → Negotiating → Payment Sent → Content Live → Verified

### Link Building — Sell
Inquiry In → Quote Sent → Agreed → Payment Received → Published → Reported

### Link Building — Exchange
Proposed → Agreed → Their Turn → Your Turn → Both Verified

### General Sales
Lead → Contacted → Qualified → Proposal Sent → Negotiating → Closed Won / Lost

### Freelance Services
Lead In → Proposal Sent → Negotiating → Contract Signed → Invoiced → Paid

### PR & Media Outreach
Researched → Pitched → Replied → Follow-Up → Coverage Secured → Reported

### Recruiting
Sourced → Contacted → Interested → Interview → Offer → Accepted

## UI Conventions

- **Sidebar width:** Resizable 220px–540px with drag handle
- **Top bar:** 42px compact bar with wordmark, mode pills, state indicator, auto-send toggle
- **Sidebar tabs:** Pipeline, Nudges, History, Discover (when discovery is enabled)
- **Color system:** Blue (Buy), Green (Sell), Purple (Exchange) — consistent across both themes
- **Theme:** Dual theme support — Light and Dark. Default follows system preference (prefers-color-scheme). User can override in settings. All components must work in both themes. Use CSS custom properties for all colors so theme switching is a single class toggle on the root element.
  - **Dark theme:** Navy/slate backgrounds, light text — matches v3 prototype aesthetic
  - **Light theme:** White/gray backgrounds, dark text — clean and professional for users who prefer it
  - **Mode colors (Buy blue, Sell green, Exchange purple)** remain vibrant in both themes with adjusted contrast ratios
- **Font stack:** System fonts (no custom web fonts in extension)
- **Enrichment badges:** Small icon indicators on contact cards showing enrichment status (none / partial / full)

## Key Development Principles

1. **Build the CRM loop first.** Contact → Pipeline → Template → Send → Reply Detection. No AI, no IIE, no sequences until this works.
2. **Pipeline stages are data, not code.** Stored as JSON in pipeline_presets table. Never hardcode stage names.
3. **RLS from day one.** Every query must be workspace-scoped. No shortcuts.
4. **Gmail API only.** No DOM scraping, no InboxSDK hacks for data. InboxSDK is for UI injection only.
5. **Minimal OAuth scopes.** Request only what you need. Start with gmail.readonly + gmail.send + gmail.compose.
6. **Error handling matters more here.** This lives inside someone's email. Crashes are unacceptable.
7. **InboxSDK isolation.** All InboxSDK code lives in `gmail-adapter/`. Sidebar components never import InboxSDK directly. This makes it swappable if Gmail changes break InboxSDK.
8. **Offline-first reads.** Sidebar renders from IndexedDB cache first, then syncs from API in background. Graceful degradation when API is unreachable.
9. **React error boundaries.** Each sidebar section wrapped in an error boundary. One section crashing must not take down the whole sidebar.
10. **Reply detection via Pub/Sub.** Use Gmail Pub/Sub push notifications, not polling. Watch renewal every 6 days (watch expires at 7).

## Current Phase

See DEVELOPMENT_PLAN.md for the current phase and acceptance criteria.
