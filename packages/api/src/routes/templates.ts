import { Router, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { templatesService } from '../services/templates';
import type { TransactionMode } from '@pitchlink/shared';

export const templatesRouter = Router();

templatesRouter.use(requireAuth);

/**
 * GET /api/templates
 * Query params: mode, category
 */
templatesRouter.get('/', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const mode = req.query.mode as TransactionMode | undefined;
    const category = req.query.category as string | undefined;

    const result = await templatesService.list(workspaceId, { mode, category });
    res.json({ data: result });
  } catch (err) {
    console.error('[Templates] List error:', err);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list templates' } });
  }
});

/**
 * GET /api/templates/:id
 */
templatesRouter.get('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const template = await templatesService.getById(workspaceId, req.params.id);
    res.json({ data: template });
  } catch (err) {
    console.error('[Templates] Get error:', err);
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Template not found' } });
  }
});

/**
 * POST /api/templates
 */
templatesRouter.post('/', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { name, mode, category, subject, body_html } = req.body;

    if (!name || !mode || !subject) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'name, mode, and subject are required' },
      });
    }

    const template = await templatesService.create(workspaceId, {
      name,
      mode,
      category,
      subject,
      body_html: body_html || '',
    });

    res.status(201).json({ data: template });
  } catch (err) {
    console.error('[Templates] Create error:', err);
    res.status(500).json({ error: { code: 'CREATE_FAILED', message: 'Failed to create template' } });
  }
});

/**
 * PATCH /api/templates/:id
 */
templatesRouter.patch('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { name, mode, category, subject, body_html } = req.body;

    const template = await templatesService.update(workspaceId, req.params.id, {
      name,
      mode,
      category,
      subject,
      body_html,
    });

    res.json({ data: template });
  } catch (err) {
    console.error('[Templates] Update error:', err);
    res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Failed to update template' } });
  }
});

/**
 * DELETE /api/templates/:id
 */
templatesRouter.delete('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    await templatesService.delete(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('[Templates] Delete error:', err);
    res.status(500).json({ error: { code: 'DELETE_FAILED', message: 'Failed to delete template' } });
  }
});

/**
 * POST /api/templates/:id/resolve
 * Resolve template variables for a specific contact context.
 * Body: { contact_name, contact_email, domain, campaign_name, sender_name, sender_email, custom_fields }
 */
templatesRouter.post('/:id/resolve', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const template = await templatesService.getById(workspaceId, req.params.id);

    const {
      contact_name,
      contact_email,
      domain,
      campaign_name,
      sender_name,
      sender_email,
      custom_fields,
    } = req.body;

    const resolved = templatesService.resolveVariables(template.subject, template.body_html, {
      contactName: contact_name,
      contactEmail: contact_email,
      domain,
      campaignName: campaign_name,
      senderName: sender_name,
      senderEmail: sender_email,
      customFields: custom_fields,
    });

    res.json({ data: resolved });
  } catch (err) {
    console.error('[Templates] Resolve error:', err);
    res.status(500).json({ error: { code: 'RESOLVE_FAILED', message: 'Failed to resolve template' } });
  }
});
