/**
 * API client for the extension.
 * Routes all requests through the service worker for auth token injection.
 */

import type {
  ApiResult,
  IIEResult,
  IIEAnalyzeRequest,
  IIEConfirmRequest,
  SourceRegistryEntry,
} from '@pitchlink/shared';

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'API_REQUEST',
        payload: { method, path, body },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response as T);
      },
    );
  });
}

// --- Typed API helpers ---

export const api = {
  // Contacts
  contacts: {
    list: (params?: { search?: string; limit?: number; offset?: number }) => {
      const query = new URLSearchParams();
      if (params?.search) query.set('search', params.search);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      const qs = query.toString();
      return apiRequest<ApiResult<unknown>>('GET', `/contacts${qs ? `?${qs}` : ''}`);
    },
    lookup: (email: string) =>
      apiRequest<ApiResult<unknown>>('GET', `/contacts/lookup?email=${encodeURIComponent(email)}`),
    create: (data: { email: string; name?: string; domain?: string; tags?: string[] }) =>
      apiRequest<ApiResult<unknown>>('POST', '/contacts', data),
    update: (id: string, data: { name?: string; tags?: string[]; notes?: string }) =>
      apiRequest<ApiResult<unknown>>('PATCH', `/contacts/${id}`, data),
    delete: (id: string) => apiRequest<void>('DELETE', `/contacts/${id}`),
    exportCSV: (campaignId: string) =>
      apiRequest<string>('GET', `/contacts/campaign/${campaignId}/export`),
  },

  // Campaigns
  campaigns: {
    list: (params?: { mode?: string; status?: string }) => {
      const query = new URLSearchParams();
      if (params?.mode) query.set('mode', params.mode);
      if (params?.status) query.set('status', params.status);
      const qs = query.toString();
      return apiRequest<ApiResult<unknown>>('GET', `/campaigns${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => apiRequest<ApiResult<unknown>>('GET', `/campaigns/${id}`),
    getStats: (id: string) => apiRequest<ApiResult<unknown>>('GET', `/campaigns/${id}/stats`),
    create: (data: { name: string; mode: string; pipeline_preset_id: string; client_id?: string }) =>
      apiRequest<ApiResult<unknown>>('POST', '/campaigns', data),
    update: (id: string, data: { name?: string; status?: string }) =>
      apiRequest<ApiResult<unknown>>('PATCH', `/campaigns/${id}`, data),
    delete: (id: string) => apiRequest<void>('DELETE', `/campaigns/${id}`),
  },

  // Deals
  deals: {
    listByCampaign: (campaignId: string) =>
      apiRequest<ApiResult<unknown>>('GET', `/deals/campaign/${campaignId}`),
    listByContact: (contactId: string) =>
      apiRequest<ApiResult<unknown>>('GET', `/deals/contact/${contactId}`),
    get: (id: string) => apiRequest<ApiResult<unknown>>('GET', `/deals/${id}`),
    create: (data: {
      contact_id: string;
      campaign_id: string;
      mode: string;
      initial_stage: string;
    }) => apiRequest<ApiResult<unknown>>('POST', '/deals', data),
    changeStage: (id: string, stage: string) =>
      apiRequest<ApiResult<unknown>>('PATCH', `/deals/${id}/stage`, { stage }),
    getActivities: (id: string) =>
      apiRequest<ApiResult<unknown>>('GET', `/deals/${id}/activities`),
    delete: (id: string) => apiRequest<void>('DELETE', `/deals/${id}`),
  },

  // Pipeline Presets
  presets: {
    list: (mode?: string) => {
      const qs = mode ? `?mode=${mode}` : '';
      return apiRequest<ApiResult<unknown>>('GET', `/pipeline-presets${qs}`);
    },
    get: (id: string) => apiRequest<ApiResult<unknown>>('GET', `/pipeline-presets/${id}`),
  },

  // Templates
  templates: {
    list: (mode?: string) => {
      const qs = mode ? `?mode=${mode}` : '';
      return apiRequest<ApiResult<unknown>>('GET', `/templates${qs}`);
    },
    get: (id: string) => apiRequest<ApiResult<unknown>>('GET', `/templates/${id}`),
    create: (data: { name: string; mode: string; subject: string; body_html: string; category?: string }) =>
      apiRequest<ApiResult<unknown>>('POST', '/templates', data),
    update: (id: string, data: { name?: string; subject?: string; body_html?: string }) =>
      apiRequest<ApiResult<unknown>>('PATCH', `/templates/${id}`, data),
    delete: (id: string) => apiRequest<void>('DELETE', `/templates/${id}`),
    resolve: (id: string, context: Record<string, string>) =>
      apiRequest<ApiResult<unknown>>('POST', `/templates/${id}/resolve`, context),
  },

  // IIE (Inbox Identity Engine)
  iie: {
    analyze: (data: IIEAnalyzeRequest) =>
      apiRequest<ApiResult<IIEResult>>('POST', '/iie/analyze', data),
    confirm: (data: IIEConfirmRequest) =>
      apiRequest<ApiResult<unknown>>('POST', '/iie/confirm', data),
    sourceRegistry: {
      list: () =>
        apiRequest<ApiResult<SourceRegistryEntry[]>>('GET', '/iie/source-registry'),
      create: (data: {
        forwarding_email: string;
        original_sender_email?: string;
        original_sender_name?: string;
        maps_to_client?: string;
        maps_to_campaign?: string;
      }) => apiRequest<ApiResult<SourceRegistryEntry>>('POST', '/iie/source-registry', data),
      update: (id: string, data: {
        original_sender_email?: string;
        original_sender_name?: string;
        maps_to_client?: string;
        maps_to_campaign?: string;
      }) => apiRequest<ApiResult<SourceRegistryEntry>>('PATCH', `/iie/source-registry/${id}`, data),
      delete: (id: string) =>
        apiRequest<void>('DELETE', `/iie/source-registry/${id}`),
    },
  },
};
