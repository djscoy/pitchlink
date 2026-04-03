/**
 * IIE Client — Extension-side coordinator for the Inbox Identity Engine.
 *
 * Calls the API to run the server-side cascade (Layers 0-3),
 * and provides methods for Layer 4 (human confirmation).
 */

import type { IIEResult, IIEConfirmRequest, ApiResult } from '@pitchlink/shared';
import { api } from '../utils/api';

export const iieClient = {
  /**
   * Analyze a Gmail message for forward detection.
   * Runs server-side Layers 0-3. If the result has detection_layer === 'unresolved'
   * with is_forwarded === true, the caller should show the Layer 4 ForwardPrompt UI.
   */
  async analyzeMessage(gmailMessageId: string): Promise<IIEResult> {
    const result = await api.iie.analyze({ gmail_message_id: gmailMessageId }) as ApiResult<IIEResult>;
    if ('error' in result && result.error) {
      console.error('[IIE Client] Analysis failed:', result.error);
      return {
        is_forwarded: false,
        confidence: 0,
        detection_layer: 'unresolved',
      };
    }
    return (result as { data: IIEResult }).data;
  },

  /**
   * Submit Layer 4 human confirmation.
   */
  async confirmAttribution(confirmation: IIEConfirmRequest): Promise<void> {
    await api.iie.confirm(confirmation);
  },

  /**
   * Check if Layer 4 prompt should be shown for an IIE result.
   */
  shouldShowPrompt(result: IIEResult): boolean {
    return (
      result.is_forwarded &&
      result.detection_layer === 'unresolved' &&
      result.confidence > 0
    );
  },

  /**
   * Check if an IIE result has a confident resolution.
   */
  isResolved(result: IIEResult): boolean {
    return (
      result.is_forwarded &&
      result.detection_layer !== 'unresolved' &&
      !!result.original_sender_email
    );
  },
};
