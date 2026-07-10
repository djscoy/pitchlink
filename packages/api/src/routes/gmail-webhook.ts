import { Router, Request, Response } from 'express';
import { replyDetectionService } from '../services/reply-detection';

export const gmailWebhookRouter = Router();

/**
 * POST /api/gmail/webhook
 *
 * Receives Gmail Pub/Sub push notifications.
 * Google sends a POST with a base64-encoded message containing:
 *   { emailAddress, historyId }
 *
 * Always returns 200 to acknowledge receipt — even on error —
 * to prevent Pub/Sub from retrying endlessly.
 */
gmailWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    // Opt-in shared-secret auth: set GMAIL_WEBHOOK_TOKEN on the service AND append
    // ?token=<value> to the Pub/Sub push endpoint URL. Unset = open (legacy behavior)
    // so enabling it is a deliberate two-sided change that cannot break the watcher
    // by itself. (The endpoint was fully unauthenticated - deal-logic review 2026-07-10.)
    const requiredToken = process.env.GMAIL_WEBHOOK_TOKEN;
    if (requiredToken && req.query.token !== requiredToken) {
      console.warn('[Gmail Webhook] Rejected notification with bad/missing token');
      return res.status(403).send();
    }

    const message = req.body?.message;

    if (!message?.data) {
      console.warn('[Gmail Webhook] Received notification with no data');
      return res.status(200).send();
    }

    const decoded = Buffer.from(message.data, 'base64').toString('utf-8');
    const payload = JSON.parse(decoded);

    const { emailAddress, historyId } = payload;

    if (!emailAddress || !historyId) {
      console.warn('[Gmail Webhook] Notification missing emailAddress or historyId');
      return res.status(200).send();
    }

    console.log('[Gmail Webhook] Notification received:', { emailAddress, historyId });

    // Process asynchronously — don't block the response
    replyDetectionService.processNotification(emailAddress, historyId).catch((err) => {
      console.error('[Gmail Webhook] Processing error:', err);
    });

    res.status(200).send();
  } catch (error) {
    console.error('[Gmail Webhook] Error:', error);
    res.status(200).send(); // ACK even on error
  }
});
