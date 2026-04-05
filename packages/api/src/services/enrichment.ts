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

// --- Provider Registry ---

const providers: EnrichmentProvider[] = [hunterProvider];

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
