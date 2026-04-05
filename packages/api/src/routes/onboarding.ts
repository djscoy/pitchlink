/**
 * Onboarding Routes
 *
 * POST   /api/onboarding/scan           — Start a new inbox scan
 * GET    /api/onboarding/scan/:id        — Get scan progress
 * GET    /api/onboarding/scan/:id/contacts — Get discovered contacts
 * PATCH  /api/onboarding/contacts/:id    — Update a staging contact (accept/reject/edit)
 * POST   /api/onboarding/scan/:id/commit — Commit accepted contacts to main table
 * GET    /api/onboarding/status          — Check if onboarding is complete
 */

import { Router, Request, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { onboardingScanService } from '../services/onboarding-scan';
import { supabaseAdmin } from '../db/supabase';

export const onboardingRouter = Router();

onboardingRouter.use(requireAuth);

// ============================================================
// Start Scan
// ============================================================

/**
 * POST /api/onboarding/scan
 * Body: { time_range_days?: number, min_interactions?: number }
 */
onboardingRouter.post('/scan', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const { time_range_days = 90, min_interactions = 1, exclude_emails } = req.body;

    // Get the user's Gmail access token
    const { data: watchState } = await supabaseAdmin
      .from('gmail_watch_state')
      .select('access_token_encrypted')
      .eq('user_id', auth.userId)
      .single();

    if (!watchState?.access_token_encrypted) {
      return res.status(400).json({
        error: { code: 'NO_GMAIL_TOKEN', message: 'Gmail access token not available. Please re-authenticate.' },
      });
    }

    const scanId = await onboardingScanService.startScan(
      auth.workspaceId,
      auth.userId,
      watchState.access_token_encrypted,
      auth.userEmail,
      time_range_days,
      min_interactions,
      exclude_emails,
    );

    return res.json({ data: { scan_id: scanId } });
  } catch (err) {
    console.error('[Onboarding] Start scan error:', err);
    return res.status(500).json({
      error: { code: 'SCAN_ERROR', message: 'Failed to start onboarding scan' },
    });
  }
});

// ============================================================
// Get Scan Progress
// ============================================================

/**
 * GET /api/onboarding/scan/:id
 */
onboardingRouter.get('/scan/:id', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const progress = await onboardingScanService.getScanProgress(req.params.id, auth.workspaceId);

    if (!progress) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Scan not found' },
      });
    }

    return res.json({ data: progress });
  } catch (err) {
    console.error('[Onboarding] Get progress error:', err);
    return res.status(500).json({
      error: { code: 'PROGRESS_ERROR', message: 'Failed to get scan progress' },
    });
  }
});

// ============================================================
// Get Discovered Contacts
// ============================================================

/**
 * GET /api/onboarding/scan/:id/contacts
 * Query: ?status=pending&deal_status=waiting_for_reply&limit=50&offset=0
 */
onboardingRouter.get('/scan/:id/contacts', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const { status, deal_status, limit, offset } = req.query;

    const result = await onboardingScanService.getScanContacts(
      req.params.id,
      auth.workspaceId,
      {
        status: status as string | undefined,
        deal_status: deal_status as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      },
    );

    return res.json({ data: result });
  } catch (err) {
    console.error('[Onboarding] Get contacts error:', err);
    return res.status(500).json({
      error: { code: 'CONTACTS_ERROR', message: 'Failed to get onboarding contacts' },
    });
  }
});

// ============================================================
// Update Staging Contact
// ============================================================

/**
 * PATCH /api/onboarding/contacts/:id
 * Body: { status?: 'accepted' | 'rejected', name?: string, deal_status?: string }
 */
onboardingRouter.patch('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const { status, name, deal_status } = req.body;

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (name !== undefined) updates.name = name;
    if (deal_status) updates.deal_status = deal_status;

    const result = await onboardingScanService.updateContact(
      req.params.id,
      auth.workspaceId,
      updates,
    );

    return res.json({ data: result });
  } catch (err) {
    console.error('[Onboarding] Update contact error:', err);
    return res.status(500).json({
      error: { code: 'UPDATE_ERROR', message: 'Failed to update onboarding contact' },
    });
  }
});

// ============================================================
// Commit Contacts
// ============================================================

/**
 * POST /api/onboarding/scan/:id/commit
 * Body: { campaign_id?: string }
 */
onboardingRouter.post('/scan/:id/commit', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const { campaign_id } = req.body;

    // Mark scan as committing
    await supabaseAdmin
      .from('onboarding_scans')
      .update({ status: 'committing' })
      .eq('id', req.params.id)
      .eq('workspace_id', auth.workspaceId);

    // Return immediately — commit runs async in background
    res.json({ data: { committing: true } });

    // Run commit in background (don't await in the request handler)
    onboardingScanService.commitContacts(
      req.params.id,
      auth.workspaceId,
      campaign_id,
    ).then(async (result) => {
      await supabaseAdmin
        .from('onboarding_scans')
        .update({ status: 'committed', classified_contacts: result.imported })
        .eq('id', req.params.id);
      console.log(`[Onboarding] Commit complete: ${result.imported} contacts imported`);
    }).catch(async (err) => {
      console.error('[Onboarding] Commit error:', err);
      await supabaseAdmin
        .from('onboarding_scans')
        .update({ status: 'commit_failed', error_message: err.message })
        .eq('id', req.params.id);
    });
  } catch (err) {
    console.error('[Onboarding] Commit error:', err);
    return res.status(500).json({
      error: { code: 'COMMIT_ERROR', message: 'Failed to start import' },
    });
  }
});

// ============================================================
// Onboarding Status
// ============================================================

/**
 * GET /api/onboarding/status
 * Returns whether user has completed onboarding.
 */
onboardingRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const completed = await onboardingScanService.hasCompletedOnboarding(auth.workspaceId);
    return res.json({ data: { onboarding_complete: completed } });
  } catch (err) {
    console.error('[Onboarding] Status error:', err);
    return res.status(500).json({
      error: { code: 'STATUS_ERROR', message: 'Failed to check onboarding status' },
    });
  }
});

// ============================================================
// Restart Scan
// ============================================================

/**
 * POST /api/onboarding/scan/:id/restart
 * Deletes the scan and its contacts so the user can start fresh.
 */
onboardingRouter.post('/scan/:id/restart', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);

    // Delete contacts first (FK constraint), then scan
    await supabaseAdmin
      .from('onboarding_contacts')
      .delete()
      .eq('scan_id', req.params.id)
      .eq('workspace_id', auth.workspaceId);

    await supabaseAdmin
      .from('onboarding_scans')
      .delete()
      .eq('id', req.params.id)
      .eq('workspace_id', auth.workspaceId);

    return res.json({ data: { restarted: true } });
  } catch (err) {
    console.error('[Onboarding] Restart error:', err);
    return res.status(500).json({
      error: { code: 'RESTART_ERROR', message: 'Failed to restart scan' },
    });
  }
});

// ============================================================
// Excluded Emails Settings
// ============================================================

/**
 * GET /api/onboarding/excluded-emails
 * Returns the workspace's excluded email list.
 */
onboardingRouter.get('/excluded-emails', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('settings_json')
      .eq('id', auth.workspaceId)
      .single();

    const settings = (workspace?.settings_json || {}) as Record<string, unknown>;
    return res.json({
      data: {
        excluded_emails: (settings.excluded_emails as string[]) || [],
        excluded_domains: (settings.excluded_domains as string[]) || [],
      },
    });
  } catch (err) {
    console.error('[Onboarding] Get excluded emails error:', err);
    return res.status(500).json({
      error: { code: 'SETTINGS_ERROR', message: 'Failed to get excluded emails' },
    });
  }
});

/**
 * PATCH /api/onboarding/excluded-emails
 * Body: { excluded_emails?: string[], excluded_domains?: string[] }
 */
onboardingRouter.patch('/excluded-emails', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    const { excluded_emails, excluded_domains } = req.body;

    // Get current settings
    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('settings_json')
      .eq('id', auth.workspaceId)
      .single();

    const settings = (workspace?.settings_json || {}) as Record<string, unknown>;

    // Merge updates
    if (excluded_emails !== undefined) {
      settings.excluded_emails = (excluded_emails as string[]).map((e: string) => e.toLowerCase());
    }
    if (excluded_domains !== undefined) {
      settings.excluded_domains = (excluded_domains as string[]).map((d: string) => d.toLowerCase());
    }

    await supabaseAdmin
      .from('workspaces')
      .update({ settings_json: settings })
      .eq('id', auth.workspaceId);

    return res.json({ data: { excluded_emails: settings.excluded_emails, excluded_domains: settings.excluded_domains } });
  } catch (err) {
    console.error('[Onboarding] Update excluded emails error:', err);
    return res.status(500).json({
      error: { code: 'SETTINGS_ERROR', message: 'Failed to update excluded emails' },
    });
  }
});
