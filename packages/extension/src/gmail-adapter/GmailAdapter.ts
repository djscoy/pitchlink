/**
 * Gmail Adapter — Thin isolation layer over InboxSDK.
 *
 * All InboxSDK-dependent code lives here. The rest of the extension
 * interacts through this adapter, making InboxSDK swappable if needed.
 */

type ThreadViewHandler = (data: ThreadViewData | null) => void;

export interface ThreadViewData {
  threadId: string;
  messageId: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  messageCount: number;
}

export class GmailAdapter {
  private threadViewListeners: ThreadViewHandler[] = [];
  private currentThreadData: ThreadViewData | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _sdk: any) {
    // SDK stored for future use (compose integration, etc.)
    void this._sdk;
  }


  /**
   * Called by InboxSDK when a thread view is opened.
   * Extracts sender info and notifies listeners.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleThreadView(threadView: any) {
    try {
      const messageViews = threadView.getMessageViewsAll();
      if (messageViews.length === 0) return;

      // Get the first message (original sender)
      const firstMessage = messageViews[0];
      const sender = firstMessage.getSender();

      const data: ThreadViewData = {
        threadId: 'pending',
        messageId: '',
        senderEmail: sender?.emailAddress || '',
        senderName: sender?.name || '',
        subject: threadView.getSubject?.() || '',
        messageCount: messageViews.length,
      };

      // Resolve thread ID and message ID async (InboxSDK deprecated sync versions)
      const promises: Promise<void>[] = [];

      if (threadView.getThreadIDAsync) {
        promises.push(
          threadView.getThreadIDAsync().then((id: string) => {
            data.threadId = id;
          }),
        );
      }

      if (firstMessage.getMessageIDAsync) {
        promises.push(
          firstMessage.getMessageIDAsync().then((id: string) => {
            data.messageId = id;
          }).catch(() => {
            // Message not loaded yet — retry after a delay
            console.warn('[GmailAdapter] Message not loaded yet, retrying in 1.5s...');
            return new Promise<void>((resolve) => {
              setTimeout(() => {
                if (firstMessage.getMessageIDAsync) {
                  firstMessage.getMessageIDAsync().then((id: string) => {
                    data.messageId = id;
                    resolve();
                  }).catch(() => {
                    console.warn('[GmailAdapter] Message ID retry failed, will proceed without it');
                    resolve();
                  });
                } else {
                  resolve();
                }
              }, 1500);
            });
          }),
        );
      }

      if (promises.length > 0) {
        Promise.all(promises).then(() => {
          this.currentThreadData = data;
          this.notifyListeners(data);
        });
      } else {
        this.currentThreadData = data;
        this.notifyListeners(data);
      }

      // Listen for thread view destruction (user navigates away)
      if (threadView.on) {
        threadView.on('destroy', () => {
          this.currentThreadData = null;
          this.notifyListeners(null);
        });
      }
    } catch (error) {
      console.error('[GmailAdapter] Error handling thread view:', error);
    }
  }

  /**
   * Register a listener for thread view changes.
   */
  onThreadView(handler: ThreadViewHandler): () => void {
    this.threadViewListeners.push(handler);
    // Return unsubscribe function
    return () => {
      this.threadViewListeners = this.threadViewListeners.filter((h) => h !== handler);
    };
  }

  /**
   * Get the currently viewed thread data (if any).
   */
  getCurrentThread(): ThreadViewData | null {
    return this.currentThreadData;
  }

  /**
   * Extract email domain from an email address.
   */
  static extractDomain(email: string): string {
    const parts = email.split('@');
    return parts.length === 2 ? parts[1].toLowerCase() : '';
  }

  private notifyListeners(data: ThreadViewData | null) {
    for (const listener of this.threadViewListeners) {
      try {
        listener(data);
      } catch (error) {
        console.error('[GmailAdapter] Listener error:', error);
      }
    }
  }
}
