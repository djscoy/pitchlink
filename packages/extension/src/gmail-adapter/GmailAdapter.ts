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
  private userEmails: Set<string> = new Set();
  // Store the raw thread view so we can re-process when userEmails arrive
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private currentRawThreadView: any = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _sdk: any) {
    // SDK stored for future use (compose integration, etc.)
    void this._sdk;
  }

  /**
   * Set the user's own email addresses so we can filter them out
   * when identifying the external contact in a thread.
   * If a thread is currently open, re-processes it with the updated list.
   */
  setUserEmails(emails: string[]) {
    this.userEmails = new Set(emails.map((e) => e.toLowerCase()));
    // Re-process current thread if we have one and user emails just arrived
    if (this.currentRawThreadView) {
      this.handleThreadView(this.currentRawThreadView);
    }
  }

  /**
   * Called by InboxSDK when a thread view is opened.
   * Extracts sender info and notifies listeners.
   * Skips the user's own email addresses to find the real external contact.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleThreadView(threadView: any) {
    try {
      this.currentRawThreadView = threadView;
      const messageViews = threadView.getMessageViewsAll();
      if (messageViews.length === 0) return;

      // Find the first external sender (not the user's own email)
      const contactSender = this.findExternalContact(messageViews);

      // Fall back to first message sender if no external contact found
      const fallbackSender = messageViews[0].getSender();
      const sender = contactSender || fallbackSender;

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

      // Get message ID from the first message (for IIE analysis)
      const firstMessage = messageViews[0];
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
          this.currentRawThreadView = null;
          this.notifyListeners(null);
        });
      }
    } catch (error) {
      console.error('[GmailAdapter] Error handling thread view:', error);
    }
  }

  /**
   * Find the first external contact (non-user) in a thread's messages.
   * Checks senders first, then falls back to recipients if the user sent all messages.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private findExternalContact(messageViews: any[]): { emailAddress: string; name: string } | null {
    // If we don't know the user's emails yet, can't filter
    if (this.userEmails.size === 0) return null;

    // 1. Check all message senders — find the first one that isn't the user
    for (const mv of messageViews) {
      const sender = mv.getSender?.();
      if (sender?.emailAddress && !this.userEmails.has(sender.emailAddress.toLowerCase())) {
        return sender;
      }
    }

    // 2. All senders are the user — check recipients of the first message
    //    (the user sent the initial email, so the To: address is the contact)
    for (const mv of messageViews) {
      const recipients = mv.getRecipients?.() || [];
      for (const recipient of recipients) {
        if (recipient?.emailAddress && !this.userEmails.has(recipient.emailAddress.toLowerCase())) {
          return recipient;
        }
      }
      // Only check first message's recipients
      break;
    }

    return null;
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
