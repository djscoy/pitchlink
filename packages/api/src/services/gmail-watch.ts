import { supabaseAdmin } from '../db/supabase';

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || '';
const GCP_PUBSUB_TOPIC = process.env.GCP_PUBSUB_TOPIC || 'pitchlink-gmail-notifications';

/**
 * Gmail Watch Service
 *
 * Manages Gmail Pub/Sub watch registrations.
 * Each authenticated user gets a watch that pushes email change notifications
 * to our webhook endpoint via Google Cloud Pub/Sub.
 *
 * Watch expires every 7 days — we renew every 6 days via a cron/alarm.
 */
export const gmailWatchService = {
  /**
   * Register a Gmail watch for a user.
   * Called after OAuth authentication.
   */
  async registerWatch(userId: string, accessToken: string): Promise<{ historyId: string; expiration: string }> {
    const topicName = `projects/${GCP_PROJECT_ID}/topics/${GCP_PUBSUB_TOPIC}`;

    // Call Gmail API users.watch()
    const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/watch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicName,
        labelIds: ['INBOX'],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(`Gmail watch failed: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const historyId = data.historyId;
    const expiration = data.expiration; // Unix timestamp in ms

    // Store watch state
    await supabaseAdmin
      .from('gmail_watch_state')
      .upsert({
        user_id: userId,
        history_id: historyId,
        watch_expiry: new Date(parseInt(expiration)).toISOString(),
        access_token_encrypted: accessToken, // TODO: encrypt in production
        refresh_token_encrypted: null,
      }, { onConflict: 'user_id' });

    console.log(`[GmailWatch] Watch registered for user ${userId}, historyId: ${historyId}`);
    return { historyId, expiration };
  },

  /**
   * Renew watches for all users whose watch is expiring within 2 days.
   * Called by a cron job every 6 days.
   */
  async renewExpiringWatches(): Promise<{ renewed: number; failed: number }> {
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: expiringWatches, error } = await supabaseAdmin
      .from('gmail_watch_state')
      .select('user_id, access_token_encrypted')
      .lt('watch_expiry', twoDaysFromNow);

    if (error) {
      console.error('[GmailWatch] Failed to fetch expiring watches:', error);
      return { renewed: 0, failed: 0 };
    }

    let renewed = 0;
    let failed = 0;

    for (const watch of expiringWatches || []) {
      try {
        if (watch.access_token_encrypted) {
          await this.registerWatch(watch.user_id, watch.access_token_encrypted);
          renewed++;
        }
      } catch (err) {
        console.error(`[GmailWatch] Failed to renew watch for user ${watch.user_id}:`, err);
        failed++;
      }
    }

    console.log(`[GmailWatch] Renewal complete: ${renewed} renewed, ${failed} failed`);
    return { renewed, failed };
  },

  /**
   * Get the stored history ID for a user.
   */
  async getWatchState(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('gmail_watch_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Update the stored history ID after processing notifications.
   */
  async updateHistoryId(userId: string, historyId: string) {
    const { error } = await supabaseAdmin
      .from('gmail_watch_state')
      .update({ history_id: historyId })
      .eq('user_id', userId);

    if (error) {
      console.error('[GmailWatch] Failed to update historyId:', error);
    }
  },

  /**
   * Stop watching for a user (e.g., on logout or account deletion).
   */
  async stopWatch(userId: string, accessToken: string) {
    try {
      await fetch('https://www.googleapis.com/gmail/v1/users/me/stop', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      await supabaseAdmin
        .from('gmail_watch_state')
        .delete()
        .eq('user_id', userId);

      console.log(`[GmailWatch] Watch stopped for user ${userId}`);
    } catch (err) {
      console.error(`[GmailWatch] Failed to stop watch for user ${userId}:`, err);
    }
  },
};
