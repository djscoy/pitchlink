/**
 * IIE (Inbox Identity Engine) Routes
 *
 * POST /api/iie/analyze          — Run IIE cascade on a Gmail message
 * POST /api/iie/confirm          — Layer 4 human confirmation
 * GET  /api/iie/source-registry  — List source registry entries
 * POST /api/iie/source-registry  — Create entry
 * PATCH /api/iie/source-registry/:id — Update entry
 * DELETE /api/iie/source-registry/:id — Delete entry
 */

import { Router, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { forwardDetectionService } from '../services/forward-detection';
import { sourceRegistryService } from '../services/source-registry';
import { supabaseAdmin } from '../db/supabase';

export const iieRouter = Router();

iieRouter.use(requireAuth);

// ============================================================
// IIE Analysis
// ============================================================

/**
 * POST /api/iie/analyze
 * Run the IIE cascade on a Gmail message.
 * Body: { gmail_message_id: string }
 */
iieRouter.post('/analyze', async (req, res: Response) => {
  try {
    const { userId, workspaceId } = getAuth(req);
    const { gmail_message_id, thread_id } = req.body;

    if (!gmail_message_id && !thread_id) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'gmail_message_id or thread_id is required' },
      });
    }

    // Get user's Gmail access token from watch state
    const { data: watchState } = await supabaseAdmin
      .from('gmail_watch_state')
      .select('access_token_encrypted')
      .eq('user_id', userId)
      .maybeSingle();

    if (!watchState?.access_token_encrypted) {
      return res.status(400).json({
        error: { code: 'NO_ACCESS_TOKEN', message: 'Gmail access token not available. Re-authenticate with Google.' },
      });
    }

    const accessToken = watchState.access_token_encrypted;

    // If no message ID, resolve from thread ID (get first message)
    let messageId = gmail_message_id;
    if (!messageId && thread_id) {
      try {
        const threadUrl = `https://www.googleapis.com/gmail/v1/users/me/threads/${thread_id}?format=metadata&metadataHeaders=From`;
        const threadRes = await fetch(threadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (threadRes.ok) {
          const threadData = await threadRes.json();
          messageId = threadData.messages?.[0]?.id;
        }
      } catch {
        console.warn('[IIE] Failed to resolve message ID from thread');
      }
    }

    if (!messageId) {
      return res.status(400).json({
        error: { code: 'NO_MESSAGE_ID', message: 'Could not resolve a message ID' },
      });
    }

    // Collect user's own email addresses to prevent self-resolution
    const { data: emailAccounts } = await supabaseAdmin
      .from('email_accounts')
      .select('email')
      .eq('workspace_id', workspaceId);
    const userEmails = (emailAccounts || []).map((a: { email: string }) => a.email);

    // Also add the authenticated user's email
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle();
    if (userData?.email) userEmails.push(userData.email);

    const { iieResult } = await forwardDetectionService.detectForward(
      workspaceId,
      accessToken,
      messageId,
      userEmails,
    );

    res.json({ data: iieResult });
  } catch (err) {
    console.error('[IIE] Analyze error:', err);
    res.status(500).json({
      error: { code: 'ANALYZE_FAILED', message: 'Failed to analyze message' },
    });
  }
});

// ============================================================
// Layer 4: Human Confirmation
// ============================================================

/**
 * POST /api/iie/confirm
 * Store a human-confirmed forward attribution.
 * Body: { forwarding_email, original_sender_email, original_sender_name?, is_forward }
 */
iieRouter.post('/confirm', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { forwarding_email, original_sender_email, original_sender_name, is_forward } = req.body;

    if (!forwarding_email) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'forwarding_email is required' },
      });
    }

    if (!is_forward) {
      // User says it's not a forward — we could optionally store a "not_forward" entry
      // to prevent re-asking, but for now just acknowledge
      return res.json({ data: { acknowledged: true, is_forward: false } });
    }

    if (!original_sender_email) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'original_sender_email is required when is_forward is true' },
      });
    }

    const entry = await sourceRegistryService.create(workspaceId, {
      forwarding_email,
      original_sender_email,
      original_sender_name,
      detection_method: 'human',
      confidence: 1.0,
    });

    res.json({ data: entry });
  } catch (err) {
    console.error('[IIE] Confirm error:', err);
    res.status(500).json({
      error: { code: 'CONFIRM_FAILED', message: 'Failed to store confirmation' },
    });
  }
});

// ============================================================
// Source Registry CRUD
// ============================================================

/**
 * GET /api/iie/source-registry
 */
iieRouter.get('/source-registry', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const entries = await sourceRegistryService.list(workspaceId);
    res.json({ data: entries });
  } catch (err) {
    console.error('[IIE] Source registry list error:', err);
    res.status(500).json({
      error: { code: 'LIST_FAILED', message: 'Failed to list source registry' },
    });
  }
});

/**
 * POST /api/iie/source-registry
 */
iieRouter.post('/source-registry', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { forwarding_email, original_sender_email, original_sender_name, maps_to_client, maps_to_campaign } = req.body;

    if (!forwarding_email) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'forwarding_email is required' },
      });
    }

    const entry = await sourceRegistryService.create(workspaceId, {
      forwarding_email,
      original_sender_email,
      original_sender_name,
      maps_to_client,
      maps_to_campaign,
      detection_method: 'human',
      confidence: 1.0,
    });

    res.status(201).json({ data: entry });
  } catch (err) {
    console.error('[IIE] Source registry create error:', err);
    res.status(500).json({
      error: { code: 'CREATE_FAILED', message: 'Failed to create source registry entry' },
    });
  }
});

/**
 * PATCH /api/iie/source-registry/:id
 */
iieRouter.patch('/source-registry/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { original_sender_email, original_sender_name, maps_to_client, maps_to_campaign } = req.body;

    const entry = await sourceRegistryService.update(workspaceId, req.params.id, {
      original_sender_email,
      original_sender_name,
      maps_to_client,
      maps_to_campaign,
    });

    res.json({ data: entry });
  } catch (err) {
    console.error('[IIE] Source registry update error:', err);
    res.status(500).json({
      error: { code: 'UPDATE_FAILED', message: 'Failed to update source registry entry' },
    });
  }
});

/**
 * DELETE /api/iie/source-registry/:id
 */
iieRouter.delete('/source-registry/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    await sourceRegistryService.delete(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('[IIE] Source registry delete error:', err);
    res.status(500).json({
      error: { code: 'DELETE_FAILED', message: 'Failed to delete source registry entry' },
    });
  }
});
