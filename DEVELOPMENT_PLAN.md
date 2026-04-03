# PitchLink Development Plan

## How To Use This File

This is the phased build plan for PitchLink. Each phase has clear scope, specific tasks, and acceptance criteria. Work through phases in order. Do not skip ahead. Mark phases complete by changing `[ ]` to `[x]` as you go.

---

## Phase 0 — Project Scaffolding
**Timeline:** Week 1
**Status:** [ ] Not Started

### Tasks

- [ ] Initialize monorepo with npm workspaces: `packages/extension`, `packages/api`, `packages/shared`
- [ ] **Extension scaffold:**
  - [ ] Manifest V3 Chrome Extension shell
  - [ ] Webpack config for React + TypeScript
  - [ ] InboxSDK initialization — register sidebar panel in Gmail
  - [ ] Basic React app rendering "PitchLink" text in the sidebar
- [ ] **API scaffold:**
  - [ ] Node.js + Express server with health check endpoint
  - [ ] CORS config for Chrome extension origin
  - [ ] Rate limiting middleware (express-rate-limit): 100 req/min general, 20 req/min AI, 500 req/min webhooks
  - [ ] Gmail Pub/Sub webhook endpoint (stub for Phase 2)
  - [ ] Environment variable management (.env)
- [ ] **Shared package:**
  - [ ] TypeScript type definitions for core entities (Contact, Campaign, Deal, PipelinePreset, Template, EmailAccount)
  - [ ] Shared constants (modes, colors, default presets, rate limits)
  - [ ] Theme system: CSS custom properties for all colors, light and dark token sets, `ThemeProvider` React context that reads system preference and user override
- [ ] **IndexedDB cache layer:**
  - [ ] Cache wrapper using `idb` library for offline-first reads
  - [ ] Stores: contacts, campaigns, deals, pipeline_presets, templates, meta
  - [ ] Sidebar renders from cache first, syncs in background
  - [ ] Graceful degradation when API is unreachable
- [ ] **Supabase setup:**
  - [ ] Create Supabase project
  - [ ] Initial migration: users, workspaces, email_accounts tables
  - [ ] Supabase Auth config with Google OAuth provider
  - [ ] RLS policies on users, workspaces, and email_accounts tables
- [ ] **Google Cloud setup:**
  - [ ] Create GCP project
  - [ ] Enable Gmail API
  - [ ] Configure OAuth consent screen (testing mode)
  - [ ] Generate OAuth 2.0 client ID for Chrome Extension
- [ ] **Dev tooling:**
  - [ ] ESLint + Prettier config (shared across packages)
  - [ ] TypeScript config (shared tsconfig.base.json)
  - [ ] .env.example with all required env vars documented

### Acceptance Criteria

```
✅ `npm run dev` from root starts both extension build (watch) and API server
✅ Loading the unpacked extension in Chrome shows "PitchLink" in Gmail's right sidebar
✅ API health check at /api/health returns { status: "ok" }
✅ Supabase dashboard shows users and workspaces tables with RLS enabled
✅ Google OAuth flow completes and returns user email
```

---

## Phase 1 — Core CRM Loop
**Timeline:** Weeks 2–6
**Status:** [ ] Not Started

### 1A. Contact Database & Domain Detection

- [ ] **Gmail thread detection:** When user opens an email thread, extract sender email and domain via InboxSDK thread view handler
- [ ] **Contact lookup:** Query Supabase for existing contact by email within workspace
- [ ] **Contact card (existing):** Render in sidebar: name, email, domain, tags, notes, current pipeline stage, campaign name
- [ ] **Contact card (new):** Show "+ Add to PitchLink" card with auto-populated email and domain fields
- [ ] **Contact creation:** Save new contact to Supabase with workspace_id
- [ ] **Contact editing:** Inline edit name, notes, tags, custom fields from sidebar
- [ ] **Database migration:** contacts table with RLS policy

### 1B. Configurable Pipeline Engine

- [ ] **Pipeline preset model:** stages_json is an ordered array of `{ id, name, color, icon, auto_trigger? }`
- [ ] **Default presets:** Seed database with presets listed in CLAUDE.md (Link Building Buy/Sell/Exchange, General Sales, Freelance, PR, Recruiting)
- [ ] **Pipeline selection:** When creating a campaign, user picks a preset or creates custom
- [ ] **Stage display:** Sidebar shows current stage with colored indicator and stage name
- [ ] **Stage transition:** Click to advance/revert stage. Dropdown shows all available stages
- [ ] **Pipeline view (sidebar tab):** Contacts grouped by stage within active campaign. Count per stage. Click contact to open their Gmail thread
- [ ] **Database migration:** pipeline_presets, deals, deal_activities tables with RLS

### 1C. Campaign Organization

- [ ] **Campaign CRUD:** Create, rename, archive campaigns from sidebar dashboard
- [ ] **Campaign model:** name, client attribution, mode (buy/sell/exchange), pipeline_preset_id, status, date range
- [ ] **Campaign assignment:** Assign contacts to campaigns when adding them
- [ ] **Dashboard mode:** When no email thread is open, sidebar shows all active campaigns with progress bars (contacts per stage)
- [ ] **Mode switching:** Top bar pills for Buy/Sell/Exchange. Switching mode filters campaigns and changes color theme
- [ ] **Database migration:** campaigns table with RLS

### 1D. Reply Detection — MOVED TO PHASE 2

*(Reply detection and templates are split into Phase 2 for smaller, more testable phases.)*

### 1D. CSV Export

- [ ] **Export contacts:** Per-campaign CSV export with name, email, domain, stage, tags, notes
- [ ] **Download trigger:** "Export CSV" button on campaign card in dashboard

### 1E. Email Templates — MOVED TO PHASE 2

*(Reply detection and templates are split into Phase 2 for smaller, more testable phases.)*

### Acceptance Criteria

```
✅ Open an email from an unknown sender → sidebar shows "New Contact" card with auto-detected email/domain
✅ Click "+ Add" → contact saved → sidebar now shows full contact card on future opens
✅ Create a campaign → assign a pipeline preset → assign contacts to campaign
✅ Change a contact's pipeline stage → deal_activities log entry created
✅ Dashboard mode (no thread open) → shows all campaigns with stage progress bars
✅ Buy/Sell/Exchange mode pills switch color theme and filter campaigns by mode
✅ Export contacts as CSV from a campaign
✅ All data is workspace-scoped — user A cannot see user B's contacts/campaigns
```

---

## Phase 2 — Reply Detection + Email Templates
**Timeline:** Weeks 4–6
**Status:** [ ] Not Started

### 2A. Reply Detection (Gmail Pub/Sub Push)

- [ ] **Gmail Pub/Sub integration:** Use Cloud Pub/Sub push notifications (NOT polling)
- [ ] **API webhook endpoint:** `POST /api/gmail/webhook` receives Pub/Sub messages
- [ ] **User watch registration:** On OAuth auth, call `users.watch()` to register for push notifications
- [ ] **Notification processing:** Decode base64 Pub/Sub message → fetch history changes → detect replies from tracked contacts
- [ ] **Auto-stage-advance:** On reply, optionally advance deal to next pipeline stage (configurable per stage)
- [ ] **Watch renewal:** Chrome alarm every 6 days (watch expires at 7) to renew all user watches
- [ ] **Reply badge:** Notification indicator in sidebar when replies detected

### 2B. Email Templates

- [ ] **Template CRUD:** Create, edit, delete templates from sidebar
- [ ] **Template organization:** Organize by mode (Buy/Sell/Exchange) and optionally by campaign
- [ ] **Variable system:** Support `{{contact_name}}`, `{{domain}}`, `{{campaign_name}}`, and custom field variables
- [ ] **Template insertion:** From Gmail compose view, open template picker in sidebar, click to insert into compose body
- [ ] **Variable resolution:** Auto-replace variables with actual contact/campaign data on insert
- [ ] **Database migration:** templates table with RLS

### Acceptance Criteria

```
✅ Reply from tracked contact → notification received via Pub/Sub → stage auto-advances
✅ Reply badge appears in sidebar within seconds (not minutes)
✅ Create template with {{contact_name}} → insert into compose → variable replaced with actual name
✅ Watch renewal works automatically without user intervention
✅ All data is workspace-scoped
```

---

## Phase 3 — Inbox Identity Engine (IIE)
**Timeline:** Weeks 6–8
**Status:** [ ] Not Started

### Tasks

- [ ] **Layer 1 — Header Parsing:**
  - [ ] Access raw message headers via Gmail API (message.payload.headers)
  - [ ] Parse X-Forwarded-To, Delivered-To, Received chain
  - [ ] Extract original sender email from innermost Received header
  - [ ] If high-confidence match → use it, skip remaining layers
- [ ] **Layer 2 — Body Pattern Regex:**
  - [ ] Gmail forward block: `---------- Forwarded message ---------` with From/Date/Subject/To
  - [ ] Outlook forward: `From:` / `Sent:` / `To:` / `Subject:` block
  - [ ] Yahoo wrapper format
  - [ ] Manual forward phrases: "FYI", "See below", "Forwarding this"
  - [ ] Extract original sender from matched pattern
- [ ] **Layer 3 — AI Inference:**
  - [ ] Send ambiguous email body to Claude API with structured prompt
  - [ ] Prompt: "Is this a forwarded email? If so, who is the original sender? Return JSON: { is_forwarded, original_sender_email, original_sender_name, confidence }"
  - [ ] Use Claude Haiku for cost efficiency (~$0.001/call)
  - [ ] If confidence > 0.8 → use result
- [ ] **Layer 4 — Human Confirmation:**
  - [ ] If no layer resolves or confidence is low → show sidebar prompt
  - [ ] "This looks like a forwarded email. Is the contact [best guess]?" with [Confirm] [Edit] [Not a forward] buttons
  - [ ] Store confirmed attribution permanently
- [ ] **Source Registry:**
  - [ ] source_registry table: forwarding_email → maps_to_client + maps_to_campaign
  - [ ] Auto-create entry on first detection
  - [ ] Settings UI to view, edit, and delete source registry entries
  - [ ] On subsequent forwards from same address → skip detection, use registry

### Acceptance Criteria

```
✅ Gmail-forwarded email from client → original sender correctly identified via headers
✅ Outlook-forwarded email → original sender extracted via body regex
✅ Ambiguous forward (VA paste) → Claude API returns correct sender with confidence score
✅ Low-confidence result → sidebar shows confirmation prompt → user confirms → stored forever
✅ Second forward from same address → instantly resolved via Source Registry (no re-detection)
✅ Source Registry editable in settings panel
```

---

## Phase 4 — AI Compose & Nudge Engine
**Timeline:** Weeks 8–10
**Status:** [ ] Not Started

### Tasks

- [ ] **AI Compose Overlay:**
  - [ ] Mode-aware compose assistant in sidebar during Gmail compose
  - [ ] Context injection: contact data + campaign context + thread history → Claude prompt
  - [ ] Template selection: suggest templates based on mode and pipeline stage
  - [ ] "Generate Draft" button → Claude API call → draft appears in compose
  - [ ] Edit before sending
- [ ] **Auto-Send Engine:**
  - [ ] Toggle in top bar: Auto-Send ON/OFF
  - [ ] Sub-mode toggle: "Send Now" (fires on schedule) vs "Draft Hold" (saves to Gmail Drafts)
  - [ ] Draft Hold: creates Gmail draft via API, user reviews and sends manually
  - [ ] Send Now: sends via Gmail API on scheduled time
- [ ] **Nudge Sequences:**
  - [ ] Sequence builder: define 1–5 steps with timing (e.g., Step 1: 3 days, Step 2: 5 days, Step 3: 7 days)
  - [ ] Each step has a template or AI-generated content
  - [ ] Enroll a deal in a sequence → sequence_enrollments row created
  - [ ] Background job: check next_fire_at, send/draft when due
  - [ ] **Reply pause:** When reply detected on a deal, auto-pause its active sequence enrollment
  - [ ] **Resume control:** Sidebar shows paused indicator with "Resume Sequence" button
  - [ ] Sequence completion: mark enrollment as completed after last step fires
- [ ] **Nudge Queue (Sidebar Tab):**
  - [ ] "Nudges" tab shows all pending nudges across campaigns
  - [ ] Sorted by next_fire_at (soonest first)
  - [ ] Per-nudge actions: Send Now, Skip, Edit, Pause
  - [ ] Badge count on Nudges tab

### Acceptance Criteria

```
✅ In compose view → sidebar shows AI assist → "Generate Draft" produces contextual email
✅ Auto-Send toggle switches between Send Now and Draft Hold modes
✅ Draft Hold → email appears in Gmail Drafts folder, not sent
✅ Create 3-step nudge sequence → enroll a contact → Step 1 fires on schedule
✅ Contact replies → sequence auto-pauses → sidebar shows "Paused" indicator
✅ Click "Resume" → sequence continues from next step
✅ Nudges tab shows queue with send/skip/edit actions
```

---

## Phase 5 — UI Polish, Theme System & Sidebar UX
**Timeline:** Weeks 10–12
**Status:** [ ] Not Started

### Tasks

- [ ] **Theme system (Light + Dark):**
  - [ ] CSS custom properties for ALL colors — no hardcoded hex values in components
  - [ ] Dark theme: navy/slate backgrounds, light text (matches v3 prototype)
  - [ ] Light theme: white/gray backgrounds, dark text, clean professional look
  - [ ] Default: follow system preference via `prefers-color-scheme` media query
  - [ ] User override: manual toggle in settings, persisted to user preferences in Supabase
  - [ ] Mode colors (Buy blue, Sell green, Exchange purple) adjusted for proper contrast in both themes
  - [ ] Theme toggle accessible from sidebar settings icon — instant switch, no reload
- [ ] **Resizable sidebar:** Drag handle between Gmail thread and PitchLink panel (220px–540px range)
- [ ] **Compact top bar (42px):** Wordmark, mode pills (Buy/Sell/Exchange), pipeline state indicator, auto-send toggle
- [ ] **Three sidebar tabs:** Pipeline, Nudges, History — with tab-specific content
- [ ] **Mode color system:** Full theme switching — blue/green/purple affects top bar, tabs, buttons, indicators
- [ ] **Dashboard polish:** Campaign cards with progress bars, stats, quick actions
- [ ] **Contact card polish:** Enrichment data section, activity timeline, enrichment status badge
- [ ] **Empty states:** Helpful onboarding prompts when no contacts/campaigns exist
- [ ] **Loading states:** Skeleton screens, not spinners
- [ ] **Error states:** Graceful degradation when API/Supabase is unreachable
- [ ] **Keyboard shortcuts:** Quick stage advance, open compose, switch modes

### Acceptance Criteria

```
✅ Sidebar resizes smoothly with drag handle
✅ Mode switching changes entire color theme instantly
✅ Light theme renders cleanly — all text readable, all buttons visible, mode colors pop
✅ Dark theme renders cleanly — matches v3 prototype aesthetic
✅ System preference auto-detection works (OS dark mode → PitchLink dark mode)
✅ Manual theme toggle persists across sessions
✅ All three tabs show relevant content
✅ Empty states guide new users to create their first campaign
✅ Extension works reliably for 30+ minutes without crashes or memory leaks
```

---

## Phase 6 — Beta & Launch
**Timeline:** Weeks 12–16
**Status:** [ ] Not Started

### Tasks

- [ ] **Private beta recruitment:** 20–30 users from own agency + SEO communities
- [ ] **Bug tracking:** Set up Sentry for error monitoring
- [ ] **Feedback collection:** In-sidebar feedback button → simple form
- [ ] **Performance audit:** Extension load time < 500ms, sidebar render < 200ms
- [ ] **Privacy page:** Clear documentation of data handling, OAuth scopes used, data storage
- [ ] **Chrome Web Store submission:** Store listing, screenshots, description, privacy policy
- [ ] **Landing page:** Vertical-specific messaging — lead with link building, show breadth
- [ ] **Founding member pricing:** First 200 users at $19/mo Starter, $59/mo Agency, locked for life
- [ ] **Stripe integration:** Subscription management for paid plans

### Acceptance Criteria

```
✅ 20+ beta users using it daily for 2+ weeks
✅ No critical bugs in Sentry for 7 consecutive days
✅ Chrome Web Store listing approved and live
✅ Landing page converts > 5% of visitors to free trial signups
✅ Stripe checkout works for Starter and Agency plans
```

---

## Phase 7 — Contact Enrichment & Discovery
**Timeline:** Post-launch (Month 2–3)
**Status:** [ ] Not Started

### Overview

Two complementary capabilities. Enrichment adds data to contacts you already have. Discovery finds new contacts you don't have yet. Both use a pluggable provider architecture so you can swap or stack data sources.

### 6A. Contact Enrichment

- [ ] **Enrichment provider interface:** Abstract provider class with `enrich(email): EnrichmentResult` method. Allows plugging in any provider.
- [ ] **Hunter.io integration:**
  - [ ] Email verification (is this email valid/deliverable?)
  - [ ] Person data: full name, position, company, LinkedIn, Twitter
  - [ ] Company data: domain, industry, employee count
- [ ] **Apollo.io integration:**
  - [ ] Person enrichment: name, title, seniority, LinkedIn, phone
  - [ ] Company enrichment: revenue range, funding, tech stack, employee count, industry
- [ ] **DataForSEO integration (SEO vertical):**
  - [ ] Domain Rating, monthly organic traffic, spam score
  - [ ] Backlink count, referring domains
  - [ ] Niche/category classification
- [ ] **Enrichment triggers:**
  - [ ] Auto-enrich on contact creation (if user enables in settings)
  - [ ] On-demand: "Enrich" button on contact card in sidebar
  - [ ] Bulk: "Enrich All" action on campaign level
- [ ] **Enrichment caching:**
  - [ ] Store results in contact_enrichment table with provider, data_json, fetched_at, expires_at
  - [ ] Re-fetch only when data is expired (configurable TTL, default 30 days)
  - [ ] Show "Last enriched: X days ago" on contact card
- [ ] **Enrichment display:**
  - [ ] Contact card shows enriched fields inline (title, company, LinkedIn link)
  - [ ] Expandable "Full Profile" section for detailed data
  - [ ] Enrichment status badge on contact cards: none (gray), partial (yellow), full (green)
  - [ ] SEO metrics section (when DataForSEO enabled): DR, traffic, spam score as visual badges
- [ ] **Settings:**
  - [ ] Provider API key management (per workspace)
  - [ ] Toggle auto-enrichment on/off
  - [ ] Select which providers to use (can stack multiple)
  - [ ] Per-vertical enrichment modules (enable SEO metrics for link building campaigns, disable for recruiting)
- [ ] **Database:**
  - [ ] contact_enrichment table with RLS
  - [ ] enrichment_providers table (workspace_id, provider_name, api_key_encrypted, is_active, config_json)
  - [ ] Add enrichment_status and enriched_at columns to contacts table

### 6B. Contact Discovery (Prospecting)

- [ ] **Discovery panel:** New "Discover" tab in sidebar (4th tab, appears when discovery is enabled)
- [ ] **Search by domain:**
  - [ ] Enter a domain → find all known email addresses (Hunter.io Domain Search)
  - [ ] Show results as cards: name, email, role, confidence score
- [ ] **Search by criteria:**
  - [ ] Search by company name, job title, industry, location (Apollo.io People Search)
  - [ ] Filter by seniority level, department
- [ ] **Search by niche/keywords (SEO vertical):**
  - [ ] Enter niche keywords → find relevant websites (Google Custom Search API)
  - [ ] Auto-extract contact emails from discovered domains (Hunter.io)
  - [ ] Show domain metrics alongside results (DataForSEO)
- [ ] **Discovery result cards:**
  - [ ] Each result shows: name, email, domain, title/role, confidence score
  - [ ] One-click "Add to PitchLink" → creates contact + assigns to selected campaign
  - [ ] "Add All" bulk action for filtered results
- [ ] **Discovery credits/limits:**
  - [ ] Track API usage per provider per workspace
  - [ ] Show remaining credits in discovery panel
  - [ ] Free plan: limited discovery searches/month. Paid plans: scaled limits.
- [ ] **Database:**
  - [ ] discovery_searches table: workspace_id, query_params, provider, results_count, created_at (for analytics)

### Acceptance Criteria

```
✅ Add a contact by email → enrichment fires → sidebar shows name, title, company, LinkedIn within 3 seconds
✅ SEO campaign contact → also shows DR, traffic, spam score badges
✅ Enrichment data cached → second view loads instantly without API call
✅ Discover tab → search "contentmanager" at a domain → results appear as cards
✅ Click "Add to PitchLink" on a discovery result → contact created in current campaign
✅ Provider API keys managed in settings → switching providers works without data loss
✅ Enrichment works in both light and dark themes
```

---

## Future Phases (Post-Launch)

These are documented for context but should NOT be built until Phase 7 is complete.

- **Phase 8:** Multi-client dashboard, team collaboration, role permissions
- **Phase 9:** Client reporting portal (one-click PDF/HTML reports)
- **Phase 10:** Workspace Add-On (Google Apps Script + Card Service for mobile)
- **Phase 11:** White-label reseller infrastructure (custom branding, subdomain routing, reseller dashboard)
- **Phase 12:** Bulk import (CSV upload with domain enrichment)
- **Phase 13:** Email deliverability tracking (open rates, click rates, reply rates)
- **Phase 14:** Placement/delivery tracker (log live URLs, verify links, track completions)
- **Phase 15:** API access (REST API for resellers and power users)
- **Phase 16:** Advanced enrichment: Clearbit / People Data Labs for deep company + person data
