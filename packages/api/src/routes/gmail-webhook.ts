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
