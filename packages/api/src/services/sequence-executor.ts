/**
 * Sequence Executor — Fires scheduled sequence steps.
 *
 * Runs periodically (every 5 minutes). Finds enrollments where
 * next_fire_at <= NOW() and status = 'active', then executes the step
 * (AI-generate or template-based) and saves as Gmail Draft.
 */

import { supabaseAdmin } from '../db/supabase';
import { sequencesService } from './sequences';
import { aiComposeService } from './ai-compose';
import { templatesService } from './templates';
import type { SequenceStep } from '@pitchlink/shared';

const EXECUTOR_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let executorTimer: ReturnType<typeof setInterval> | null = null;

export const sequenceExecutorService = {
  /**
   * Start the periodic executor.
   */
  start() {
    if (executorTimer) return;
    console.log('[SequenceExecutor] Started (every 5 minutes)');
    // Run once immediately, then on interval
    this.processQueue().catch((err) => console.error('[SequenceExecutor] Initial run error:', err));
    executorTimer = setInterval(() => {
      this.processQueue().catch((err) => console.error('[SequenceExecutor] Run error:', err));
    }, EXECUTOR_INTERVAL_MS);
  },

  /**
   * Stop the executor.
   */
  stop() {
    if (executorTimer) {
      clearInterval(executorTimer);
      executorTimer = null;
      console.log('[SequenceExecutor] Stopped');
    }
  },

  /**
   * Process all due enrollments.
   */
  async processQueue(): Promise<number> {
    const now = new Date().toISOString();

    // Find all active enrollments due to fire
    const { data: dueEnrollments, error } = await supabaseAdmin
      .from('sequence_enrollments')
      .select(`
        *,
        sequence:sequences(id, name, workspace_id, steps_json, mode),
        deal:deals(
          id, workspace_id, contact_id, campaign_id,
          contact:contacts(id, email, name, domain),
          campaign:campaigns(id, name)
        )
      `)
      .eq('status', 'active')
      .not('next_fire_at', 'is', null)
      .lte('next_fire_at', now)
      .limit(50);

    if (error) {
      console.error('[SequenceExecutor] Failed to query due enrollments:', error);
      return 0;
    }

    if (!dueEnrollments || dueEnrollments.length === 0) return 0;

    console.log(`[SequenceExecutor] Processing ${dueEnrollments.length} due enrollment(s)`);

    let processed = 0;

    for (const enrollment of dueEnrollments) {
      try {
        await this.fireStep(enrollment);
        processed++;
      } catch (err) {
        console.error(`[SequenceExecutor] Failed to fire step for enrollment ${enrollment.id}:`, err);
      }
    }

    return processed;
  },

  /**
   * Fire a single sequence step for an enrollment.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async fireStep(enrollment: any): Promise<void> {
    const sequence = enrollment.sequence;
    const deal = enrollment.deal;
    const contact = deal?.contact;
    const campaign = deal?.campaign;

    if (!sequence || !deal || !contact) {
      console.warn(`[SequenceExecutor] Missing data for enrollment ${enrollment.id}, skipping`);
      return;
    }

    const steps = (sequence.steps_json || []) as SequenceStep[];
    const currentStep = steps[enrollment.current_step];

    if (!currentStep) {
      // No more steps — complete the enrollment
      await sequencesService.completeEnrollment(enrollment.id);
      return;
    }

    // Get Gmail access token for the workspace owner
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('workspace_id', sequence.workspace_id)
      .limit(1)
      .single();

    if (!user) return;

    const { data: watchState } = await supabaseAdmin
      .from('gmail_watch_state')
      .select('access_token_encrypted')
      .eq('user_id', user.id)
      .single();

    if (!watchState?.access_token_encrypted) {
      console.warn(`[SequenceExecutor] No Gmail token for workspace, skipping enrollment ${enrollment.id}`);
      return;
    }

    let subject: string;
    let body: string;

    if (currentStep.use_ai_generate) {
      // AI-generate the step content
      const result = await aiComposeService.generateDraft({
        contactEmail: contact.email,
        contactName: contact.name,
        contactDomain: contact.domain,
        campaignName: campaign?.name,
        mode: sequence.mode,
        instruction: currentStep.subject || `Send follow-up #${enrollment.current_step + 1}`,
      });
      subject = result.subject;
      body = result.body;
    } else if (currentStep.template_id) {
      // Use template
      const template = await templatesService.getById(sequence.workspace_id, currentStep.template_id);
      const resolved = templatesService.resolveVariables(
        template.subject,
        template.body_html,
        {
          contactName: contact.name,
          contactEmail: contact.email,
          domain: contact.domain,
          campaignName: campaign?.name,
        },
      );
      subject = resolved.subject;
      body = resolved.body_html;
    } else {
      // Use inline subject/body from step
      subject = currentStep.subject || `Following up`;
      body = currentStep.body_html || '';
    }

    if (!subject || !body) {
      console.warn(`[SequenceExecutor] Empty content for step ${enrollment.current_step}, skipping`);
      return;
    }

    // Save as Gmail Draft (Draft Hold mode — user reviews before sending)
    const draftId = await aiComposeService.saveAsGmailDraft(
      watchState.access_token_encrypted,
      contact.email,
      subject,
      body,
    );

    if (draftId) {
      console.log(
        `[SequenceExecutor] Step ${enrollment.current_step + 1}/${steps.length} fired for ${contact.email} → Gmail Draft ${draftId}`,
      );
    }

    // Advance to next step (or complete if last step)
    await sequencesService.advanceStep(enrollment.id, steps);
  },
};
