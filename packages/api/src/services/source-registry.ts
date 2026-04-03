/**
 * Source Registry Service
 *
 * CRUD operations for the source_registry table.
 * Maps forwarding email addresses to original senders for IIE fast-path lookups.
 */

import type { SourceRegistryEntry, IIEDetectionLayer } from '@pitchlink/shared';
import { supabaseAdmin } from '../db/supabase';

export const sourceRegistryService = {
  /**
   * Look up a single entry by forwarding email (used by IIE Layer 0).
   */
  async lookup(
    workspaceId: string,
    forwardingEmail: string,
  ): Promise<SourceRegistryEntry | null> {
    const { data, error } = await supabaseAdmin
      .from('source_registry')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('forwarding_email', forwardingEmail.toLowerCase())
      .maybeSingle();

    if (error) throw error;
    return data as SourceRegistryEntry | null;
  },

  /**
   * List all entries for a workspace (settings UI).
   */
  async list(workspaceId: string): Promise<SourceRegistryEntry[]> {
    const { data, error } = await supabaseAdmin
      .from('source_registry')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as SourceRegistryEntry[];
  },

  /**
   * Create a new source registry entry.
   * Used both by auto-detection and manual creation.
   */
  async create(
    workspaceId: string,
    entry: {
      forwarding_email: string;
      original_sender_email?: string;
      original_sender_name?: string;
      maps_to_client?: string;
      maps_to_campaign?: string;
      detection_method: IIEDetectionLayer;
      confidence?: number;
    },
  ): Promise<SourceRegistryEntry> {
    const { data, error } = await supabaseAdmin
      .from('source_registry')
      .upsert(
        {
          workspace_id: workspaceId,
          forwarding_email: entry.forwarding_email.toLowerCase(),
          original_sender_email: entry.original_sender_email?.toLowerCase(),
          original_sender_name: entry.original_sender_name,
          maps_to_client: entry.maps_to_client,
          maps_to_campaign: entry.maps_to_campaign,
          detection_method: entry.detection_method === 'registry' ? 'human' : entry.detection_method,
          confidence: entry.confidence ?? 1.0,
        },
        { onConflict: 'workspace_id,forwarding_email' },
      )
      .select()
      .single();

    if (error) throw error;
    return data as SourceRegistryEntry;
  },

  /**
   * Update an existing entry.
   */
  async update(
    workspaceId: string,
    id: string,
    updates: {
      original_sender_email?: string;
      original_sender_name?: string;
      maps_to_client?: string;
      maps_to_campaign?: string;
    },
  ): Promise<SourceRegistryEntry> {
    const updateData: Record<string, unknown> = {};
    if (updates.original_sender_email !== undefined) {
      updateData.original_sender_email = updates.original_sender_email.toLowerCase();
    }
    if (updates.original_sender_name !== undefined) {
      updateData.original_sender_name = updates.original_sender_name;
    }
    if (updates.maps_to_client !== undefined) {
      updateData.maps_to_client = updates.maps_to_client;
    }
    if (updates.maps_to_campaign !== undefined) {
      updateData.maps_to_campaign = updates.maps_to_campaign;
    }

    const { data, error } = await supabaseAdmin
      .from('source_registry')
      .update(updateData)
      .eq('workspace_id', workspaceId)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as SourceRegistryEntry;
  },

  /**
   * Delete an entry.
   */
  async delete(workspaceId: string, id: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('source_registry')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('id', id);

    if (error) throw error;
  },
};
