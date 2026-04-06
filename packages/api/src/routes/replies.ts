import { Router, Response } from 'express';
import { getAuth, requireAuth } from '../middleware/auth';
import { replyDetectionService } from '../services/reply-detection';

export const repliesRouter = Router();

repliesRouter.use(requireAuth);

/**
 * GET /api/replies/recent
 * Fetch recent reply activities for the current workspace.
 * Used by the sidebar to show reply badges and notifications.
 *
 * Query params:
 *   limit - max results (default 20, max 100)
 */
repliesRouter.get('/recent', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const replies = await replyDetectionService.getRecentReplies(workspaceId, limit);
    res.json({ data: { replies, total: replies.length } });
  } catch (err) {
    console.error('[Replies] Recent replies error:', err);
    res.status(500).json({
      error: { code: 'REPLIES_FAILED', message: 'Failed to fetch recent replies' },
    });
  }
});

/**
 * GET /api/replies/count
 * Count unread/recent replies since a given timestamp.
 * Used by the sidebar for the notification badge count.
 *
 * Query params:
 *   since - ISO timestamp (default: 24 hours ago)
 */
repliesRouter.get('/count', async (req, res: Response) => {
  try {
    const { workspaceId } = getAuth(req);
    const since = req.query.since as string || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const replies = await replyDetectionService.getRecentReplies(workspaceId, 100);
    const recentCount = replies.filter(
      (r: { created_at: string }) => new Date(r.created_at) > new Date(since),
    ).length;

    res.json({ data: { count: recentCount, since } });
  } catch (err) {
    console.error('[Replies] Count error:', err);
    res.status(500).json({
      error: { code: 'COUNT_FAILED', message: 'Failed to count replies' },
    });
  }
});
