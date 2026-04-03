import * as InboxSDK from '@inboxsdk/core';
import { createRoot } from 'react-dom/client';
import { Sidebar } from './sidebar/Sidebar';
import { ThemeProvider } from './sidebar/ThemeProvider';
import { GmailAdapter } from './gmail-adapter/GmailAdapter';
import { getThemeStylesheet } from '@pitchlink/shared';

console.log('[PitchLink] Content script loaded on:', window.location.href);

// Inject theme CSS custom properties
const styleEl = document.createElement('style');
styleEl.textContent = getThemeStylesheet();
document.head.appendChild(styleEl);

// ============================================================
// InboxSDK Initialization
// ============================================================

const INBOXSDK_APP_ID = 'sdk_pitchlink_a3b3e98c61';

async function init() {
  console.log('[PitchLink] Initializing InboxSDK...');
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdk = await (InboxSDK as any).load(2, INBOXSDK_APP_ID);
    console.log('[PitchLink] InboxSDK loaded successfully');

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
    // Use a data URI for the icon since we don't have icon files yet
    const iconDataUri =
      'data:image/svg+xml,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#2563EB"/><text x="16" y="22" text-anchor="middle" fill="white" font-size="18" font-weight="bold" font-family="sans-serif">P</text></svg>',
      );

    sdk.Global.addSidebarContentPanel({
      el: sidebarContainer,
      title: 'PitchLink',
      iconUrl: iconDataUri,
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
