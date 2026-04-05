import { Router, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { dealsService } from '../services/deals';

export const dealsRouter = Router();

dealsRouter.use(requireAuth);

/**
 * GET /api/deals/contact/:contactId
 * List deals for a contact (with campaign + pipeline info)
 */
dealsRouter.get('/contact/:contactId', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const deals = await dealsService.listByContact(workspaceId, req.params.contactId);
    res.json({ data: deals });
  } catch (err) {
    console.error('[Deals] List by contact error:', err);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list deals for contact' } });
  }
});

/**
 * GET /api/deals/campaign/:campaignId
 * List deals for a campaign
 */
dealsRouter.get('/campaign/:campaignId', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const deals = await dealsService.listByCampaign(workspaceId, req.params.campaignId);
    res.json({ data: deals });
  } catch (err) {
    console.error('[Deals] List error:', err);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list deals' } });
  }
});

/**
 * POST /api/deals/bulk
 * Bulk-assign contacts to a campaign (creates deals)
 */
dealsRouter.post('/bulk', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { contact_ids, campaign_id, mode, initial_stage } = req.body;

    if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
      return res.status(400).json({
        error: { code: 'INVALID_CONTACT_IDS', message: 'contact_ids must be a non-empty array' },
      });
    }
    if (contact_ids.length > 2000) {
      return res.status(400).json({
        error: { code: 'TOO_MANY_CONTACTS', message: 'Maximum 2000 contacts per bulk assign' },
      });
    }
    if (!campaign_id || !mode || !initial_stage) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'campaign_id, mode, and initial_stage are required' },
      });
    }

    const result = await dealsService.bulkCreate(workspaceId, {
      contact_ids,
      campaign_id,
      mode,
      initial_stage,
    });

    res.status(201).json({ data: result });
  } catch (err) {
    console.error('[Deals] Bulk create error:', err);
    res.status(500).json({ error: { code: 'BULK_CREATE_FAILED', message: 'Failed to bulk-assign contacts' } });
  }
});

/**
 * GET /api/deals/activities
 * Global activity feed across all deals (filtered by mode)
 */
dealsRouter.get('/activities', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const mode = req.query.mode as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

    const result = await dealsService.getGlobalActivities(workspaceId, { mode, limit, offset });
    res.json({ data: result });
  } catch (err) {
    console.error('[Deals] Global activities error:', err);
    res.status(500).json({ error: { code: 'ACTIVITIES_FAILED', message: 'Failed to get global activities' } });
  }
});

/**
 * GET /api/deals/:id
 */
dealsRouter.get('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const deal = await dealsService.getById(workspaceId, req.params.id);
    res.json({ data: deal });
  } catch (err) {
    console.error('[Deals] Get error:', err);
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deal not found' } });
  }
});

/**
 * POST /api/deals
 * Add a contact to a campaign (creates a deal)
 */
dealsRouter.post('/', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { contact_id, campaign_id, mode, initial_stage } = req.body;

    if (!contact_id || !campaign_id || !mode || !initial_stage) {
      return res.status(400).json({
        error: {
          code: 'MISSING_FIELDS',
          message: 'contact_id, campaign_id, mode, and initial_stage are required',
        },
      });
    }

    const deal = await dealsService.create(workspaceId, {
      contact_id,
      campaign_id,
      mode,
      initial_stage,
    });

    res.status(201).json({ data: deal });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create deal';
    console.error('[Deals] Create error:', err);
    res.status(message.includes('already') ? 409 : 500).json({
      error: { code: 'CREATE_FAILED', message },
    });
  }
});

/**
 * PATCH /api/deals/:id/stage
 * Change a deal's pipeline stage
 */
dealsRouter.patch('/:id/stage', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { stage } = req.body;

    if (!stage) {
      return res.status(400).json({
        error: { code: 'MISSING_STAGE', message: 'stage is required' },
      });
    }

    const deal = await dealsService.changeStage(workspaceId, req.params.id, stage);
    res.json({ data: deal });
  } catch (err) {
    console.error('[Deals] Stage change error:', err);
    res.status(500).json({ error: { code: 'STAGE_CHANGE_FAILED', message: 'Failed to change stage' } });
  }
});

/**
 * GET /api/deals/:id/activities
 * Get activity log for a deal
 */
dealsRouter.get('/:id/activities', async (req, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const activities = await dealsService.getActivities(req.params.id, limit);
    res.json({ data: activities });
  } catch (err) {
    console.error('[Deals] Activities error:', err);
    res.status(500).json({ error: { code: 'ACTIVITIES_FAILED', message: 'Failed to get activities' } });
  }
});

/**
 * DELETE /api/deals/:id
 */
dealsRouter.delete('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    await dealsService.delete(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('[Deals] Delete error:', err);
    res.status(500).json({ error: { code: 'DELETE_FAILED', message: 'Failed to delete deal' } });
  }
});
