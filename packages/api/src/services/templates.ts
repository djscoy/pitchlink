import { supabaseAdmin } from '../db/supabase';
import type { Template, TransactionMode } from '@pitchlink/shared';

export interface CreateTemplateInput {
  name: string;
  mode: TransactionMode;
  category?: string;
  subject: string;
  body_html: string;
}

export interface UpdateTemplateInput {
  name?: string;
  mode?: TransactionMode;
  category?: string;
  subject?: string;
  body_html?: string;
}

// Regex to find template variables like {{contact_name}}
const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

export const templatesService = {
  async list(workspaceId: string, options?: { mode?: TransactionMode; category?: string }) {
    let query = supabaseAdmin
      .from('templates')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (options?.mode) {
      query = query.eq('mode', options.mode);
    }
    if (options?.category) {
      query = query.eq('category', options.category);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    return { templates: data as Template[], total: count || 0 };
  },

  async getById(workspaceId: string, templateId: string) {
    const { data, error } = await supabaseAdmin
      .from('templates')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('id', templateId)
      .single();

    if (error) throw error;
    return data as Template;
  },

  async create(workspaceId: string, input: CreateTemplateInput) {
    // Auto-detect variables in subject and body
    const variables = extractVariables(input.subject + ' ' + input.body_html);

    const { data, error } = await supabaseAdmin
      .from('templates')
      .insert({
        workspace_id: workspaceId,
        name: input.name,
        mode: input.mode,
        category: input.category || '',
        subject: input.subject,
        body_html: input.body_html,
        variables,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Template;
  },

  async update(workspaceId: string, templateId: string, input: UpdateTemplateInput) {
    // Re-detect variables if subject or body changed
    const updateData: Record<string, unknown> = { ...input };
    if (input.subject !== undefined || input.body_html !== undefined) {
      // Need current template to merge for variable detection
      const current = await this.getById(workspaceId, templateId);
      const subject = input.subject ?? current.subject;
      const body = input.body_html ?? current.body_html;
      updateData.variables = extractVariables(subject + ' ' + body);
    }

    const { data, error } = await supabaseAdmin
      .from('templates')
      .update(updateData)
      .eq('workspace_id', workspaceId)
      .eq('id', templateId)
      .select()
      .single();

    if (error) throw error;
    return data as Template;
  },

  async delete(workspaceId: string, templateId: string) {
    const { error } = await supabaseAdmin
      .from('templates')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', templateId);

    if (error) throw error;
  },

  /**
   * Resolve template variables for a specific contact and campaign.
   * Returns the subject and body with variables replaced.
   */
  resolveVariables(
    subject: string,
    bodyHtml: string,
    context: VariableContext,
  ): { subject: string; body_html: string } {
    const variableMap: Record<string, string> = {
      contact_name: context.contactName || '',
      contact_email: context.contactEmail || '',
      domain: context.domain || '',
      campaign_name: context.campaignName || '',
      sender_name: context.senderName || '',
      sender_email: context.senderEmail || '',
      // Custom fields
      ...(context.customFields || {}),
    };

    const resolve = (text: string) =>
      text.replace(VARIABLE_REGEX, (match, varName) => {
        return variableMap[varName] !== undefined ? variableMap[varName] : match;
      });

    return {
      subject: resolve(subject),
      body_html: resolve(bodyHtml),
    };
  },
};

export interface VariableContext {
  contactName?: string;
  contactEmail?: string;
  domain?: string;
  campaignName?: string;
  senderName?: string;
  senderEmail?: string;
  customFields?: Record<string, string>;
}

// --- Helpers ---

function extractVariables(text: string): string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_REGEX.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    matches.add(match[1]);
  }
  return Array.from(matches);
}
