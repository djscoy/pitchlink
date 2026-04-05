import { supabaseAdmin } from '../db/supabase';
import type { Contact } from '@pitchlink/shared';

export interface CreateContactInput {
  email: string;
  name?: string;
  domain?: string;
  tags?: string[];
  notes?: string;
  custom_fields?: Record<string, string>;
}

export interface UpdateContactInput {
  name?: string;
  domain?: string;
  tags?: string[];
  notes?: string;
  custom_fields?: Record<string, string>;
}

export const contactsService = {
  async list(workspaceId: string, options?: { campaignId?: string; search?: string; limit?: number; offset?: number }) {
    let query = supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (options?.search) {
      query = query.or(`email.ilike.%${options.search}%,name.ilike.%${options.search}%,domain.ilike.%${options.search}%`);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options?.limit || 50) - 1);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { contacts: data as Contact[], total: count || 0 };
  },

  async getById(workspaceId: string, contactId: string) {
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('id', contactId)
      .single();

    if (error) throw error;
    return data as Contact;
  },

  async getByEmail(workspaceId: string, email: string) {
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (error) throw error;
    return data as Contact | null;
  },

  async create(workspaceId: string, input: CreateContactInput) {
    const domain = input.domain || extractDomain(input.email);

    const { data, error } = await supabaseAdmin
      .from('contacts')
      .insert({
        workspace_id: workspaceId,
        email: input.email.toLowerCase(),
        name: input.name || '',
        domain,
        tags: input.tags || [],
        notes: input.notes || '',
        custom_fields: input.custom_fields || {},
        enrichment_status: 'none',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictError('Contact with this email already exists in your workspace');
      }
      throw error;
    }
    return data as Contact;
  },

  async update(workspaceId: string, contactId: string, input: UpdateContactInput) {
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .update(input)
      .eq('workspace_id', workspaceId)
      .eq('id', contactId)
      .select()
      .single();

    if (error) throw error;
    return data as Contact;
  },

  async delete(workspaceId: string, contactId: string) {
    const { error } = await supabaseAdmin
      .from('contacts')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', contactId);

    if (error) throw error;
  },

  /**
   * List contacts NOT assigned to a specific campaign
   */
  async listUnassigned(
    workspaceId: string,
    campaignId: string,
    options?: { search?: string; limit?: number; offset?: number },
  ) {
    // Get contact IDs already in this campaign
    const { data: assignedDeals, error: dealsError } = await supabaseAdmin
      .from('deals')
      .select('contact_id')
      .eq('workspace_id', workspaceId)
      .eq('campaign_id', campaignId);

    if (dealsError) throw dealsError;

    const assignedIds = (assignedDeals || []).map((d) => d.contact_id);

    let query = supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (assignedIds.length > 0) {
      query = query.not('id', 'in', `(${assignedIds.join(',')})`);
    }

    if (options?.search) {
      query = query.or(`email.ilike.%${options.search}%,name.ilike.%${options.search}%,domain.ilike.%${options.search}%`);
    }

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return { contacts: data as Contact[], total: count || 0 };
  },

  /**
   * Get contacts for a specific campaign (via deals table)
   */
  async listByCampaign(workspaceId: string, campaignId: string) {
    const { data, error } = await supabaseAdmin
      .from('deals')
      .select(`
        id,
        current_stage,
        mode,
        metadata,
        created_at,
        updated_at,
        contact:contacts(*)
      `)
      .eq('workspace_id', workspaceId)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Export contacts as CSV for a campaign
   */
  async exportCampaignCSV(workspaceId: string, campaignId: string): Promise<string> {
    const deals = await this.listByCampaign(workspaceId, campaignId);

    const headers = ['Name', 'Email', 'Domain', 'Stage', 'Tags', 'Notes', 'Added'];
    const rows = deals.map((deal) => {
      const contact = deal.contact as unknown as Contact;
      return [
        csvEscape(contact.name || ''),
        csvEscape(contact.email),
        csvEscape(contact.domain || ''),
        csvEscape(deal.current_stage),
        csvEscape((contact.tags || []).join('; ')),
        csvEscape(contact.notes || ''),
        csvEscape(new Date(deal.created_at).toISOString().split('T')[0]),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  },
};

// --- Helpers ---

function extractDomain(email: string): string {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export class ConflictError extends Error {
  code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
