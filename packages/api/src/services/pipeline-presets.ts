import { supabaseAdmin } from '../db/supabase';
import type { PipelinePreset, PipelineStage, TransactionMode } from '@pitchlink/shared';

export interface CreatePresetInput {
  name: string;
  mode: TransactionMode;
  stages_json: PipelineStage[];
}

export const pipelinePresetsService = {
  /**
   * List all presets available to a workspace:
   * - System defaults (workspace_id IS NULL)
   * - Workspace-specific custom presets
   */
  async list(workspaceId: string, mode?: TransactionMode) {
    let query = supabaseAdmin
      .from('pipeline_presets')
      .select('*')
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .order('is_default', { ascending: false })
      .order('name');

    if (mode) {
      query = query.eq('mode', mode);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as PipelinePreset[];
  },

  async getById(presetId: string) {
    const { data, error } = await supabaseAdmin
      .from('pipeline_presets')
      .select('*')
      .eq('id', presetId)
      .single();

    if (error) throw error;
    return data as PipelinePreset;
  },

  async create(workspaceId: string, input: CreatePresetInput) {
    // Ensure stages have sequential positions
    const stages = input.stages_json.map((stage, i) => ({
      ...stage,
      position: i,
    }));

    const { data, error } = await supabaseAdmin
      .from('pipeline_presets')
      .insert({
        workspace_id: workspaceId,
        name: input.name,
        mode: input.mode,
        stages_json: stages,
        is_default: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data as PipelinePreset;
  },

  async update(workspaceId: string, presetId: string, input: Partial<CreatePresetInput>) {
    // Can only update workspace-specific presets (not system defaults)
    const { data, error } = await supabaseAdmin
      .from('pipeline_presets')
      .update({
        ...(input.name && { name: input.name }),
        ...(input.mode && { mode: input.mode }),
        ...(input.stages_json && {
          stages_json: input.stages_json.map((s, i) => ({ ...s, position: i })),
        }),
      })
      .eq('workspace_id', workspaceId)
      .eq('id', presetId)
      .select()
      .single();

    if (error) throw error;
    return data as PipelinePreset;
  },

  async delete(workspaceId: string, presetId: string) {
    // Can only delete workspace-specific presets
    const { error } = await supabaseAdmin
      .from('pipeline_presets')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', presetId);

    if (error) throw error;
  },
};
