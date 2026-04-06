import { Router, Request, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../db/supabase';
import { gmailWatchService } from '../services/gmail-watch';

export const authRouter = Router();

/**
 * POST /api/auth/google-callback
 *
 * Called after the Chrome extension completes Google OAuth.
 * Creates/updates the user record, creates a workspace if needed,
 * and registers a Gmail watch for reply detection.
 *
 * Body: { google_id, email, name, avatar_url, access_token }
 */
authRouter.post('/google-callback', async (req: Request, res: Response) => {
  try {
    const { google_id, email, name, avatar_url, access_token } = req.body;

    if (!google_id || !email || !access_token) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'google_id, email, and access_token are required' },
      });
    }

    // 1. Check if user exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, workspace_id')
      .eq('google_id', google_id)
      .maybeSingle();

    let userId: string;
    let workspaceId: string;

    if (existingUser) {
      // Update existing user
      userId = existingUser.id;
      workspaceId = existingUser.workspace_id;

      await supabaseAdmin
        .from('users')
        .update({ name, avatar_url })
        .eq('id', userId);
    } else {
      // 2. Create new user (without workspace_id initially)
      const { data: newUser, error: userError } = await supabaseAdmin
        .from('users')
        .insert({
          email: email.toLowerCase(),
          google_id,
          name: name || '',
          avatar_url,
          plan_tier: 'free',
        })
        .select()
        .single();

      if (userError) throw userError;
      userId = newUser.id;

      // 3. Create workspace for new user
      const { data: workspace, error: wsError } = await supabaseAdmin
        .from('workspaces')
        .insert({
          name: `${name || email}'s Workspace`,
          owner_id: userId,
          plan: 'free',
        })
        .select()
        .single();

      if (wsError) throw wsError;
      workspaceId = workspace.id;

      // 4. Link user to workspace
      await supabaseAdmin
        .from('users')
        .update({ workspace_id: workspaceId })
        .eq('id', userId);

      // 5. Create primary email account
      await supabaseAdmin
        .from('email_accounts')
        .insert({
          workspace_id: workspaceId,
          user_id: userId,
          email: email.toLowerCase(),
          display_name: name || '',
          is_primary: true,
          is_send_as: false,
        });
    }

    // 6. Register Gmail watch for reply detection
    try {
      await gmailWatchService.registerWatch(userId, access_token);
    } catch (watchErr) {
      // Non-fatal — user can still use the CRM without reply detection
      console.warn('[Auth] Gmail watch registration failed:', watchErr);
    }

    res.json({
      data: {
        user_id: userId,
        workspace_id: workspaceId,
        email,
        name,
      },
    });
  } catch (err) {
    console.error('[Auth] Google callback error:', err);
    res.status(500).json({
      error: { code: 'AUTH_FAILED', message: 'Authentication failed' },
    });
  }
});

/**
 * GET /api/auth/my-emails
 * Returns all email addresses the current user owns/manages.
 * Combines: email_accounts table + user's primary email + workspace excluded_emails.
 */
authRouter.get('/my-emails', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId, workspaceId } = getAuth(req);

    const emailSet = new Set<string>();

    // 1. All emails from email_accounts (workspace-scoped)
    const { data: emailAccounts } = await supabaseAdmin
      .from('email_accounts')
      .select('email')
      .eq('workspace_id', workspaceId);
    for (const acc of emailAccounts || []) {
      emailSet.add(acc.email.toLowerCase());
    }

    // 2. The authenticated user's email
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
    if (userData?.email) {
      emailSet.add(userData.email.toLowerCase());
    }

    // 3. Owned emails + excluded emails from workspace settings
    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('settings_json')
      .eq('id', workspaceId)
      .maybeSingle();
    const settings = (workspace?.settings_json || {}) as Record<string, unknown>;
    const ownedEmails = (settings.owned_emails as string[]) || [];
    for (const email of ownedEmails) {
      emailSet.add(email.toLowerCase());
    }
    const excludedEmails = (settings.excluded_emails as string[]) || [];
    for (const email of excludedEmails) {
      emailSet.add(email.toLowerCase());
    }

    res.json({ data: { emails: Array.from(emailSet) } });
  } catch (err) {
    console.error('[Auth] My emails error:', err);
    res.status(500).json({
      error: { code: 'MY_EMAILS_FAILED', message: 'Failed to fetch user emails' },
    });
  }
});

/**
 * GET /api/auth/owned-emails
 * Returns the user's owned email addresses from workspace settings.
 */
authRouter.get('/owned-emails', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('settings_json')
      .eq('id', workspaceId)
      .maybeSingle();

    const settings = (workspace?.settings_json || {}) as Record<string, unknown>;
    res.json({ data: { owned_emails: (settings.owned_emails as string[]) || [] } });
  } catch (err) {
    console.error('[Auth] Get owned emails error:', err);
    res.status(500).json({
      error: { code: 'SETTINGS_ERROR', message: 'Failed to get owned emails' },
    });
  }
});

/**
 * PATCH /api/auth/owned-emails
 * Body: { owned_emails: string[] }
 */
authRouter.patch('/owned-emails', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { owned_emails } = req.body;

    if (!Array.isArray(owned_emails)) {
      return res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'owned_emails must be an array' },
      });
    }

    // Get current settings
    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('settings_json')
      .eq('id', workspaceId)
      .maybeSingle();

    const settings = (workspace?.settings_json || {}) as Record<string, unknown>;
    settings.owned_emails = owned_emails.map((e: string) => e.toLowerCase().trim()).filter(Boolean);

    await supabaseAdmin
      .from('workspaces')
      .update({ settings_json: settings })
      .eq('id', workspaceId);

    res.json({ data: { owned_emails: settings.owned_emails } });
  } catch (err) {
    console.error('[Auth] Update owned emails error:', err);
    res.status(500).json({
      error: { code: 'SETTINGS_ERROR', message: 'Failed to update owned emails' },
    });
  }
});

/**
 * POST /api/auth/renew-watches
 * Manually trigger watch renewal (also runs on cron).
 * Should be called by an admin or cron job.
 */
authRouter.post('/renew-watches', async (_req: Request, res: Response) => {
  try {
    const result = await gmailWatchService.renewExpiringWatches();
    res.json({ data: result });
  } catch (err) {
    console.error('[Auth] Watch renewal error:', err);
    res.status(500).json({
      error: { code: 'RENEWAL_FAILED', message: 'Watch renewal failed' },
    });
  }
});
