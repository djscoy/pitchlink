/**
 * Sequences Routes
 *
 * GET    /api/sequences                    — List sequences
 * GET    /api/sequences/queue              — Get nudge queue (active/paused enrollments)
 * POST   /api/sequences                    — Create sequence
 * GET    /api/sequences/:id                — Get sequence
 * PATCH  /api/sequences/:id                — Update sequence
 * DELETE /api/sequences/:id                — Delete sequence
 * POST   /api/sequences/:id/enroll         — Enroll a deal in a sequence
 * GET    /api/sequences/enrollments/deal/:dealId — List enrollments for a deal
 * POST   /api/sequences/enrollments/:id/pause   — Pause enrollment
 * POST   /api/sequences/enrollments/:id/resume  — Resume enrollment
 * POST   /api/sequences/enrollments/:id/cancel  — Cancel enrollment
 */

import { Router, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { sequencesService } from '../services/sequences';

export const sequencesRouter = Router();

sequencesRouter.use(requireAuth);

// ============================================================
// Sequence CRUD
// ============================================================

/**
 * GET /api/sequences
 */
sequencesRouter.get('/', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { mode } = req.query;
    const result = await sequencesService.list(workspaceId, {
      mode: mode as string,
    });
    res.json({ data: result });
  } catch (err) {
    console.error('[Sequences] List error:', err);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list sequences' } });
  }
});

/**
 * GET /api/sequences/queue
 * Nudge queue — all active/paused enrollments sorted by next_fire_at
 */
sequencesRouter.get('/queue', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { mode, limit } = req.query;
    const data = await sequencesService.listQueue(workspaceId, {
      mode: mode as string,
      limit: limit ? parseInt(limit as string) : 50,
    });
    res.json({ data });
  } catch (err) {
    console.error('[Sequences] Queue error:', err);
    res.status(500).json({ error: { code: 'QUEUE_FAILED', message: 'Failed to load nudge queue' } });
  }
});

/**
 * POST /api/sequences
 */
sequencesRouter.post('/', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { name, mode, steps_json } = req.body;

    if (!name || !mode || !steps_json) {
      return res.status(400).json({
        error: { code: 'MISSING_FIELDS', message: 'name, mode, and steps_json are required' },
      });
    }

    const sequence = await sequencesService.create(workspaceId, { name, mode, steps_json });
    res.status(201).json({ data: sequence });
  } catch (err) {
    console.error('[Sequences] Create error:', err);
    res.status(500).json({ error: { code: 'CREATE_FAILED', message: 'Failed to create sequence' } });
  }
});

/**
 * GET /api/sequences/:id
 */
sequencesRouter.get('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const sequence = await sequencesService.getById(workspaceId, req.params.id);
    res.json({ data: sequence });
  } catch (err) {
    console.error('[Sequences] Get error:', err);
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Sequence not found' } });
  }
});

/**
 * PATCH /api/sequences/:id
 */
sequencesRouter.patch('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { name, steps_json, is_active } = req.body;
    const sequence = await sequencesService.update(workspaceId, req.params.id, {
      name,
      steps_json,
      is_active,
    });
    res.json({ data: sequence });
  } catch (err) {
    console.error('[Sequences] Update error:', err);
    res.status(500).json({ error: { code: 'UPDATE_FAILED', message: 'Failed to update sequence' } });
  }
});

/**
 * DELETE /api/sequences/:id
 */
sequencesRouter.delete('/:id', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    await sequencesService.delete(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('[Sequences] Delete error:', err);
    res.status(500).json({ error: { code: 'DELETE_FAILED', message: 'Failed to delete sequence' } });
  }
});

// ============================================================
// Enrollment Management
// ============================================================

/**
 * POST /api/sequences/:id/enroll
 * Body: { deal_id }
 */
sequencesRouter.post('/:id/enroll', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const { deal_id } = req.body;

    if (!deal_id) {
      return res.status(400).json({
        error: { code: 'MISSING_DEAL', message: 'deal_id is required' },
      });
    }

    const enrollment = await sequencesService.enroll(workspaceId, req.params.id, deal_id);
    res.status(201).json({ data: enrollment });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to enroll';
    console.error('[Sequences] Enroll error:', err);
    res.status(message.includes('already') ? 409 : 500).json({
      error: { code: 'ENROLL_FAILED', message },
    });
  }
});

/**
 * GET /api/sequences/enrollments/deal/:dealId
 */
sequencesRouter.get('/enrollments/deal/:dealId', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const data = await sequencesService.listByDeal(workspaceId, req.params.dealId);
    res.json({ data });
  } catch (err) {
    console.error('[Sequences] List enrollments error:', err);
    res.status(500).json({ error: { code: 'LIST_FAILED', message: 'Failed to list enrollments' } });
  }
});

/**
 * POST /api/sequences/enrollments/:id/pause
 */
sequencesRouter.post('/enrollments/:id/pause', async (req, res: Response) => {
  try {
    const enrollment = await sequencesService.pauseEnrollment(req.params.id, 'manual');
    res.json({ data: enrollment });
  } catch (err) {
    console.error('[Sequences] Pause error:', err);
    res.status(500).json({ error: { code: 'PAUSE_FAILED', message: 'Failed to pause enrollment' } });
  }
});

/**
 * POST /api/sequences/enrollments/:id/resume
 */
sequencesRouter.post('/enrollments/:id/resume', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const enrollment = await sequencesService.resumeEnrollment(workspaceId, req.params.id);
    res.json({ data: enrollment });
  } catch (err) {
    console.error('[Sequences] Resume error:', err);
    res.status(500).json({ error: { code: 'RESUME_FAILED', message: 'Failed to resume enrollment' } });
  }
});

/**
 * POST /api/sequences/enrollments/:id/cancel
 */
sequencesRouter.post('/enrollments/:id/cancel', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const enrollment = await sequencesService.cancelEnrollment(workspaceId, req.params.id);
    res.json({ data: enrollment });
  } catch (err) {
    console.error('[Sequences] Cancel error:', err);
    res.status(500).json({ error: { code: 'CANCEL_FAILED', message: 'Failed to cancel enrollment' } });
  }
});
