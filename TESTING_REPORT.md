# PitchLink UI Polish — Testing Report & Action Plan

**Date:** April 8, 2026  
**Scope:** Extension sidebar UI (Batches 1-6 of UI polish plan)

---

## What Was Done

### Batch 1: Sequence Enrollment Fix (ContactPanel)
- **Fixed:** `+ Enroll` button now always visible when contact has deals
- **Fixed:** "Create one →" link appears when no sequences exist for current mode, navigates to Nudges tab
- **Fixed:** Auto-selects deal when contact has only one (hides unnecessary dropdown)
- **Fixed:** All sequence actions (pause/resume/cancel/skip) wrapped in try-catch with error messages
- **Added:** Toast notifications for stage changes, enrollment success/failure

### Batch 2: Hardcoded Colors → CSS Variables
- Replaced ALL hardcoded hex colors across 7 view files (AutoReplySettingsView, MyEmailsView, ComposePanel, DiscoveryView, OnboardingView, DashboardView, ContactPanel)
- **Zero hardcoded hex colors remain** in sidebar views (verified via grep)

### Batch 3: New CSS Classes
- Added `.pl-btn:focus-visible` and `.pl-input:focus-visible` focus rings
- Added `.pl-select` class for consistent dropdowns
- Added `.pl-badge-success/warning/error/info` status badge classes
- Added `.pl-clickable-row` with hover background
- Added `pl-toast-in` animation

### Batch 4: Confirmation Dialogs
- New `ConfirmDialog` component
- Applied to: template delete, sequence delete, auto-reply rule delete

### Batch 5: Toast Notification System
- New `Toast`, `useToast`, `ToastContext` components
- Wired into Sidebar.tsx as context provider
- Applied to ContactPanel (stage change, enrollment) and SourceRegistryView (CRUD)

### Batch 6: Accessibility
- `aria-label` on advance (→), delete (×), dismiss buttons
- `role="button"` + `tabIndex={0}` + keyboard handlers on PipelineView and HistoryView clickable rows
- `.pl-clickable-row` hover effect on activity items
- `title` attributes on campaign names

---

## Bugs Found & Fixed

### Critical: `d.map is not a function` in NudgesView (PRE-EXISTING)
- **Root cause:** Both `CreateSequenceForm` and `EditSequenceForm` cast `api.templates.list()` response as `{ data: Template[] }` when it actually returns `{ data: { templates: Template[], total: number } }`. So `templates.map()` was called on an object.
- **Fix:** Extracted `.templates` from the wrapped response with defensive array check.
- **Status:** FIXED

### API Response Shape Inconsistency (SYSTEMIC)
All three core list APIs return **wrapped objects**, not arrays:
- `GET /api/templates` → `{ data: { templates: [...], total } }`
- `GET /api/campaigns` → `{ data: { campaigns: [...], total } }`
- `GET /api/sequences` → `{ data: { sequences: [...], total } }`
- `GET /api/sequences/queue` → `{ data: [...] }` (direct array)
- `GET /api/auto-reply/rules` → `{ data: [...] }` (direct array)

Extension views handle this inconsistently — some correctly unwrap, others don't. See "Remaining Issues" below.

---

## Remaining Issues to Fix

### P0 — Data Access Bugs (could crash UI)

| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|
| 1 | TemplatePanel.tsx | 33 | `setTemplates(result.data.templates)` — no null check | Add `?.` → `result.data?.templates \|\| []` |
| 2 | ContactPanel.tsx | 147 | `res.data.sequences` — no null check | Add `?.` → `res.data?.sequences \|\| []` |

### P1 — UI Polish Still Needed

| # | Issue | Details |
|---|-------|---------|
| 3 | No toast on template CRUD | Template create/edit/delete has no toast feedback |
| 4 | No toast on campaign create | DashboardView campaign create is silent |
| 5 | No toast on auto-reply CRUD | Rule create/toggle/mode-change are silent |
| 6 | NudgesView queue/sequences still use `Array.isArray` guards | Should simplify now that we know the response shapes |
| 7 | HistoryView load-more has no error handling | If API fails, user sees infinite loading |
| 8 | DiscoveryView "Add to Campaign" is 3+ clicks | Should be inline dropdown on prospect card |
| 9 | No search/filter on template list | Hard to find templates when you have many |
| 10 | No search/filter on sequence list | Same issue |
| 11 | Auto-reply rules can't be edited | Only toggle and delete — no way to change delay, match type, etc. |

### P2 — Tech Debt

| # | Issue | Details |
|---|-------|---------|
| 12 | IndexedDB cache layer never used | `cache/index.ts` is defined but never imported — no offline-first reads |
| 13 | Inline styles everywhere | CSS utility classes (.pl-btn, .pl-input) exist but views barely use them |
| 14 | No request deduplication | Multiple simultaneous loads trigger duplicate API calls |
| 15 | Manual type casts on API responses | Should type the API client properly to avoid `as { data: ... }` everywhere |
| 16 | Gmail watch renewal is manual | Needs automated 6-day renewal (currently relies on manual trigger) |

---

## Build Status

```
Shared:    ✅ Clean build
Extension: ✅ Clean build (3 warnings — bundle size, expected)
TypeScript: ✅ Zero type errors
Hardcoded colors: ✅ Zero remaining in sidebar views
```

---

## Files Changed (This Session)

### New Files (4)
- `packages/extension/src/sidebar/components/ConfirmDialog.tsx`
- `packages/extension/src/sidebar/components/Toast.tsx`
- `packages/extension/src/sidebar/hooks/useToast.ts`
- `packages/extension/src/sidebar/ToastContext.tsx`

### Modified Files (14)
- `Sidebar.tsx` — Toast provider, tab navigation callback
- `ContactPanel.tsx` — Sequence enrollment fix, toast, error handling
- `ComposePanel.tsx` — Hardcoded colors
- `TemplatePanel.tsx` — ConfirmDialog, import
- `NudgesView.tsx` — ConfirmDialog, data shape fix, template list fix
- `AutoReplySettingsView.tsx` — ConfirmDialog, hardcoded colors
- `MyEmailsView.tsx` — Hardcoded colors
- `DiscoveryView.tsx` — Hardcoded colors
- `OnboardingView.tsx` — Hardcoded colors
- `DashboardView.tsx` — Hardcoded colors, title attribute
- `SourceRegistryView.tsx` — Toast notifications
- `PipelineView.tsx` — Accessibility (aria-label, keyboard nav, hover)
- `HistoryView.tsx` — Accessibility (clickable rows, keyboard nav)
- `pitchlink.css` — Focus rings, badges, clickable rows, toast animation

---

## Action Plan: Next Steps (Priority Order)

### Immediate (This Week)

**1. Fix remaining P0 null checks** (30 min)
- TemplatePanel.tsx and ContactPanel.tsx null safety
- Simplify NudgesView defensive guards

**2. Commit & push everything to GitHub** (5 min)
- All UI polish changes in one commit
- Railway auto-deploys but only API changes matter there

**3. Manual QA pass in Gmail** (1-2 hours)
Walk through every user flow:
- [ ] Open email from known contact → verify ContactPanel renders
- [ ] Open email from unknown contact → verify "Add to PitchLink" works
- [ ] Create a new campaign from Dashboard
- [ ] Assign contact to campaign → verify stage selector works
- [ ] Change pipeline stage → verify toast appears
- [ ] Open Nudges tab → verify no crash
- [ ] Create a sequence → verify steps form works
- [ ] Enroll a contact in sequence from ContactPanel
- [ ] Open Templates tab → create/edit/delete template with confirmation
- [ ] Open History tab → click activity to navigate to thread
- [ ] Open Discovery tab → search by domain
- [ ] Settings → Auto-Reply → create/toggle/delete rule
- [ ] Settings → My Emails → add/remove email
- [ ] Settings → Forwarding → add/edit/delete entry
- [ ] Switch Buy/Sell/Exchange modes → verify colors change
- [ ] Toggle light/dark theme → verify no broken colors
- [ ] Keyboard shortcuts (Alt+1-5, Alt+B/S/X, Escape)

### Next Sprint (This Week / Next Week)

**4. Wire toast into remaining views** (1-2 hours)
- TemplatePanel, DashboardView, AutoReplySettingsView, NudgesView

**5. Type the API client properly** (2-3 hours)
- Update `api.ts` to return correctly typed responses
- Eliminate all manual `as { data: ... }` casts
- Prevents future shape mismatch bugs

**6. Add error handling to remaining silent catches** (1-2 hours)
- HistoryView load-more
- ComposePanel template load
- DashboardView stats load

### Before Beta Launch

**7. Activate IndexedDB cache** (4-6 hours)
- Integrate cache reads as fallback in sidebar views
- Cache invalidation on mutations
- Offline-first: render from cache, sync in background

**8. Auto-reply rule editing** (2-3 hours)
- Add edit form for existing rules (delay, match type, mode, receiving emails)

**9. Sentry error monitoring** (2-3 hours)
- Integrate Sentry SDK in extension
- Capture ErrorBoundary catches and unhandled errors

**10. Chrome Web Store submission** (3-4 hours)
- Screenshots, description, privacy policy
- Store listing assets

### Post-Beta

**11. Landing page** (1-2 days)
**12. Stripe billing** (2-3 days)
**13. Gmail watch auto-renewal** (2-3 hours)
**14. Enrichment provider config UI in settings** (3-4 hours)
