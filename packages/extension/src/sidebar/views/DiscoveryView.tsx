import { useState, useCallback } from 'react';
import type { TransactionMode } from '@pitchlink/shared';
import { useModeColors } from '../hooks/useModeColors';
import { api } from '../../utils/api';

interface DiscoveryViewProps {
  mode: TransactionMode;
}

interface Prospect {
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
}

type SearchMode = 'domain' | 'people';

export function DiscoveryView({ mode }: DiscoveryViewProps) {
  const modeColors = useModeColors(mode);

  // Search state
  const [searchMode, setSearchMode] = useState<SearchMode>('domain');
  const [domainQuery, setDomainQuery] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [titles, setTitles] = useState('');
  const [keywords, setKeywords] = useState('');

  // Results state
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [organization, setOrganization] = useState<string | undefined>();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Add to campaign state
  const [addingEmail, setAddingEmail] = useState<string | null>(null);
  const [addedEmails, setAddedEmails] = useState<Set<string>>(new Set());
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [showCampaignPicker, setShowCampaignPicker] = useState<string | null>(null);

  // Track which mode campaigns were loaded for
  const [campaignsMode, setCampaignsMode] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    if (campaigns.length > 0 && campaignsMode === mode) return;
    try {
      const result = await api.campaigns.list({ mode, status: 'active' }) as {
        data: { campaigns: { id: string; name: string }[] };
      };
      setCampaigns(result.data?.campaigns || []);
      setCampaignsMode(mode);
    } catch {
      // Silent fail
    }
  }, [mode, campaigns.length, campaignsMode]);

  const handleDomainSearch = async () => {
    if (!domainQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const result = await api.discovery.searchByDomain(domainQuery.trim()) as {
        data: { prospects: Prospect[]; total: number; domain: string; organization?: string };
      };
      setProspects(result.data.prospects);
      setTotal(result.data.total);
      setOrganization(result.data.organization);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setProspects([]);
    } finally {
      setSearching(false);
    }
  };

  const handlePeopleSearch = async () => {
    if (!companyDomain.trim() && !titles.trim() && !keywords.trim()) return;
    setSearching(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const result = await api.discovery.searchByRole({
        company_domain: companyDomain.trim() || undefined,
        titles: titles.trim() ? titles.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        keywords: keywords.trim() || undefined,
      }) as { data: { prospects: Prospect[]; total: number } };
      setProspects(result.data.prospects);
      setTotal(result.data.total);
      setOrganization(undefined);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setProspects([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAddToContact = async (prospect: Prospect) => {
    setAddingEmail(prospect.email);
    try {
      await api.contacts.create({
        email: prospect.email,
        name: prospect.full_name || [prospect.first_name, prospect.last_name].filter(Boolean).join(' ') || undefined,
        domain: prospect.company_domain || undefined,
      });
      setAddedEmails((prev) => new Set(prev).add(prospect.email));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // If already exists, mark as added
      if (msg.includes('already exists')) {
        setAddedEmails((prev) => new Set(prev).add(prospect.email));
      }
    } finally {
      setAddingEmail(null);
    }
  };

  const handleAddToCampaign = async (prospect: Prospect) => {
    if (!selectedCampaignId) return;
    setAddingEmail(prospect.email);
    try {
      // First create the contact
      let contactId: string;
      try {
        const createResult = await api.contacts.create({
          email: prospect.email,
          name: prospect.full_name || [prospect.first_name, prospect.last_name].filter(Boolean).join(' ') || undefined,
          domain: prospect.company_domain || undefined,
        }) as { data: { id: string } };
        contactId = createResult.data.id;
      } catch (err) {
        // If contact already exists, look it up
        const lookupResult = await api.contacts.lookup(prospect.email) as { data: { id: string } | null };
        if (!lookupResult.data) throw err;
        contactId = lookupResult.data.id;
      }

      // Get the campaign's pipeline preset to find the first stage
      const campaignResult = await api.campaigns.get(selectedCampaignId) as {
        data: { pipeline_preset_id: string };
      };
      const presetResult = await api.presets.get(campaignResult.data.pipeline_preset_id) as {
        data: { stages_json: { id: string }[] };
      };
      const firstStage = presetResult.data.stages_json[0]?.id || '';

      // Create the deal
      await api.deals.create({
        contact_id: contactId,
        campaign_id: selectedCampaignId,
        mode,
        initial_stage: firstStage,
      });

      setAddedEmails((prev) => new Set(prev).add(prospect.email));
      setShowCampaignPicker(null);
    } catch (err) {
      console.error('[Discovery] Add to campaign failed:', err);
    } finally {
      setAddingEmail(null);
    }
  };

  return (
    <div>
      {/* Search Mode Toggle */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        <button
          onClick={() => setSearchMode('domain')}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: '11px',
            fontWeight: searchMode === 'domain' ? 600 : 400,
            border: 'none',
            borderBottom: searchMode === 'domain' ? `2px solid ${modeColors.color}` : '2px solid transparent',
            backgroundColor: 'transparent',
            color: searchMode === 'domain' ? 'var(--pl-text-primary)' : 'var(--pl-text-secondary)',
            cursor: 'pointer',
          }}
        >
          By Domain
        </button>
        <button
          onClick={() => setSearchMode('people')}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: '11px',
            fontWeight: searchMode === 'people' ? 600 : 400,
            border: 'none',
            borderBottom: searchMode === 'people' ? `2px solid ${modeColors.color}` : '2px solid transparent',
            backgroundColor: 'transparent',
            color: searchMode === 'people' ? 'var(--pl-text-primary)' : 'var(--pl-text-secondary)',
            cursor: 'pointer',
          }}
        >
          By Role
        </button>
      </div>

      {/* Domain Search Form */}
      {searchMode === 'domain' && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              value={domainQuery}
              onChange={(e) => setDomainQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDomainSearch()}
              placeholder="example.com"
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: '12px',
                border: '1px solid var(--pl-border-secondary)',
                borderRadius: '4px',
                backgroundColor: 'var(--pl-bg-primary)',
                color: 'var(--pl-text-primary)',
              }}
            />
            <button
              onClick={handleDomainSearch}
              disabled={searching || !domainQuery.trim()}
              style={{
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                backgroundColor: !searching && domainQuery.trim() ? modeColors.color : 'var(--pl-bg-tertiary)',
                color: !searching && domainQuery.trim() ? 'var(--pl-text-inverse)' : 'var(--pl-text-tertiary)',
                cursor: !searching && domainQuery.trim() ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
              }}
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>
      )}

      {/* People Search Form */}
      {searchMode === 'people' && (
        <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <input
            value={companyDomain}
            onChange={(e) => setCompanyDomain(e.target.value)}
            placeholder="Company domain (e.g. stripe.com)"
            style={{
              padding: '6px 8px',
              fontSize: '12px',
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-bg-primary)',
              color: 'var(--pl-text-primary)',
            }}
          />
          <input
            value={titles}
            onChange={(e) => setTitles(e.target.value)}
            placeholder="Titles (comma-separated, e.g. CEO, CTO)"
            style={{
              padding: '6px 8px',
              fontSize: '12px',
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-bg-primary)',
              color: 'var(--pl-text-primary)',
            }}
          />
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePeopleSearch()}
            placeholder="Keywords (e.g. marketing)"
            style={{
              padding: '6px 8px',
              fontSize: '12px',
              border: '1px solid var(--pl-border-secondary)',
              borderRadius: '4px',
              backgroundColor: 'var(--pl-bg-primary)',
              color: 'var(--pl-text-primary)',
            }}
          />
          <button
            onClick={handlePeopleSearch}
            disabled={searching || (!companyDomain.trim() && !titles.trim() && !keywords.trim())}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              backgroundColor: !searching ? modeColors.color : 'var(--pl-bg-tertiary)',
              color: !searching ? 'var(--pl-text-inverse)' : 'var(--pl-text-tertiary)',
              cursor: !searching ? 'pointer' : 'default',
            }}
          >
            {searching ? 'Searching...' : 'Find People'}
          </button>
        </div>
      )}

      {/* Error */}
      {searchError && (
        <div style={{ fontSize: '11px', color: 'var(--pl-error)', marginBottom: '8px' }}>
          {searchError}
        </div>
      )}

      {/* Results Header */}
      {hasSearched && !searching && (
        <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', marginBottom: '8px' }}>
          {organization && <span style={{ fontWeight: 600, color: 'var(--pl-text-secondary)' }}>{organization} &middot; </span>}
          {total} result{total !== 1 ? 's' : ''} found
        </div>
      )}

      {/* Prospect Cards */}
      {prospects.map((prospect) => {
        const isAdded = addedEmails.has(prospect.email);
        const isAdding = addingEmail === prospect.email;
        const isPickingCampaign = showCampaignPicker === prospect.email;

        return (
          <div
            key={prospect.email}
            className="pl-card"
            style={{
              padding: '8px 10px',
              marginBottom: '4px',
              opacity: isAdded ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {prospect.full_name || prospect.email}
                </div>
                {prospect.full_name && (
                  <div style={{ fontSize: '11px', color: 'var(--pl-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {prospect.email}
                  </div>
                )}
                {prospect.job_title && (
                  <div style={{ fontSize: '11px', color: 'var(--pl-text-tertiary)', marginTop: '1px' }}>
                    {prospect.job_title}
                    {prospect.company_name ? ` at ${prospect.company_name}` : ''}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', marginTop: '3px', alignItems: 'center' }}>
                  {prospect.confidence && (
                    <span style={{ fontSize: '10px', color: prospect.confidence >= 80 ? 'var(--pl-success)' : 'var(--pl-text-tertiary)' }}>
                      {prospect.confidence}% conf.
                    </span>
                  )}
                  {prospect.linkedin_url && (
                    <a
                      href={prospect.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '10px', color: 'var(--pl-info)', textDecoration: 'none' }}
                    >
                      LinkedIn
                    </a>
                  )}
                  <span style={{ fontSize: '10px', color: 'var(--pl-text-tertiary)' }}>
                    via {prospect.source}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginLeft: '8px', flexShrink: 0 }}>
                {isAdded ? (
                  <span style={{ fontSize: '10px', color: 'var(--pl-success)', fontWeight: 600 }}>Added</span>
                ) : (
                  <>
                    <button
                      onClick={() => handleAddToContact(prospect)}
                      disabled={isAdding}
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontWeight: 600,
                        border: '1px solid var(--pl-border-secondary)',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        color: 'var(--pl-text-secondary)',
                        cursor: isAdding ? 'default' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isAdding ? '...' : '+ Contact'}
                    </button>
                    <button
                      onClick={() => {
                        loadCampaigns();
                        setSelectedCampaignId('');
                        setShowCampaignPicker(isPickingCampaign ? null : prospect.email);
                      }}
                      disabled={isAdding}
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontWeight: 600,
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: isPickingCampaign ? modeColors.color : 'transparent',
                        color: isPickingCampaign ? 'var(--pl-text-inverse)' : modeColors.color,
                        cursor: isAdding ? 'default' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      + Campaign
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Campaign Picker */}
            {isPickingCampaign && (
              <div style={{ marginTop: '6px', padding: '6px 0', borderTop: '1px solid var(--pl-border-primary)' }}>
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: '11px',
                    borderRadius: '4px',
                    border: '1px solid var(--pl-border-secondary)',
                    backgroundColor: 'var(--pl-bg-primary)',
                    color: 'var(--pl-text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  <option value="">Select campaign...</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowCampaignPicker(null)}
                    style={{
                      padding: '3px 8px',
                      fontSize: '10px',
                      border: '1px solid var(--pl-border-secondary)',
                      borderRadius: '4px',
                      backgroundColor: 'transparent',
                      color: 'var(--pl-text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAddToCampaign(prospect)}
                    disabled={!selectedCampaignId || isAdding}
                    style={{
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: 600,
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: selectedCampaignId ? modeColors.color : 'var(--pl-bg-tertiary)',
                      color: selectedCampaignId ? 'var(--pl-text-inverse)' : 'var(--pl-text-tertiary)',
                      cursor: selectedCampaignId ? 'pointer' : 'default',
                    }}
                  >
                    {isAdding ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {hasSearched && !searching && prospects.length === 0 && !searchError && (
        <div style={{
          textAlign: 'center',
          padding: '20px 12px',
          color: 'var(--pl-text-tertiary)',
          fontSize: '12px',
        }}>
          No prospects found. Try a different search.
        </div>
      )}

      {/* Initial state */}
      {!hasSearched && (
        <div style={{
          textAlign: 'center',
          padding: '20px 12px',
          color: 'var(--pl-text-tertiary)',
          fontSize: '12px',
        }}>
          Search for new contacts by domain or role to add them to your pipeline.
        </div>
      )}
    </div>
  );
}
