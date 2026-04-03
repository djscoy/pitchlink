import { Router, Request, Response } from 'express';
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
