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
  OnboardingScanProgress,
  OnboardingContact,
} from '@pitchlink/shared';

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    // Timeout guard: if the service worker never responds (e.g. dormant, crashed),
    // reject after 15 seconds to prevent the UI from hanging indefinitely.
    const timeout = setTimeout(() => {
      reject(new Error(`API request timed out: ${method} ${path}`));
    }, 15000);

    chrome.runtime.sendMessage(
      {
        type: 'API_REQUEST',
        payload: { method, path, body },
      },
      (response) => {
        clearTimeout(timeout);
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
    enrich: (id: string) =>
      apiRequest<ApiResult<{ data: Record<string, unknown>; providers_used: string[] }>>('POST', `/contacts/${id}/enrich`),
    getEnrichment: (id: string) =>
      apiRequest<ApiResult<{ summary: Record<string, unknown>; providers: { provider: string; fetched_at: string; expires_at: string }[] }>>('GET', `/contacts/${id}/enrichment`),
    bulkEnrich: (campaignId: string) =>
      apiRequest<ApiResult<{ enriched: number; failed: number; total: number }>>('POST', '/contacts/bulk-enrich', { campaign_id: campaignId }),
    exportCSV: (campaignId: string) =>
      apiRequest<string>('GET', `/contacts/campaign/${campaignId}/export`),
    listUnassigned: (campaignId: string, params?: { search?: string; limit?: number; offset?: number }) => {
      const query = new URLSearchParams();
      query.set('campaign_id', campaignId);
      if (params?.search) query.set('search', params.search);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      return apiRequest<ApiResult<unknown>>('GET', `/contacts/unassigned?${query.toString()}`);
    },
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
    getDashboardStats: (mode?: string) => {
      const qs = mode ? `?mode=${mode}` : '';
      return apiRequest<ApiResult<{ total_contacts: number; active_campaigns: number; total_deals: number; recent_replies: number; active_enrollments: number; enriched_contacts: number }>>('GET', `/campaigns/dashboard-stats${qs}`);
    },
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
    bulkCreate: (data: {
      contact_ids: string[];
      campaign_id: string;
      mode: string;
      initial_stage: string;
    }) => apiRequest<ApiResult<{ created: number; skipped: number }>>('POST', '/deals/bulk', data),
    changeStage: (id: string, stage: string) =>
      apiRequest<ApiResult<unknown>>('PATCH', `/deals/${id}/stage`, { stage }),
    getActivities: (id: string) =>
      apiRequest<ApiResult<unknown>>('GET', `/deals/${id}/activities`),
    getGlobalActivities: (params: { mode?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params.mode) qs.set('mode', params.mode);
      if (params.limit) qs.set('limit', String(params.limit));
      if (params.offset) qs.set('offset', String(params.offset));
      const q = qs.toString();
      return apiRequest<ApiResult<{ activities: unknown[]; total: number }>>('GET', `/deals/activities${q ? '?' + q : ''}`);
    },
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

  // Onboarding
  onboarding: {
    startScan: (config: { time_range_days?: number; min_interactions?: number; exclude_emails?: string[] }) =>
      apiRequest<ApiResult<{ scan_id: string }>>('POST', '/onboarding/scan', config),
    getScanProgress: (scanId: string) =>
      apiRequest<ApiResult<OnboardingScanProgress>>('GET', `/onboarding/scan/${scanId}`),
    getScanContacts: (scanId: string, params?: { status?: string; deal_status?: string; limit?: number; offset?: number }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.deal_status) query.set('deal_status', params.deal_status);
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      const qs = query.toString();
      return apiRequest<ApiResult<{ contacts: OnboardingContact[]; total: number }>>('GET', `/onboarding/scan/${scanId}/contacts${qs ? `?${qs}` : ''}`);
    },
    updateContact: (contactId: string, data: { status?: string; name?: string; deal_status?: string }) =>
      apiRequest<ApiResult<OnboardingContact>>('PATCH', `/onboarding/contacts/${contactId}`, data),
    commitContacts: (scanId: string, campaignId?: string) =>
      apiRequest<ApiResult<{ imported: number }>>('POST', `/onboarding/scan/${scanId}/commit`, { campaign_id: campaignId }),
    restartScan: (scanId: string) =>
      apiRequest<ApiResult<{ restarted: boolean }>>('POST', `/onboarding/scan/${scanId}/restart`),
    getStatus: () =>
      apiRequest<ApiResult<{ onboarding_complete: boolean }>>('GET', '/onboarding/status'),
    getExcludedEmails: () =>
      apiRequest<ApiResult<{ excluded_emails: string[]; excluded_domains: string[] }>>('GET', '/onboarding/excluded-emails'),
    saveExcludedEmails: (data: { excluded_emails?: string[]; excluded_domains?: string[] }) =>
      apiRequest<ApiResult<{ excluded_emails: string[]; excluded_domains: string[] }>>('PATCH', '/onboarding/excluded-emails', data),
  },

  // Sequences
  sequences: {
    list: (params?: { mode?: string }) => {
      const qs = params?.mode ? `?mode=${params.mode}` : '';
      return apiRequest<ApiResult<unknown>>('GET', `/sequences${qs}`);
    },
    get: (id: string) => apiRequest<ApiResult<unknown>>('GET', `/sequences/${id}`),
    create: (data: { name: string; mode: string; steps_json: unknown[] }) =>
      apiRequest<ApiResult<unknown>>('POST', '/sequences', data),
    update: (id: string, data: { name?: string; steps_json?: unknown[]; is_active?: boolean }) =>
      apiRequest<ApiResult<unknown>>('PATCH', `/sequences/${id}`, data),
    delete: (id: string) => apiRequest<void>('DELETE', `/sequences/${id}`),
    queue: (params?: { mode?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.mode) query.set('mode', params.mode);
      if (params?.limit) query.set('limit', String(params.limit));
      const qs = query.toString();
      return apiRequest<ApiResult<unknown>>('GET', `/sequences/queue${qs ? `?${qs}` : ''}`);
    },
    enroll: (sequenceId: string, dealId: string) =>
      apiRequest<ApiResult<unknown>>('POST', `/sequences/${sequenceId}/enroll`, { deal_id: dealId }),
    enrollmentsByDeal: (dealId: string) =>
      apiRequest<ApiResult<unknown>>('GET', `/sequences/enrollments/deal/${dealId}`),
    pauseEnrollment: (enrollmentId: string) =>
      apiRequest<ApiResult<unknown>>('POST', `/sequences/enrollments/${enrollmentId}/pause`),
    resumeEnrollment: (enrollmentId: string) =>
      apiRequest<ApiResult<unknown>>('POST', `/sequences/enrollments/${enrollmentId}/resume`),
    cancelEnrollment: (enrollmentId: string) =>
      apiRequest<ApiResult<unknown>>('POST', `/sequences/enrollments/${enrollmentId}/cancel`),
  },

  // AI Compose
  compose: {
    generate: (data: {
      contactEmail: string;
      contactName?: string;
      contactDomain?: string;
      campaignName?: string;
      currentStage?: string;
      mode: string;
      threadSubject?: string;
      instruction?: string;
      replyContext?: string;
      templateBase?: { subject: string; body: string };
    }) => apiRequest<ApiResult<{ subject: string; body: string }>>('POST', '/compose/generate', data),
    saveDraft: (data: {
      toEmail: string;
      subject: string;
      body: string;
      threadId?: string;
    }) => apiRequest<ApiResult<{ gmailDraftId: string }>>('POST', '/compose/save-draft', data),
  },

  // Replies (Reply Detection)
  replies: {
    recent: (limit?: number) => {
      const qs = limit ? `?limit=${limit}` : '';
      return apiRequest<ApiResult<{ replies: unknown[]; total: number }>>('GET', `/replies/recent${qs}`);
    },
    count: (since?: string) => {
      const qs = since ? `?since=${encodeURIComponent(since)}` : '';
      return apiRequest<ApiResult<{ count: number; since: string }>>('GET', `/replies/count${qs}`);
    },
  },

  // Discovery
  discovery: {
    providers: () =>
      apiRequest<ApiResult<{ providers: string[] }>>('GET', '/discovery/providers'),
    searchByDomain: (domain: string, params?: { limit?: number; offset?: number }) => {
      const query = new URLSearchParams({ domain });
      if (params?.limit) query.set('limit', String(params.limit));
      if (params?.offset) query.set('offset', String(params.offset));
      return apiRequest<ApiResult<{
        prospects: {
          email: string;
          first_name?: string;
          last_name?: string;
          full_name?: string;
          job_title?: string;
          company_name?: string;
          company_domain?: string;
          linkedin_url?: string;
          confidence?: number;
          source: string;
        }[];
        total: number;
        domain: string;
        organization?: string;
      }>>('GET', `/discovery/domain?${query.toString()}`);
    },
    searchByRole: (params: {
      company_domain?: string;
      titles?: string[];
      seniorities?: string[];
      keywords?: string;
      limit?: number;
      page?: number;
    }) =>
      apiRequest<ApiResult<{
        prospects: {
          email: string;
          first_name?: string;
          last_name?: string;
          full_name?: string;
          job_title?: string;
          company_name?: string;
          company_domain?: string;
          linkedin_url?: string;
          confidence?: number;
          source: string;
        }[];
        total: number;
      }>>('POST', '/discovery/people', params),
  },

  // Auto-Reply
  autoReply: {
    listRules: () =>
      apiRequest<ApiResult<unknown>>('GET', '/auto-reply/rules'),
    createRule: (data: {
      template_id: string;
      campaign_id?: string;
      mode?: string;
      delay_minutes?: number;
      match_type?: string;
      receiving_emails?: string[];
    }) => apiRequest<ApiResult<unknown>>('POST', '/auto-reply/rules', data),
    updateRule: (id: string, data: Record<string, unknown>) =>
      apiRequest<ApiResult<unknown>>('PATCH', `/auto-reply/rules/${id}`, data),
    deleteRule: (id: string) =>
      apiRequest<void>('DELETE', `/auto-reply/rules/${id}`),
    listQueue: (status?: string) => {
      const qs = status ? `?status=${status}` : '';
      return apiRequest<ApiResult<unknown>>('GET', `/auto-reply/queue${qs}`);
    },
    skipQueueItem: (id: string) =>
      apiRequest<ApiResult<unknown>>('POST', `/auto-reply/queue/${id}/skip`),
  },

  // Auth
  auth: {
    renewWatches: () =>
      apiRequest<ApiResult<{ renewed: number; failed: number }>>('POST', '/auth/renew-watches'),
    myEmails: () =>
      apiRequest<ApiResult<{ emails: string[] }>>('GET', '/auth/my-emails'),
    getOwnedEmails: () =>
      apiRequest<ApiResult<{ owned_emails: string[] }>>('GET', '/auth/owned-emails'),
    saveOwnedEmails: (owned_emails: string[]) =>
      apiRequest<ApiResult<{ owned_emails: string[] }>>('PATCH', '/auth/owned-emails', { owned_emails }),
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
