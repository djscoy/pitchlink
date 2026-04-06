/**
 * Contact Discovery Service
 *
 * Find NEW contacts via external providers:
 * - Hunter.io Domain Search: find emails by domain
 * - Apollo.io People Search: find people by company, title, industry
 *
 * Results returned as prospect cards for one-click "Add to Campaign".
 */

export interface DiscoveryProspect {
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  job_title?: string;
  company_name?: string;
  company_domain?: string;
  linkedin_url?: string;
  confidence?: number;
  source: string; // provider name
}

export interface DomainSearchResult {
  prospects: DiscoveryProspect[];
  total: number;
  domain: string;
  organization?: string;
}

export interface PeopleSearchResult {
  prospects: DiscoveryProspect[];
  total: number;
}

// --- Hunter.io Domain Search ---

async function hunterDomainSearch(
  domain: string,
  limit: number = 10,
  offset: number = 0,
): Promise<DomainSearchResult | null> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}&limit=${limit}&offset=${offset}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[Discovery:Hunter] API error ${response.status} for ${domain}`);
      return null;
    }

    const json = await response.json();
    const data = json.data;
    if (!data) return null;

    const prospects: DiscoveryProspect[] = (data.emails || []).map(
      (e: {
        value: string;
        first_name?: string;
        last_name?: string;
        position?: string;
        linkedin?: string;
        confidence?: number;
      }) => ({
        email: e.value,
        first_name: e.first_name || undefined,
        last_name: e.last_name || undefined,
        full_name: [e.first_name, e.last_name].filter(Boolean).join(' ') || undefined,
        job_title: e.position || undefined,
        company_name: data.organization || undefined,
        company_domain: domain,
        linkedin_url: e.linkedin || undefined,
        confidence: e.confidence || undefined,
        source: 'hunter',
      }),
    );

    return {
      prospects,
      total: data.total || prospects.length,
      domain,
      organization: data.organization || undefined,
    };
  } catch (err) {
    console.error('[Discovery:Hunter] Domain search error:', err);
    return null;
  }
}

// --- Apollo.io People Search ---

async function apolloPeopleSearch(params: {
  q_organization_domains?: string[];
  person_titles?: string[];
  person_seniorities?: string[];
  q_keywords?: string;
  limit?: number;
  page?: number;
}): Promise<PeopleSearchResult | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  try {
    const body: Record<string, unknown> = {
      per_page: params.limit || 10,
      page: params.page || 1,
    };

    if (params.q_organization_domains?.length) {
      body.q_organization_domains = params.q_organization_domains.join('\n');
    }
    if (params.person_titles?.length) {
      body.person_titles = params.person_titles;
    }
    if (params.person_seniorities?.length) {
      body.person_seniorities = params.person_seniorities;
    }
    if (params.q_keywords) {
      body.q_keywords = params.q_keywords;
    }

    const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn(`[Discovery:Apollo] API error ${response.status}`);
      return null;
    }

    const json = await response.json();
    const people = json.people || [];

    const prospects: DiscoveryProspect[] = people
      .filter((p: { email?: string }) => p.email)
      .map(
        (p: {
          email: string;
          first_name?: string;
          last_name?: string;
          name?: string;
          title?: string;
          linkedin_url?: string;
          organization?: { name?: string; primary_domain?: string };
        }) => ({
          email: p.email,
          first_name: p.first_name || undefined,
          last_name: p.last_name || undefined,
          full_name: p.name || undefined,
          job_title: p.title || undefined,
          company_name: p.organization?.name || undefined,
          company_domain: p.organization?.primary_domain || undefined,
          linkedin_url: p.linkedin_url || undefined,
          source: 'apollo',
        }),
      );

    return {
      prospects,
      total: json.pagination?.total_entries || prospects.length,
    };
  } catch (err) {
    console.error('[Discovery:Apollo] People search error:', err);
    return null;
  }
}

// --- Vibe (Explorium) Discovery ---

async function vibeDiscoverByDomain(
  domain: string,
  limit: number = 10,
): Promise<DomainSearchResult | null> {
  const apiKey = process.env.EXPLORIUM_API_KEY;
  if (!apiKey) return null;

  try {
    // First match the business
    const matchRes = await fetch('https://api.explorium.ai/v1/businesses/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ businesses: [{ domain }] }),
    });

    if (!matchRes.ok) return null;
    const matchJson = await matchRes.json();
    const businessId = matchJson.data?.[0]?.business_id;
    const businessName = matchJson.data?.[0]?.name;

    if (!businessId) return null;

    // Fetch prospects at this business
    const fetchRes = await fetch('https://api.explorium.ai/v1/prospects/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        filters: { business_id: { values: [businessId] }, has_email: true },
        limit,
      }),
    });

    if (!fetchRes.ok) return null;
    const fetchJson = await fetchRes.json();
    const prospects: DiscoveryProspect[] = (fetchJson.data || []).map(
      (p: {
        email?: string;
        first_name?: string;
        last_name?: string;
        full_name?: string;
        job_title?: string;
        company_name?: string;
        linkedin_url?: string;
      }) => ({
        email: p.email || '',
        first_name: p.first_name || undefined,
        last_name: p.last_name || undefined,
        full_name: p.full_name || undefined,
        job_title: p.job_title || undefined,
        company_name: p.company_name || businessName || undefined,
        company_domain: domain,
        linkedin_url: p.linkedin_url || undefined,
        source: 'vibe',
      }),
    ).filter((p: DiscoveryProspect) => p.email);

    return {
      prospects,
      total: fetchJson.total || prospects.length,
      domain,
      organization: businessName || undefined,
    };
  } catch (err) {
    console.error('[Discovery:Vibe] Error:', err);
    return null;
  }
}

// --- Discovery Service ---

export const discoveryService = {
  /**
   * Get available discovery providers.
   */
  getAvailableProviders(): string[] {
    const available: string[] = [];
    if (process.env.EXPLORIUM_API_KEY) available.push('vibe');
    if (process.env.HUNTER_API_KEY) available.push('hunter');
    if (process.env.APOLLO_API_KEY) available.push('apollo');
    return available;
  },

  /**
   * Search by domain — find emails associated with a website.
   */
  async searchByDomain(
    domain: string,
    options?: { limit?: number; offset?: number },
  ): Promise<DomainSearchResult> {
    // Try Vibe (Explorium) first — primary provider
    const vibeResult = await vibeDiscoverByDomain(domain, options?.limit || 10);
    if (vibeResult && vibeResult.prospects.length > 0) return vibeResult;

    // Fallback: Hunter
    const hunterResult = await hunterDomainSearch(
      domain,
      options?.limit || 10,
      options?.offset || 0,
    );

    if (hunterResult) return hunterResult;

    // Fallback: Apollo domain search
    const apolloResult = await apolloPeopleSearch({
      q_organization_domains: [domain],
      limit: options?.limit || 10,
    });

    if (apolloResult) {
      return {
        prospects: apolloResult.prospects,
        total: apolloResult.total,
        domain,
      };
    }

    return { prospects: [], total: 0, domain };
  },

  /**
   * Search by role/title at a company — find decision-makers.
   */
  async searchByRole(params: {
    company_domain?: string;
    titles?: string[];
    seniorities?: string[];
    keywords?: string;
    limit?: number;
    page?: number;
  }): Promise<PeopleSearchResult> {
    const apolloResult = await apolloPeopleSearch({
      q_organization_domains: params.company_domain ? [params.company_domain] : undefined,
      person_titles: params.titles,
      person_seniorities: params.seniorities,
      q_keywords: params.keywords,
      limit: params.limit || 10,
      page: params.page || 1,
    });

    if (apolloResult) return apolloResult;

    // Fallback: if only domain specified, try Hunter
    if (params.company_domain) {
      const hunterResult = await hunterDomainSearch(params.company_domain, params.limit || 10);
      if (hunterResult) {
        // Filter by title keywords if specified
        let prospects = hunterResult.prospects;
        if (params.titles?.length) {
          const titleLower = params.titles.map((t) => t.toLowerCase());
          prospects = prospects.filter(
            (p) => p.job_title && titleLower.some((t) => p.job_title!.toLowerCase().includes(t)),
          );
        }
        return { prospects, total: prospects.length };
      }
    }

    return { prospects: [], total: 0 };
  },
};
