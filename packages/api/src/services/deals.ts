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
        contact:contacts(id, email, name, domain, tags, enrichment_status)
      `)
      .eq('workspace_id', workspaceId)
      .eq('campaign_id', campaignId)
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

  async delete(workspaceId: string, dealId: string) {
    const { error } = await supabaseAdmin
      .from('deals')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', dealId);

    if (error) throw error;
  },
};
