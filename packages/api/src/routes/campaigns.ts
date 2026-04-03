import { Router, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { campaignsService } from '../services/campaigns';

export const campaignsRouter = Router();

campaignsRouter.use(requireAuth);

/**
 * GET /api/campaigns
 * Query params: mode, status
 */
campaignsRouter.get('/', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { mode, status } = req.query;

    const result = await campaignsService.list(workspaceId, {
      mode: mode as string,
      status: status as string,
    });

    res.json({ data: result });
  } catch (err) {
    console.error('[Campaigns] List error:', err);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list campaigns' } });
  }
});

/**
 * GET /api/campaigns/:id
 */
campaignsRouter.get('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const campaign = await campaignsService.getById(workspaceId, req.params.id);
    res.json({ data: campaign });
  } catch (err) {
    console.error('[Campaigns] Get error:', err);
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Campaign not found' } });
  }
});

/**
 * GET /api/campaigns/:id/stats
 * Get campaign with stage counts
 */
campaignsRouter.get('/:id/stats', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const stats = await campaignsService.getStats(workspaceId, req.params.id);
    res.json({ data: stats });
  } catch (err) {
    console.error('[Campaigns] Stats error:', err);
    res.status(500).json({ error: { code: 'STATS_FAILED', message: 'Failed to get campaign stats' } });
  }
});

/**
 * POST /api/campaigns
 */
campaignsRouter.post('/', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { name, mode, pipeline_preset_id, client_id } = req.body;

    if (!name || !mode || !pipeline_preset_id) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'name, mode, and pipeline_preset_id are required' },
      });
    }

    const campaign = await campaignsService.create(workspaceId, {
      name,
      mode,
      pipeline_preset_id,
      client_id,
    });

    res.status(201).json({ data: campaign });
  } catch (err) {
    console.error('[Campaigns] Create error:', err);
    res.status(500).json({ error: { code: 'CREATE_FAILED', message: 'Failed to create campaign' } });
  }
});

/**
 * PATCH /api/campaigns/:id
 */
campaignsRouter.patch('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { name, status, client_id } = req.body;

    const campaign = await campaignsService.update(workspaceId, req.params.id, {
      name,
      status,
      client_id,
    });

    res.json({ data: campaign });
  } catch (err) {
    console.error('[Campaigns] Update error:', err);
    res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Failed to update campaign' } });
  }
});

/**
 * DELETE /api/campaigns/:id
 */
campaignsRouter.delete('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    await campaignsService.delete(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('[Campaigns] Delete error:', err);
    res.status(500).json({ error: { code: 'DELETE_FAILED', message: 'Failed to delete campaign' } });
  }
});
