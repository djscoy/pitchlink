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
        handleGetAuthToken().then(sendResponse).catch((err) => {
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

async function handleGetAuthToken(): Promise<{ token: string } | { error: string }> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
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

  const tokenResult = await handleGetAuthToken();
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

  return response.json();
}

// --- Alarms (Phase 2: Gmail Watch Renewal) ---

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'gmail-watch-renewal') {
      console.log('[PitchLink BG] Gmail watch renewal triggered');
      // TODO (Phase 2): Renew Gmail Pub/Sub watch for all authenticated users
    }
  });
}

// Set up recurring alarm for Gmail watch renewal (every 6 days)
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.alarms) {
    chrome.alarms.create('gmail-watch-renewal', {
      periodInMinutes: 6 * 24 * 60, // 6 days
    });
  }
  console.log('[PitchLink BG] Service worker installed, alarms created');
});

console.log('[PitchLink BG] Service worker loaded');
