/**
 * Auto-Reply Routes
 *
 * CRUD for auto-reply rules + queue visibility.
 */

import { Router, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../db/supabase';

export const autoReplyRouter = Router();

autoReplyRouter.use(requireAuth);

// ============================================================
// Rules CRUD
// ============================================================

/**
 * GET /api/auto-reply/rules
 */
autoReplyRouter.get('/rules', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { data, error } = await supabaseAdmin
      .from('auto_reply_rules')
      .select('*, template:templates(id, name)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('[AutoReply] List rules error:', err);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list rules' } });
  }
});

/**
 * POST /api/auto-reply/rules
 */
autoReplyRouter.post('/rules', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { template_id, campaign_id, mode, delay_minutes, match_type, receiving_emails } = req.body;

    if (!template_id) {
      return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: 'template_id is required' } });
    }

    const { data, error } = await supabaseAdmin
      .from('auto_reply_rules')
      .insert({
        workspace_id: workspaceId,
        template_id,
        campaign_id: campaign_id || null,
        mode: mode || 'draft_hold',
        delay_minutes: delay_minutes ?? 10,
        match_type: match_type || 'ai_classify',
        receiving_emails: receiving_emails || [],
        is_enabled: true,
      })
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json({ data });
  } catch (err) {
    console.error('[AutoReply] Create rule error:', err);
    res.status(500).json({ error: { code: 'CREATE_FAILED', message: 'Failed to create rule' } });
  }
});

/**
 * PATCH /api/auto-reply/rules/:id
 */
autoReplyRouter.patch('/rules/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { is_enabled, mode, delay_minutes, match_type, template_id, campaign_id, receiving_emails } = req.body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (is_enabled !== undefined) updates.is_enabled = is_enabled;
    if (mode !== undefined) updates.mode = mode;
    if (delay_minutes !== undefined) updates.delay_minutes = delay_minutes;
    if (match_type !== undefined) updates.match_type = match_type;
    if (template_id !== undefined) updates.template_id = template_id;
    if (campaign_id !== undefined) updates.campaign_id = campaign_id || null;
    if (receiving_emails !== undefined) updates.receiving_emails = receiving_emails;

    const { data, error } = await supabaseAdmin
      .from('auto_reply_rules')
      .update(updates)
      .eq('id', req.params.id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('[AutoReply] Update rule error:', err);
    res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Failed to update rule' } });
  }
});

/**
 * DELETE /api/auto-reply/rules/:id
 */
autoReplyRouter.delete('/rules/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    await supabaseAdmin
      .from('auto_reply_rules')
      .delete()
      .eq('id', req.params.id)
      .eq('workspace_id', workspaceId);

    res.status(204).send();
  } catch (err) {
    console.error('[AutoReply] Delete rule error:', err);
    res.status(500).json({ error: { code: 'DELETE_FAILED', message: 'Failed to delete rule' } });
  }
});

// ============================================================
// Queue visibility
// ============================================================

/**
 * GET /api/auto-reply/queue
 */
autoReplyRouter.get('/queue', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const status = req.query.status as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    let query = supabaseAdmin
      .from('auto_reply_queue')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    console.error('[AutoReply] List queue error:', err);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list queue' } });
  }
});

/**
 * POST /api/auto-reply/queue/:id/skip
 */
autoReplyRouter.post('/queue/:id/skip', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { data, error } = await supabaseAdmin
      .from('auto_reply_queue')
      .update({ status: 'skipped', skip_reason: 'manual_skip' })
      .eq('id', req.params.id)
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .select('*')
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('[AutoReply] Skip queue item error:', err);
    res.status(500).json({ error: { code: 'SKIP_FAILED', message: 'Failed to skip item' } });
  }
});
