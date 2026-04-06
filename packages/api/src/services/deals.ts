import { supabaseAdmin } from '../db/supabase';
import type { Deal, DealActivityType } from '@pitchlink/shared';

export interface CreateDealInput {
  contact_id: string;
  campaign_id: string;
  mode: 'buy' | 'sell' | 'exchange';
  initial_stage: string;
}

export const dealsService = {
  async listByCampaign(workspaceId: string, campaignId: string) {
    const { data, error } = await supabaseAdmin
      .from('deals')
      .select(`
        *,
        contact:contacts(id, email, name, domain, tags, enrichment_status),
        activities:deal_activities(created_at, type)
      `)
      .eq('workspace_id', workspaceId)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Compute last_reply_at from activities
    return (data || []).map((deal: any) => {
      const replyActivities = (deal.activities || [])
        .filter((a: any) => a.type === 'email_received')
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return {
        ...deal,
        last_reply_at: replyActivities.length > 0 ? replyActivities[0].created_at : null,
        activities: undefined, // Don't send raw activities to client
      };
    });
  },

  async listByContact(workspaceId: string, contactId: string) {
    const { data, error } = await supabaseAdmin
      .from('deals')
      .select(`
        *,
        campaign:campaigns(id, name, mode, status, pipeline_preset:pipeline_presets(*))
      `)
      .eq('workspace_id', workspaceId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async getById(workspaceId: string, dealId: string) {
    const { data, error } = await supabaseAdmin
      .from('deals')
      .select(`
        *,
        contact:contacts(*),
        campaign:campaigns(*, pipeline_preset:pipeline_presets(*))
      `)
      .eq('workspace_id', workspaceId)
      .eq('id', dealId)
      .single();

    if (error) throw error;
    return data;
  },

  async create(workspaceId: string, input: CreateDealInput) {
    const { data, error } = await supabaseAdmin
      .from('deals')
      .insert({
        workspace_id: workspaceId,
        contact_id: input.contact_id,
        campaign_id: input.campaign_id,
        mode: input.mode,
        current_stage: input.initial_stage,
        metadata: {},
      })
      .select(`
        *,
        contact:contacts(id, email, name, domain)
      `)
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('This contact is already in this campaign');
      }
      throw error;
    }

    // Log activity
    await this.logActivity(data.id, 'stage_changed', {
      from: null,
      to: input.initial_stage,
      reason: 'deal_created',
    });

    return data as Deal;
  },

  async changeStage(workspaceId: string, dealId: string, newStage: string) {
    // Get current deal
    const { data: current, error: fetchError } = await supabaseAdmin
      .from('deals')
      .select('current_stage')
      .eq('workspace_id', workspaceId)
      .eq('id', dealId)
      .single();

    if (fetchError) throw fetchError;

    const oldStage = current.current_stage;
    if (oldStage === newStage) return current;

    // Update stage
    const { data, error } = await supabaseAdmin
      .from('deals')
      .update({ current_stage: newStage })
      .eq('workspace_id', workspaceId)
      .eq('id', dealId)
      .select(`
        *,
        contact:contacts(id, email, name, domain)
      `)
      .single();

    if (error) throw error;

    // Log activity
    await this.logActivity(dealId, 'stage_changed', {
      from: oldStage,
      to: newStage,
    });

    return data;
  },

  async logActivity(dealId: string, type: DealActivityType, data: Record<string, unknown>) {
    const { error } = await supabaseAdmin.from('deal_activities').insert({
      deal_id: dealId,
      type,
      data,
    });

    if (error) {
      console.error('[Deals] Failed to log activity:', error);
    }
  },

  async getActivities(dealId: string, limit = 50) {
    const { data, error } = await supabaseAdmin
      .from('deal_activities')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  async bulkCreate(
    workspaceId: string,
    input: {
      contact_ids: string[];
      campaign_id: string;
      mode: 'buy' | 'sell' | 'exchange';
      initial_stage: string;
    },
  ): Promise<{ created: number; skipped: number }> {
    const rows = input.contact_ids.map((contact_id) => ({
      workspace_id: workspaceId,
      contact_id,
      campaign_id: input.campaign_id,
      mode: input.mode,
      current_stage: input.initial_stage,
      metadata: {},
    }));

    let totalCreated = 0;
    const CHUNK_SIZE = 500;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabaseAdmin
        .from('deals')
        .upsert(chunk, {
          onConflict: 'contact_id,campaign_id',
          ignoreDuplicates: true,
        })
        .select('id');

      if (error) throw error;
      totalCreated += (data || []).length;
    }

    // Batch-insert activities for created deals
    if (totalCreated > 0) {
      // Re-query to get IDs of deals we just created (within last few seconds)
      const { data: newDeals } = await supabaseAdmin
        .from('deals')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('campaign_id', input.campaign_id)
        .eq('current_stage', input.initial_stage)
        .order('created_at', { ascending: false })
        .limit(totalCreated);

      if (newDeals && newDeals.length > 0) {
        const activities = newDeals.map((deal) => ({
          deal_id: deal.id,
          type: 'stage_changed' as const,
          data: { from: null, to: input.initial_stage, reason: 'bulk_assign' },
        }));

        // Chunk activities too
        for (let i = 0; i < activities.length; i += CHUNK_SIZE) {
          await supabaseAdmin
            .from('deal_activities')
            .insert(activities.slice(i, i + CHUNK_SIZE));
        }
      }
    }

    return {
      created: totalCreated,
      skipped: input.contact_ids.length - totalCreated,
    };
  },

  async getGlobalActivities(
    workspaceId: string,
    params: { mode?: string; limit?: number; offset?: number },
  ) {
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    // Use RPC-style query to avoid Supabase deep type instantiation with nested joins
    const baseQuery = supabaseAdmin
      .from('deal_activities')
      .select(`
        id, type, data, created_at,
        deal:deals!inner(
          id, mode, current_stage,
          contact:contacts(id, email, name, domain),
          campaign:campaigns(id, name)
        )
      ` as '*', { count: 'exact' }) as any;

    let query = baseQuery
      .eq('deal.workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.mode) {
      query = query.eq('deal.mode', params.mode);
    }

    const { data, error, count }: { data: any[]; error: any; count: number | null } = await query;

    if (error) throw error;
    return { activities: data || [], total: count || 0 };
  },

  async delete(workspaceId: string, dealId: string) {
    const { error } = await supabaseAdmin
      .from('deals')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', dealId);

    if (error) throw error;
  },
};
