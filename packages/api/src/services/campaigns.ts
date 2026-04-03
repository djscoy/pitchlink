import { supabaseAdmin } from '../db/supabase';
import type { PipelineStage } from '@pitchlink/shared';

export interface CreateCampaignInput {
  name: string;
  mode: 'buy' | 'sell' | 'exchange';
  pipeline_preset_id: string;
  client_id?: string;
}

export interface UpdateCampaignInput {
  name?: string;
  status?: 'active' | 'paused' | 'archived' | 'completed';
  client_id?: string;
}

export const campaignsService = {
  async list(workspaceId: string, options?: { mode?: string; status?: string }) {
    let query = supabaseAdmin
      .from('campaigns')
      .select('*, pipeline_preset:pipeline_presets(*)', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (options?.mode) {
      query = query.eq('mode', options.mode);
    }
    if (options?.status) {
      query = query.eq('status', options.status);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { campaigns: data, total: count || 0 };
  },

  async getById(workspaceId: string, campaignId: string) {
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .select('*, pipeline_preset:pipeline_presets(*)')
      .eq('workspace_id', workspaceId)
      .eq('id', campaignId)
      .single();

    if (error) throw error;
    return data;
  },

  async create(workspaceId: string, input: CreateCampaignInput) {
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        workspace_id: workspaceId,
        name: input.name,
        mode: input.mode,
        pipeline_preset_id: input.pipeline_preset_id,
        client_id: input.client_id || null,
        status: 'active',
      })
      .select('*, pipeline_preset:pipeline_presets(*)')
      .single();

    if (error) throw error;
    return data;
  },

  async update(workspaceId: string, campaignId: string, input: UpdateCampaignInput) {
    const { data, error } = await supabaseAdmin
      .from('campaigns')
      .update(input)
      .eq('workspace_id', workspaceId)
      .eq('id', campaignId)
      .select('*, pipeline_preset:pipeline_presets(*)')
      .single();

    if (error) throw error;
    return data;
  },

  async delete(workspaceId: string, campaignId: string) {
    const { error } = await supabaseAdmin
      .from('campaigns')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', campaignId);

    if (error) throw error;
  },

  /**
   * Get campaign stats: count of deals per stage
   */
  async getStats(workspaceId: string, campaignId: string) {
    // Get the campaign with its pipeline preset
    const campaign = await this.getById(workspaceId, campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const stages = (campaign.pipeline_preset?.stages_json || []) as PipelineStage[];

    // Get deal counts per stage
    const { data: deals, error } = await supabaseAdmin
      .from('deals')
      .select('current_stage')
      .eq('workspace_id', workspaceId)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    const stageCounts: Record<string, number> = {};
    for (const stage of stages) {
      stageCounts[stage.id] = 0;
    }
    for (const deal of deals || []) {
      if (stageCounts[deal.current_stage] !== undefined) {
        stageCounts[deal.current_stage]++;
      }
    }

    return {
      campaign,
      total_deals: deals?.length || 0,
      stages: stages.map((stage) => ({
        ...stage,
        count: stageCounts[stage.id] || 0,
      })),
    };
  },
};
