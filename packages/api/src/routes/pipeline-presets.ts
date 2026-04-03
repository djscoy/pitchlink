import { Router, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { pipelinePresetsService } from '../services/pipeline-presets';
import type { TransactionMode } from '@pitchlink/shared';

export const pipelinePresetsRouter = Router();

pipelinePresetsRouter.use(requireAuth);

/**
 * GET /api/pipeline-presets
 * List all presets (system defaults + workspace custom)
 * Query params: mode
 */
pipelinePresetsRouter.get('/', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const mode = req.query.mode as TransactionMode | undefined;

    const presets = await pipelinePresetsService.list(workspaceId, mode);
    res.json({ data: presets });
  } catch (err) {
    console.error('[Presets] List error:', err);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list presets' } });
  }
});

/**
 * GET /api/pipeline-presets/:id
 */
pipelinePresetsRouter.get('/:id', async (req, res: Response) => {
  try {
    const preset = await pipelinePresetsService.getById(req.params.id);
    res.json({ data: preset });
  } catch (err) {
    console.error('[Presets] Get error:', err);
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Preset not found' } });
  }
});

/**
 * POST /api/pipeline-presets
 * Create a custom pipeline preset
 */
pipelinePresetsRouter.post('/', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { name, mode, stages_json } = req.body;

    if (!name || !mode || !stages_json || !Array.isArray(stages_json)) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'name, mode, and stages_json array are required' },
      });
    }

    const preset = await pipelinePresetsService.create(workspaceId, {
      name,
      mode,
      stages_json,
    });

    res.status(201).json({ data: preset });
  } catch (err) {
    console.error('[Presets] Create error:', err);
    res.status(500).json({ error: { code: 'CREATE_FAILED', message: 'Failed to create preset' } });
  }
});

/**
 * PATCH /api/pipeline-presets/:id
 */
pipelinePresetsRouter.patch('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { name, mode, stages_json } = req.body;

    const preset = await pipelinePresetsService.update(workspaceId, req.params.id, {
      name,
      mode,
      stages_json,
    });

    res.json({ data: preset });
  } catch (err) {
    console.error('[Presets] Update error:', err);
    res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Failed to update preset' } });
  }
});

/**
 * DELETE /api/pipeline-presets/:id
 */
pipelinePresetsRouter.delete('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    await pipelinePresetsService.delete(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('[Presets] Delete error:', err);
    res.status(500).json({ error: { code: 'DELETE_FAILED', message: 'Failed to delete preset' } });
  }
});
