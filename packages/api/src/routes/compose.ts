/**
 * AI Compose Routes
 *
 * POST /api/compose/generate    — Generate an email draft with Claude
 * POST /api/compose/save-draft  — Save composed email as Gmail Draft
 */

import { Router, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { aiComposeService } from '../services/ai-compose';
import { supabaseAdmin } from '../db/supabase';

export const composeRouter = Router();

composeRouter.use(requireAuth);

/**
 * POST /api/compose/generate
 * Generate an AI-composed email draft.
 */
composeRouter.post('/generate', async (req, res: Response) => {
  try {
    const {
      contactEmail,
      contactName,
      contactDomain,
      campaignName,
      currentStage,
      mode,
      threadSubject,
      instruction,
      replyContext,
      templateBase,
    } = req.body;

    if (!contactEmail || !mode) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'contactEmail and mode are required' },
      });
    }

    const result = await aiComposeService.generateDraft({
      contactEmail,
      contactName,
      contactDomain,
      campaignName,
      currentStage,
      mode,
      threadSubject,
      instruction,
      replyContext,
      templateBase,
    });

    res.json({ data: result });
  } catch (err) {
    console.error('[Compose] Generate error:', err);
    res.status(500).json({ error: { code: 'GENERATE_FAILED', message: 'Failed to generate email draft' } });
  }
});

/**
 * POST /api/compose/save-draft
 * Save a composed email as a Gmail Draft.
 */
composeRouter.post('/save-draft', async (req, res: Response) => {
  try {
    const auth = getAuth(req);
    const { toEmail, subject, body, threadId } = req.body;

    if (!toEmail || !subject || !body) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'toEmail, subject, and body are required' },
      });
    }

    // Get Gmail access token
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

    const draftId = await aiComposeService.saveAsGmailDraft(
      watchState.access_token_encrypted,
      toEmail,
      subject,
      body,
      threadId,
    );

    if (!draftId) {
      return res.status(500).json({
        error: { code: 'DRAFT_FAILED', message: 'Failed to create Gmail draft' },
      });
    }

    res.json({ data: { gmailDraftId: draftId } });
  } catch (err) {
    console.error('[Compose] Save draft error:', err);
    res.status(500).json({ error: { code: 'SAVE_DRAFT_FAILED', message: 'Failed to save draft' } });
  }
});
