/**
 * Sequences Service — CRUD for sequences + enrollment lifecycle.
 *
 * A sequence is a series of timed follow-up steps attached to a deal.
 * Steps fire on schedule. Enrollment auto-pauses when a reply is detected.
 */

import { supabaseAdmin } from '../db/supabase';
import type { Sequence, SequenceEnrollment, SequenceStep } from '@pitchlink/shared';

export interface CreateSequenceInput {
  name: string;
  mode: 'buy' | 'sell' | 'exchange';
  steps_json: SequenceStep[];
}

export interface UpdateSequenceInput {
  name?: string;
  steps_json?: SequenceStep[];
  is_active?: boolean;
}

export const sequencesService = {
  // ============================================================
  // Sequence CRUD
  // ============================================================

  async list(workspaceId: string, options?: { mode?: string }) {
    let query = supabaseAdmin
      .from('sequences')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (options?.mode) {
      query = query.eq('mode', options.mode);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { sequences: data as Sequence[], total: count || 0 };
  },

  async getById(workspaceId: string, sequenceId: string) {
    const { data, error } = await supabaseAdmin
      .from('sequences')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('id', sequenceId)
      .single();

    if (error) throw error;
    return data as Sequence;
  },

  async create(workspaceId: string, input: CreateSequenceInput) {
    const { data, error } = await supabaseAdmin
      .from('sequences')
      .insert({
        workspace_id: workspaceId,
        name: input.name,
        mode: input.mode,
        steps_json: input.steps_json,
        trigger_rules: {},
      })
      .select()
      .single();

    if (error) throw error;
    return data as Sequence;
  },

  async update(workspaceId: string, sequenceId: string, input: UpdateSequenceInput) {
    const { data, error } = await supabaseAdmin
      .from('sequences')
      .update(input)
      .eq('workspace_id', workspaceId)
      .eq('id', sequenceId)
      .select()
      .single();

    if (error) throw error;
    return data as Sequence;
  },

  async delete(workspaceId: string, sequenceId: string) {
    const { error } = await supabaseAdmin
      .from('sequences')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', sequenceId);

    if (error) throw error;
  },

  // ============================================================
  // Enrollment Management
  // ============================================================

  async enroll(
    workspaceId: string,
    sequenceId: string,
    dealId: string,
  ): Promise<SequenceEnrollment> {
    // Get the sequence to read its steps
    const sequence = await this.getById(workspaceId, sequenceId);
    const steps = (sequence.steps_json || []) as SequenceStep[];

    if (steps.length === 0) {
      throw new Error('Cannot enroll in a sequence with no steps');
    }

    // Calculate first fire time
    const firstStep = steps[0];
    const nextFireAt = new Date();
    nextFireAt.setDate(nextFireAt.getDate() + (firstStep.delay_days || 1));

    const { data, error } = await supabaseAdmin
      .from('sequence_enrollments')
      .insert({
        workspace_id: workspaceId,
        sequence_id: sequenceId,
        deal_id: dealId,
        current_step: 0,
        status: 'active',
        next_fire_at: nextFireAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Deal already has an active enrollment in this sequence');
      }
      throw error;
    }

    return data as SequenceEnrollment;
  },

  async pauseEnrollment(enrollmentId: string, reason: string) {
    const { data, error } = await supabaseAdmin
      .from('sequence_enrollments')
      .update({
        status: 'paused',
        pause_reason: reason,
        next_fire_at: null,
      })
      .eq('id', enrollmentId)
      .eq('status', 'active')
      .select()
      .single();

    if (error) throw error;
    return data as SequenceEnrollment;
  },

  async resumeEnrollment(workspaceId: string, enrollmentId: string) {
    // Get the enrollment to find what step to resume from
    const { data: enrollment, error: fetchError } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('*, sequence:sequences(*)')
      .eq('workspace_id', workspaceId)
      .eq('id', enrollmentId)
      .eq('status', 'paused')
      .single();

    if (fetchError) throw fetchError;

    const steps = ((enrollment.sequence as Sequence).steps_json || []) as SequenceStep[];
    const nextStep = steps[enrollment.current_step];

    if (!nextStep) {
      // All steps done — mark as completed
      return this.completeEnrollment(enrollmentId);
    }

    const nextFireAt = new Date();
    nextFireAt.setDate(nextFireAt.getDate() + (nextStep.delay_days || 1));

    const { data, error } = await supabaseAdmin
      .from('sequence_enrollments')
      .update({
        status: 'active',
        pause_reason: null,
        next_fire_at: nextFireAt.toISOString(),
      })
      .eq('id', enrollmentId)
      .select()
      .single();

    if (error) throw error;
    return data as SequenceEnrollment;
  },

  async cancelEnrollment(workspaceId: string, enrollmentId: string) {
    const { data, error } = await supabaseAdmin
      .from('sequence_enrollments')
      .update({
        status: 'cancelled',
        next_fire_at: null,
      })
      .eq('workspace_id', workspaceId)
      .eq('id', enrollmentId)
      .select()
      .single();

    if (error) throw error;
    return data as SequenceEnrollment;
  },

  async completeEnrollment(enrollmentId: string) {
    const { data, error } = await supabaseAdmin
      .from('sequence_enrollments')
      .update({
        status: 'completed',
        next_fire_at: null,
      })
      .eq('id', enrollmentId)
      .select()
      .single();

    if (error) throw error;
    return data as SequenceEnrollment;
  },

  /**
   * List enrollments for a deal (used by ContactPanel to show sequence status).
   */
  async listByDeal(workspaceId: string, dealId: string) {
    const { data, error } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('*, sequence:sequences(id, name, steps_json)')
      .eq('workspace_id', workspaceId)
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * List all active/paused enrollments across workspace (Nudge Queue).
   */
  async listQueue(workspaceId: string, options?: { mode?: string; limit?: number }) {
    let query = supabaseAdmin
      .from('sequence_enrollments')
      .select(`
        *,
        sequence:sequences(id, name, mode, steps_json),
        deal:deals(id, contact:contacts(id, email, name, domain), campaign:campaigns(id, name))
      `)
      .eq('workspace_id', workspaceId)
      .in('status', ['active', 'paused'])
      .order('next_fire_at', { ascending: true, nullsFirst: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Filter by mode if requested (via the sequence's mode)
    if (options?.mode && data) {
      return data.filter((e: Record<string, unknown>) => {
        const seq = e.sequence as { mode: string } | null;
        return seq?.mode === options.mode;
      });
    }

    return data || [];
  },

  /**
   * Auto-pause all active enrollments for a deal (called on reply detection).
   */
  async pauseByDeal(dealId: string, reason: string) {
    const { data, error } = await supabaseAdmin
      .from('sequence_enrollments')
      .update({
        status: 'paused',
        pause_reason: reason,
        next_fire_at: null,
      })
      .eq('deal_id', dealId)
      .eq('status', 'active')
      .select('id');

    if (error) {
      console.error('[Sequences] Failed to pause enrollments for deal:', error);
      return [];
    }
    return data || [];
  },

  /**
   * Advance an enrollment to the next step (called by executor after firing).
   */
  async advanceStep(enrollmentId: string, sequenceSteps: SequenceStep[]) {
    const { data: enrollment, error: fetchError } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('current_step')
      .eq('id', enrollmentId)
      .single();

    if (fetchError) throw fetchError;

    const nextStepIndex = enrollment.current_step + 1;

    if (nextStepIndex >= sequenceSteps.length) {
      // Sequence complete
      return this.completeEnrollment(enrollmentId);
    }

    const nextStep = sequenceSteps[nextStepIndex];
    const nextFireAt = new Date();
    nextFireAt.setDate(nextFireAt.getDate() + (nextStep.delay_days || 1));

    const { data, error } = await supabaseAdmin
      .from('sequence_enrollments')
      .update({
        current_step: nextStepIndex,
        last_fired_at: new Date().toISOString(),
        next_fire_at: nextFireAt.toISOString(),
      })
      .eq('id', enrollmentId)
      .select()
      .single();

    if (error) throw error;
    return data as SequenceEnrollment;
  },
};
