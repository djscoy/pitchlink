/**
 * Contact Enrichment Service
 *
 * Pluggable provider architecture. Each provider implements EnrichmentProvider.
 * Results are cached in the contact_enrichment table with a 30-day TTL.
 * Updates the contact's enrichment_status field after enrichment.
 */

import { supabaseAdmin } from '../db/supabase';
import type { ContactEnrichment } from '@pitchlink/shared';

// --- Provider Interface ---

export interface EnrichmentResult {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  company_name?: string;
  linkedin_url?: string;
  twitter_handle?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  company_domain?: string;
  company_industry?: string;
  company_size?: string;
  // SEO-specific
  domain_rating?: number;
  monthly_traffic?: number;
  spam_score?: number;
  // Raw data for display
  [key: string]: unknown;
}

export interface EnrichmentProvider {
  name: string;
  isConfigured(): boolean;
  enrich(email: string, domain?: string): Promise<EnrichmentResult | null>;
}

// --- Hunter.io Provider ---

const hunterProvider: EnrichmentProvider = {
  name: 'hunter',

  isConfigured() {
    return !!process.env.HUNTER_API_KEY;
  },

  async enrich(email: string): Promise<EnrichmentResult | null> {
    const apiKey = process.env.HUNTER_API_KEY;
    if (!apiKey) return null;

    try {
      // Hunter's email-verifier endpoint gives us person data
      const verifyUrl = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${apiKey}`;

      const response = await fetch(verifyUrl);
      if (!response.ok) {
        console.warn(`[Enrichment:Hunter] API error ${response.status} for ${email}`);
        return null;
      }

      const json = await response.json();
      const data = json.data;
      if (!data) return null;

      // Hunter verifier returns: status, result, score, email, regexp, gibberish, disposable, webmail, mx_records, smtp_server, smtp_check, accept_all, block, sources
      // For person data, we need the domain search endpoint
      const domain = email.split('@')[1];
      let personData: EnrichmentResult = {};

      // Try domain search to find the person's details
      if (domain) {
        try {
          const domainUrl = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}&limit=10`;
          const domainRes = await fetch(domainUrl);
          if (domainRes.ok) {
            const domainJson = await domainRes.json();
            const domainData = domainJson.data;

            // Find the matching email in domain results
            const match = (domainData?.emails || []).find(
              (e: { value: string }) => e.value?.toLowerCase() === email.toLowerCase(),
            );

            if (match) {
              personData = {
                first_name: match.first_name || undefined,
                last_name: match.last_name || undefined,
                full_name: [match.first_name, match.last_name].filter(Boolean).join(' ') || undefined,
                job_title: match.position || undefined,
                linkedin_url: match.linkedin || undefined,
                twitter_handle: match.twitter || undefined,
                phone: match.phone_number || undefined,
              };
            }

            // Company-level data
            if (domainData?.organization) {
              personData.company_name = domainData.organization;
            }
            if (domainData?.country) {
              personData.country = domainData.country;
            }
            if (domainData?.industry) {
              personData.company_industry = domainData.industry;
            }
          }
        } catch (err) {
          console.warn('[Enrichment:Hunter] Domain search error:', err);
        }
      }

      return {
        ...personData,
        email_status: data.status,
        email_score: data.score,
        is_webmail: data.webmail,
        is_disposable: data.disposable,
        mx_records: data.mx_records,
      };
    } catch (err) {
      console.error('[Enrichment:Hunter] Error:', err);
      return null;
    }
  },
};

// --- Apollo.io Provider ---

const apolloProvider: EnrichmentProvider = {
  name: 'apollo',

  isConfigured() {
    return !!process.env.APOLLO_API_KEY;
  },

  async enrich(email: string): Promise<EnrichmentResult | null> {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) return null;

    try {
      const response = await fetch('https://api.apollo.io/v1/people/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        console.warn(`[Enrichment:Apollo] API error ${response.status} for ${email}`);
        return null;
      }

      const json = await response.json();
      const person = json.person;
      if (!person) return null;

      const org = person.organization || {};

      return {
        first_name: person.first_name || undefined,
        last_name: person.last_name || undefined,
        full_name: person.name || undefined,
        job_title: person.title || undefined,
        linkedin_url: person.linkedin_url || undefined,
        twitter_handle: person.twitter_url || undefined,
        phone: person.phone_numbers?.[0]?.sanitized_number || undefined,
        city: person.city || undefined,
        state: person.state || undefined,
        country: person.country || undefined,
        company_name: org.name || undefined,
        company_domain: org.primary_domain || undefined,
        company_industry: org.industry || undefined,
        company_size: org.estimated_num_employees ? String(org.estimated_num_employees) : undefined,
        company_revenue: org.annual_revenue_printed || undefined,
        company_founded: org.founded_year ? String(org.founded_year) : undefined,
        company_linkedin: org.linkedin_url || undefined,
        seniority: person.seniority || undefined,
        departments: person.departments?.join(', ') || undefined,
      };
    } catch (err) {
      console.error('[Enrichment:Apollo] Error:', err);
      return null;
    }
  },
};

// --- DataForSEO Provider ---

const dataForSEOProvider: EnrichmentProvider = {
  name: 'dataforseo',

  isConfigured() {
    return !!process.env.DATAFORSEO_LOGIN && !!process.env.DATAFORSEO_PASSWORD;
  },

  async enrich(_email: string, domain?: string): Promise<EnrichmentResult | null> {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password || !domain) return null;

    try {
      const authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');

      // Backlinks summary for domain metrics
      const response = await fetch('https://api.dataforseo.com/v3/backlinks/summary/live', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify([{ target: domain, internal_list_limit: 0, include_subdomains: true }]),
      });

      if (!response.ok) {
        console.warn(`[Enrichment:DataForSEO] API error ${response.status} for ${domain}`);
        return null;
      }

      const json = await response.json();
      const result = json.tasks?.[0]?.result?.[0];
      if (!result) return null;

      return {
        domain_rating: result.rank !== undefined ? Math.min(100, Math.round(Math.log10(Math.max(1, result.rank)) * 15)) : undefined,
        backlinks: result.backlinks || undefined,
        referring_domains: result.referring_domains || undefined,
        spam_score: result.spam_score || undefined,
        broken_backlinks: result.broken_backlinks || undefined,
        referring_ips: result.referring_ips || undefined,
      };
    } catch (err) {
      console.error('[Enrichment:DataForSEO] Error:', err);
      return null;
    }
  },
};

// --- Vibe Prospecting (Explorium) Provider ---

const vibeProvider: EnrichmentProvider = {
  name: 'vibe',

  isConfigured() {
    return !!process.env.EXPLORIUM_API_KEY;
  },

  async enrich(email: string): Promise<EnrichmentResult | null> {
    const apiKey = process.env.EXPLORIUM_API_KEY;
    if (!apiKey) return null;

    try {
      // Step 1: Match prospect by email
      const matchRes = await fetch('https://api.explorium.ai/v1/prospects/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prospects: [{ email }],
        }),
      });

      if (!matchRes.ok) {
        console.warn(`[Enrichment:Vibe] Match API error ${matchRes.status} for ${email}`);
        return null;
      }

      const matchJson = await matchRes.json();
      const prospectId = matchJson.data?.[0]?.prospect_id;

      if (!prospectId) {
        console.log(`[Enrichment:Vibe] No match for ${email}`);
        return null;
      }

      // Step 2: Enrich the matched prospect (profile + contacts)
      const enrichRes = await fetch('https://api.explorium.ai/v1/prospects/enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prospect_ids: [prospectId],
          enrichments: ['profiles', 'contacts'],
        }),
      });

      if (!enrichRes.ok) {
        console.warn(`[Enrichment:Vibe] Enrich API error ${enrichRes.status}`);
        return null;
      }

      const enrichJson = await enrichRes.json();
      const prospect = enrichJson.data?.[0];

      if (!prospect) return null;

      return {
        full_name: prospect.full_name || undefined,
        first_name: prospect.first_name || undefined,
        last_name: prospect.last_name || undefined,
        job_title: prospect.job_title || undefined,
        company_name: prospect.company_name || undefined,
        company_domain: prospect.company_website || undefined,
        company_industry: prospect.industry || undefined,
        company_size: prospect.company_size || undefined,
        linkedin_url: prospect.linkedin_url || undefined,
        phone: prospect.phone || undefined,
        city: prospect.city || undefined,
        country: prospect.country || undefined,
        seniority: prospect.seniority || undefined,
        department: prospect.department || undefined,
        gender: prospect.gender || undefined,
        age_group: prospect.age_group || undefined,
        skills: prospect.skills || undefined,
        company_linkedin: prospect.company_linkedin || undefined,
        company_revenue: prospect.company_revenue || undefined,
      };
    } catch (err) {
      console.error('[Enrichment:Vibe] Error:', err);
      return null;
    }
  },
};

// --- Provider Registry ---
// Vibe (Explorium) is the primary provider — runs first, others fill gaps

const providers: EnrichmentProvider[] = [vibeProvider, hunterProvider, apolloProvider, dataForSEOProvider];

// --- Enrichment Service ---

export const enrichmentService = {
  /**
   * Get available (configured) providers.
   */
  getAvailableProviders(): string[] {
    return providers.filter((p) => p.isConfigured()).map((p) => p.name);
  },

  /**
   * Get cached enrichment data for a contact.
   */
  async getCached(contactId: string): Promise<ContactEnrichment[]> {
    const { data, error } = await supabaseAdmin
      .from('contact_enrichment')
      .select('*')
      .eq('contact_id', contactId)
      .gt('expires_at', new Date().toISOString());

    if (error) throw error;
    return (data || []) as ContactEnrichment[];
  },

  /**
   * Enrich a contact using all available providers.
   * Returns merged enrichment data. Caches results per provider.
   */
  async enrich(
    workspaceId: string,
    contactId: string,
  ): Promise<{ data: EnrichmentResult; providers_used: string[] }> {
    // Get the contact
    const { data: contact, error: contactError } = await supabaseAdmin
      .from('contacts')
      .select('email, domain')
      .eq('id', contactId)
      .eq('workspace_id', workspaceId)
      .single();

    if (contactError || !contact) {
      throw new Error('Contact not found');
    }

    const availableProviders = providers.filter((p) => p.isConfigured());

    if (availableProviders.length === 0) {
      throw new Error('No enrichment providers configured. Add API keys in settings.');
    }

    const merged: EnrichmentResult = {};
    const providersUsed: string[] = [];

    for (const provider of availableProviders) {
      try {
        // Check cache first
        const { data: cached } = await supabaseAdmin
          .from('contact_enrichment')
          .select('data_json, expires_at')
          .eq('contact_id', contactId)
          .eq('provider', provider.name)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        let result: EnrichmentResult | null = null;

        if (cached) {
          result = cached.data_json as EnrichmentResult;
          console.log(`[Enrichment] Cache hit for ${contact.email} via ${provider.name}`);
        } else {
          result = await provider.enrich(contact.email, contact.domain);

          if (result) {
            // Cache the result (upsert)
            await supabaseAdmin
              .from('contact_enrichment')
              .upsert(
                {
                  contact_id: contactId,
                  provider: provider.name,
                  data_json: result,
                  fetched_at: new Date().toISOString(),
                  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                },
                { onConflict: 'contact_id,provider' },
              );
            console.log(`[Enrichment] Fetched + cached ${contact.email} via ${provider.name}`);
          }
        }

        if (result) {
          // Merge — first provider wins for each field
          for (const [key, value] of Object.entries(result)) {
            if (value !== undefined && value !== null && value !== '' && !(key in merged)) {
              merged[key] = value;
            }
          }
          providersUsed.push(provider.name);
        }
      } catch (err) {
        console.error(`[Enrichment] Provider ${provider.name} failed:`, err);
      }
    }

    // Update contact enrichment_status and name if found
    const hasData = Object.keys(merged).length > 0;
    const updateFields: Record<string, unknown> = {
      enrichment_status: hasData ? (providersUsed.length >= availableProviders.length ? 'full' : 'partial') : 'none',
      enriched_at: new Date().toISOString(),
    };

    // Auto-fill name if contact has no name and enrichment found one
    if (merged.full_name) {
      const { data: currentContact } = await supabaseAdmin
        .from('contacts')
        .select('name')
        .eq('id', contactId)
        .single();

      if (currentContact && (!currentContact.name || currentContact.name === '')) {
        updateFields.name = merged.full_name;
      }
    }

    await supabaseAdmin
      .from('contacts')
      .update(updateFields)
      .eq('id', contactId)
      .eq('workspace_id', workspaceId);

    return { data: merged, providers_used: providersUsed };
  },

  /**
   * Bulk enrich all contacts in a campaign.
   * Returns counts of enriched and failed contacts.
   */
  async bulkEnrich(
    workspaceId: string,
    campaignId: string,
  ): Promise<{ enriched: number; failed: number; total: number }> {
    // Get all contacts in this campaign via deals
    const { data: deals, error: dealsError } = await supabaseAdmin
      .from('deals')
      .select('contact_id')
      .eq('campaign_id', campaignId)
      .eq('workspace_id', workspaceId);

    if (dealsError) throw dealsError;
    if (!deals || deals.length === 0) return { enriched: 0, failed: 0, total: 0 };

    const contactIds = [...new Set(deals.map((d) => d.contact_id))];
    let enriched = 0;
    let failed = 0;

    for (const contactId of contactIds) {
      try {
        const result = await this.enrich(workspaceId, contactId);
        if (result.providers_used.length > 0) enriched++;
      } catch (err) {
        console.warn(`[Enrichment] Bulk enrich failed for contact ${contactId}:`, err);
        failed++;
      }
    }

    return { enriched, failed, total: contactIds.length };
  },

  /**
   * Get enrichment summary for display — merges all cached provider data.
   */
  async getSummary(contactId: string): Promise<EnrichmentResult> {
    const cached = await this.getCached(contactId);
    const merged: EnrichmentResult = {};

    for (const entry of cached) {
      const data = entry.data_json as EnrichmentResult;
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null && value !== '' && !(key in merged)) {
          merged[key] = value;
        }
      }
    }

    return merged;
  },
};
