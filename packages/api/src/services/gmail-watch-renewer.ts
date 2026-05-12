/**
 * Gmail Watch Renewer — Periodically renews Gmail Pub/Sub watches before they expire.
 *
 * Gmail watches expire every 7 days. This executor runs every 6 hours and renews
 * any watch whose expiry is within the next 2 days, so a missed run still has
 * margin before the watch lapses.
 */

import { gmailWatchService } from './gmail-watch';

const RENEWER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
let renewerTimer: ReturnType<typeof setInterval> | null = null;

export const gmailWatchRenewerService = {
  start() {
    if (renewerTimer) return;
    console.log('[GmailWatchRenewer] Started (every 6 hours)');
    this.renew().catch((err) => console.error('[GmailWatchRenewer] Initial run error:', err));
    renewerTimer = setInterval(() => {
      this.renew().catch((err) => console.error('[GmailWatchRenewer] Run error:', err));
    }, RENEWER_INTERVAL_MS);
  },

  stop() {
    if (renewerTimer) {
      clearInterval(renewerTimer);
      renewerTimer = null;
      console.log('[GmailWatchRenewer] Stopped');
    }
  },

  async renew() {
    return gmailWatchService.renewExpiringWatches();
  },
};
