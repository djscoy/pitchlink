import * as InboxSDK from '@inboxsdk/core';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './sidebar/Sidebar';
import { ThemeProvider } from './sidebar/ThemeProvider';
import { GmailAdapter } from './gmail-adapter/GmailAdapter';
import { getThemeStylesheet } from '@pitchlink/shared';

// Inject theme CSS custom properties
const styleEl = document.createElement('style');
styleEl.textContent = getThemeStylesheet();
document.head.appendChild(styleEl);

// ============================================================
// InboxSDK Initialization
// ============================================================

const INBOXSDK_APP_ID = 'pitchlink';

async function init() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdk = await (InboxSDK as any).load(2, INBOXSDK_APP_ID);

    // Register the sidebar panel
    const gmailAdapter = new GmailAdapter(sdk);

    // Create sidebar container
    const sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'pitchlink-sidebar-root';
    sidebarContainer.className = 'pitchlink-theme-system';

    // Mount React app into sidebar
    const root = createRoot(sidebarContainer);
    root.render(
      <ThemeProvider>
        <Sidebar gmailAdapter={gmailAdapter} />
      </ThemeProvider>,
    );

    // Register with InboxSDK's global sidebar
    sdk.Global.addSidebarContentPanel({
      el: sidebarContainer,
      title: 'PitchLink',
      iconUrl: chrome.runtime.getURL('icons/icon32.png'),
    });

    console.log('[PitchLink] Sidebar registered successfully');

    // Listen for thread view changes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sdk.Conversations.registerThreadViewHandler((threadView: any) => {
      gmailAdapter.handleThreadView(threadView);
    });
  } catch (error) {
    console.error('[PitchLink] Failed to initialize:', error);
  }
}

init();
