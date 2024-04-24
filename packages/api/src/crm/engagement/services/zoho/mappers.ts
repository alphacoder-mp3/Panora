import { ZohoEngagementInput, ZohoEngagementOutput } from './types';
import {
  UnifiedEngagementInput,
  UnifiedEngagementOutput,
} from '@crm/engagement/types/model.unified';
import { IEngagementMapper } from '@crm/engagement/types';

export class ZohoEngagementMapper implements IEngagementMapper {
  desunify(
    source: UnifiedEngagementInput,
    customFieldMappings?: {
      slug: string;
      remote_id: string;
    }[],
  ): ZohoEngagementInput {
    return;
  }

  async unify(
    source: ZohoEngagementOutput | ZohoEngagementOutput[],
    engagement_type: string,
    customFieldMappings?: {
      slug: string;
      remote_id: string;
    }[],
  ): Promise<UnifiedEngagementOutput | UnifiedEngagementOutput[]> {
    if (!Array.isArray(source)) {
      return this.mapSingleEngagementToUnified(source, customFieldMappings);
    }

    // Handling array of HubspotEngagementOutput
    return source.map((engagement) =>
      this.mapSingleEngagementToUnified(engagement, customFieldMappings),
    );
  }

  private mapSingleEngagementToUnified(
    engagement: ZohoEngagementOutput,
    customFieldMappings?: {
      slug: string;
      remote_id: string;
    }[],
  ): UnifiedEngagementOutput {
    return;
  }
}
