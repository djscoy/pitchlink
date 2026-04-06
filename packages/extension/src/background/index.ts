// ============================================================
// PitchLink Service Worker (Manifest V3 Background)
// ============================================================

// --- InboxSDK MV3 Background Helper ---
// InboxSDK needs this to inject pageWorld.js into Gmail's main world
import '@inboxsdk/core/background';

/**
 * Handles:
 * - InboxSDK pageWorld injection (MV3 requirement)
 * - OAuth token management
 * - Message passing between content script and API
 * - Alarm-based tasks (Gmail watch renewal, sequence scheduling)
 */

// --- Message Types ---

interface PitchLinkMessage {
  type: string;
  payload?: unknown;
}

// --- Message Handler ---

chrome.runtime.onMessage.addListener(
  (message: PitchLinkMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'GET_AUTH_TOKEN':
        handleGetAuthToken(true).then(sendResponse).catch((err) => {
          sendResponse({ error: err.message });
        });
        return true; // async response

      case 'API_REQUEST':
        handleApiRequest(message.payload as ApiRequestPayload)
          .then(sendResponse)
          .catch((err) => {
            sendResponse({ error: err.message });
          });
        return true;

      case 'REGISTER_GMAIL_WATCH':
        handleRegisterGmailWatch().then(sendResponse).catch((err) => {
          sendResponse({ error: err.message });
        });
        return true;

      case 'RENEW_GMAIL_WATCHES':
        handleRenewWatches().then(sendResponse).catch((err) => {
          sendResponse({ error: err.message });
        });
        return true;

      case 'HEALTH_CHECK':
        sendResponse({ status: 'ok', timestamp: Date.now() });
        return false;

      default:
        console.warn('[PitchLink BG] Unknown message type:', message.type);
        return false;
    }
  },
);

// --- Auth ---

async function handleGetAuthToken(interactive = false): Promise<{ token: string } | { error: string }> {
  return new Promise((resolve) => {
    // Timeout guard: if getAuthToken hangs (e.g. interactive popup not dismissed),
    // resolve with error after 10 seconds to prevent freezing the content script.
    const timeout = setTimeout(() => {
      resolve({ error: 'Auth token request timed out' });
    }, 10000);

    chrome.identity.getAuthToken({ interactive }, (token) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError || !token) {
        resolve({ error: chrome.runtime.lastError?.message || 'No token returned' });
      } else {
        resolve({ token });
      }
    });
  });
}

// --- API Proxy ---

interface ApiRequestPayload {
  method: string;
  path: string;
  body?: unknown;
}

const API_BASE = 'http://localhost:3001/api'; // TODO: env-based

async function handleApiRequest(
  payload: ApiRequestPayload,
): Promise<unknown> {
  const { method, path, body } = payload;

  // Use non-interactive auth for API calls — never show a popup during data fetches.
  // If the token is expired/missing, fail fast and let the UI handle re-auth.
  const tokenResult = await handleGetAuthToken(false);
  if ('error' in tokenResult) {
    throw new Error(`Auth failed: ${tokenResult.error}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenResult.token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  // Handle 204 No Content (e.g. DELETE responses)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return { success: true };
  }

  return response.json();
}

// --- Gmail Watch Registration ---

/**
 * Register a Gmail watch for the current user.
 * Called after OAuth to start receiving Pub/Sub reply notifications.
 */
async function handleRegisterGmailWatch(): Promise<{ success: boolean } | { error: string }> {
  const tokenResult = await handleGetAuthToken(false);
  if ('error' in tokenResult) {
    return { error: `Auth failed: ${tokenResult.error}` };
  }

  // Get user info for the callback
  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenResult.token}` },
  });

  if (!userInfoResponse.ok) {
    return { error: 'Failed to get user info' };
  }

  const userInfo = await userInfoResponse.json();

  // Call the auth callback to register the watch
  const response = await fetch(`${API_BASE}/auth/google-callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenResult.token}`,
    },
    body: JSON.stringify({
      google_id: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      avatar_url: userInfo.picture,
      access_token: tokenResult.token,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
    return { error: err.error?.message || 'Watch registration failed' };
  }

  console.log('[PitchLink BG] Gmail watch registered successfully');
  return { success: true };
}

/**
 * Trigger server-side watch renewal for all expiring watches.
 */
async function handleRenewWatches(): Promise<unknown> {
  const tokenResult = await handleGetAuthToken(false);
  if ('error' in tokenResult) {
    throw new Error(`Auth failed: ${tokenResult.error}`);
  }

  const response = await fetch(`${API_BASE}/auth/renew-watches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenResult.token}`,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Renewal failed' }));
    throw new Error(err.message || `Renewal error: ${response.status}`);
  }

  return response.json();
}

// --- Alarms (Gmail Watch Renewal) ---

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'gmail-watch-renewal') {
      console.log('[PitchLink BG] Gmail watch renewal alarm triggered');
      handleRenewWatches()
        .then((result) => {
          console.log('[PitchLink BG] Watch renewal result:', result);
        })
        .catch((err) => {
          console.error('[PitchLink BG] Watch renewal failed:', err);
        });
    }
  });
}

// Set up recurring alarm for Gmail watch renewal (every 6 days)
// and register the initial Gmail watch on install
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.alarms) {
    chrome.alarms.create('gmail-watch-renewal', {
      periodInMinutes: 6 * 24 * 60, // 6 days
    });
  }
  console.log('[PitchLink BG] Service worker installed, alarms created');

  // Register Gmail watch on first install (non-blocking)
  handleRegisterGmailWatch()
    .then((result) => {
      console.log('[PitchLink BG] Initial Gmail watch registration:', result);
    })
    .catch((err) => {
      console.warn('[PitchLink BG] Initial watch registration failed (will retry on next auth):', err);
    });
});

console.log('[PitchLink BG] Service worker loaded');
