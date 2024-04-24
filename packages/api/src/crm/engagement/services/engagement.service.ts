import { Injectable } from '@nestjs/common';
import { PrismaService } from '@@core/prisma/prisma.service';
import { LoggerService } from '@@core/logger/logger.service';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse } from '@@core/utils/types';
import { handleServiceError } from '@@core/utils/errors';
import { WebhookService } from '@@core/webhook/webhook.service';
import {
  UnifiedEngagementInput,
  UnifiedEngagementOutput,
} from '../types/model.unified';
import { desunify } from '@@core/utils/unification/desunify';
import { CrmObject } from '@crm/@utils/@types';
import { FieldMappingService } from '@@core/field-mapping/field-mapping.service';
import { ServiceRegistry } from './registry.service';
import { OriginalEngagementOutput } from '@@core/utils/types/original/original.crm';
import { unify } from '@@core/utils/unification/unify';
import { IEngagementService } from '../types';
import { ENGAGEMENTS_TYPE } from '../utils';

@Injectable()
export class EngagementService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
    private webhook: WebhookService,
    private fieldMappingService: FieldMappingService,
    private serviceRegistry: ServiceRegistry,
  ) {
    this.logger.setContext(EngagementService.name);
  }

  async batchAddEngagements(
    unifiedEngagementData: UnifiedEngagementInput[],
    integrationId: string,
    linkedUserId: string,
    remote_data?: boolean,
  ): Promise<UnifiedEngagementOutput[]> {
    try {
      const responses = await Promise.all(
        unifiedEngagementData.map((unifiedData) =>
          this.addEngagement(
            unifiedData,
            integrationId.toLowerCase(),
            linkedUserId,
            remote_data,
          ),
        ),
      );

      return responses;
    } catch (error) {
      handleServiceError(error, this.logger);
    }
  }

  async addEngagement(
    unifiedEngagementData: UnifiedEngagementInput,
    integrationId: string,
    linkedUserId: string,
    remote_data?: boolean,
  ): Promise<UnifiedEngagementOutput> {
    try {
      const linkedUser = await this.prisma.linked_users.findUnique({
        where: {
          id_linked_user: linkedUserId,
        },
      });

      //CHECKS
      if (!linkedUser) throw new Error('Linked User Not Found');

      const company = unifiedEngagementData.company_id;
      //check if contact_id and account_id refer to real uuids
      if (company) {
        const search = await this.prisma.crm_companies.findUnique({
          where: {
            id_crm_company: company,
          },
        });
        if (!search)
          throw new Error('You inserted a contact_id which does not exist');
      }
      const type = unifiedEngagementData.type.toUpperCase();
      if (type) {
        if (!ENGAGEMENTS_TYPE.includes(type))
          throw new Error(
            'You inserted a engagement type which does not exist',
          );
      } else {
        throw new Error('You didnt insert a type for your engagement');
      }

      const engagement_contacts = unifiedEngagementData.contacts;
      if (engagement_contacts && engagement_contacts.length > 0) {
        engagement_contacts.map(async (contact) => {
          const search = await this.prisma.crm_engagement_contacts.findUnique({
            where: {
              id_crm_engagement_contact: contact,
            },
          });
          if (!search)
            throw new Error(
              'You inserted an id_crm_engagement_contact which does not exist',
            );
        });
      }

      //desunify the data according to the target obj wanted
      const desunifiedObject = await desunify<UnifiedEngagementInput>({
        sourceObject: unifiedEngagementData,
        targetType: CrmObject.engagement,
        providerName: integrationId,
        vertical: 'crm',
        customFieldMappings: [],
      });

      const service: IEngagementService =
        this.serviceRegistry.getService(integrationId);

      const resp: ApiResponse<OriginalEngagementOutput> =
        await service.addEngagement(desunifiedObject, linkedUserId, type);

      const targetType =
        type === 'CALL'
          ? CrmObject.engagement_call
          : type === 'MEETING'
          ? CrmObject.engagement_meeting
          : CrmObject.engagement_email;

      //unify the data according to the target obj wanted
      const unifiedObject = (await unify<OriginalEngagementOutput[]>({
        sourceObject: [resp.data],
        targetType: targetType,
        providerName: integrationId,
        vertical: 'crm',
        customFieldMappings: [],
      })) as UnifiedEngagementOutput[];

      // add the engagement inside our db
      const source_engagement = resp.data;
      const target_engagement = unifiedObject[0];
      const originId =
        'id' in source_engagement ? String(source_engagement.id) : undefined; //TODO

      const existingEngagement = await this.prisma.crm_engagements.findFirst({
        where: {
          remote_id: originId,
          remote_platform: integrationId,
          id_linked_user: linkedUserId,
        },
      });

      let unique_crm_engagement_id: string;

      if (existingEngagement) {
        // Update the existing engagement
        let data: any = {
          modified_at: new Date(),
        };

        if (target_engagement.content) {
          data = { ...data, content: target_engagement.content };
        }
        if (target_engagement.direction) {
          data = { ...data, direction: target_engagement.direction };
        }
        if (target_engagement.subject) {
          data = { ...data, subject: target_engagement.subject };
        }
        if (target_engagement.start_at) {
          data = { ...data, start_at: target_engagement.start_at };
        }
        if (target_engagement.end_time) {
          data = { ...data, end_time: target_engagement.end_time };
        }
        if (target_engagement.type) {
          data = {
            ...data,
            type: target_engagement.type,
          };
        }
        if (target_engagement.company_id) {
          data = { ...data, id_crm_company: target_engagement.company_id };
        }

        /*TODO:
        if (target_engagement.contacts) {
          data = { ...data, end_time: target_engagement.end_time };
        }*/
        const res = await this.prisma.crm_engagements.update({
          where: {
            id_crm_engagement: existingEngagement.id_crm_engagement,
          },
          data: data,
        });
        unique_crm_engagement_id = res.id_crm_engagement;
      } else {
        // Create a new engagement
        this.logger.log('engagement not exists');
        let data: any = {
          id_crm_engagement: uuidv4(),
          created_at: new Date(),
          modified_at: new Date(),
          id_linked_user: linkedUserId,
          remote_id: originId,
          remote_platform: integrationId,
        };

        if (target_engagement.content) {
          data = { ...data, content: target_engagement.content };
        }
        if (target_engagement.direction) {
          data = { ...data, direction: target_engagement.direction };
        }
        if (target_engagement.subject) {
          data = { ...data, subject: target_engagement.subject };
        }
        if (target_engagement.start_at) {
          data = { ...data, start_at: target_engagement.start_at };
        }
        if (target_engagement.end_time) {
          data = { ...data, end_time: target_engagement.end_time };
        }
        if (target_engagement.type) {
          data = {
            ...data,
            type: target_engagement.type,
          };
        }
        if (target_engagement.company_id) {
          data = { ...data, id_crm_company: target_engagement.company_id };
        }

        /*TODO:
        if (target_engagement.contacts) {
          data = { ...data, end_time: target_engagement.end_time };
        }*/

        const res = await this.prisma.crm_engagements.create({
          data: data,
        });
        unique_crm_engagement_id = res.id_crm_engagement;
      }

      //insert remote_data in db
      await this.prisma.remote_data.upsert({
        where: {
          ressource_owner_id: unique_crm_engagement_id,
        },
        create: {
          id_remote_data: uuidv4(),
          ressource_owner_id: unique_crm_engagement_id,
          format: 'json',
          data: JSON.stringify(source_engagement),
          created_at: new Date(),
        },
        update: {
          data: JSON.stringify(source_engagement),
          created_at: new Date(),
        },
      });

      const result_engagement = await this.getEngagement(
        unique_crm_engagement_id,
        remote_data,
      );

      const status_resp = resp.statusCode === 201 ? 'success' : 'fail';

      const event = await this.prisma.events.create({
        data: {
          id_event: uuidv4(),
          status: status_resp,
          type: 'crm.engagement.push', //sync, push or pull
          method: 'POST',
          url: '/crm/engagements',
          provider: integrationId,
          direction: '0',
          timestamp: new Date(),
          id_linked_user: linkedUserId,
        },
      });
      await this.webhook.handleWebhook(
        result_engagement,
        'crm.engagement.created',
        linkedUser.id_project,
        event.id_event,
      );
      return result_engagement;
    } catch (error) {
      handleServiceError(error, this.logger);
    }
  }

  //TODO: include engagements contacts
  async getEngagement(
    id_engagement: string,
    remote_data?: boolean,
  ): Promise<UnifiedEngagementOutput> {
    try {
      const engagement = await this.prisma.crm_engagements.findUnique({
        where: {
          id_crm_engagement: id_engagement,
        },
      });

      // Fetch field mappings for the engagement
      const values = await this.prisma.value.findMany({
        where: {
          entity: {
            ressource_owner_id: engagement.id_crm_engagement,
          },
        },
        include: {
          attribute: true,
        },
      });

      const fieldMappingsMap = new Map();

      values.forEach((value) => {
        fieldMappingsMap.set(value.attribute.slug, value.data);
      });

      // Convert the map to an array of objects
      const field_mappings = Array.from(fieldMappingsMap, ([key, value]) => ({
        [key]: value,
      }));

      /*TODO:
      if (target_engagement.contacts) {
        data = { ...data, end_time: target_engagement.end_time };
      }*/

      // Transform to UnifiedEngagementOutput format
      const unifiedEngagement: UnifiedEngagementOutput = {
        id: engagement.id_crm_engagement,
        content: engagement.content,
        direction: engagement.direction,
        subject: engagement.subject,
        start_at: engagement.start_at,
        end_time: engagement.end_time,
        type: engagement.type,
        company_id: engagement.id_crm_company,
        field_mappings: field_mappings,
      };

      let res: UnifiedEngagementOutput = {
        ...unifiedEngagement,
      };

      if (remote_data) {
        const resp = await this.prisma.remote_data.findFirst({
          where: {
            ressource_owner_id: engagement.id_crm_engagement,
          },
        });
        const remote_data = JSON.parse(resp.data);

        res = {
          ...res,
          remote_data: remote_data,
        };
      }

      return res;
    } catch (error) {
      handleServiceError(error, this.logger);
    }
  }

  async getEngagements(
    integrationId: string,
    linkedUserId: string,
    remote_data?: boolean,
  ): Promise<UnifiedEngagementOutput[]> {
    try {
      const engagements = await this.prisma.crm_engagements.findMany({
        where: {
          remote_platform: integrationId.toLowerCase(),
          id_linked_user: linkedUserId,
        },
      });

      const unifiedEngagements: UnifiedEngagementOutput[] = await Promise.all(
        engagements.map(async (engagement) => {
          // Fetch field mappings for the ticket
          const values = await this.prisma.value.findMany({
            where: {
              entity: {
                ressource_owner_id: engagement.id_crm_engagement,
              },
            },
            include: {
              attribute: true,
            },
          });
          // Create a map to store unique field mappings
          const fieldMappingsMap = new Map();

          values.forEach((value) => {
            fieldMappingsMap.set(value.attribute.slug, value.data);
          });

          // Convert the map to an array of objects
          const field_mappings = Array.from(
            fieldMappingsMap,
            ([key, value]) => ({ [key]: value }),
          );

          // Transform to UnifiedEngagementOutput format
          /*TODO:
          if (target_engagement.contacts) {
            data = { ...data, end_time: target_engagement.end_time };
          }*/

          // Transform to UnifiedEngagementOutput format
          return {
            id: engagement.id_crm_engagement,
            content: engagement.content,
            direction: engagement.direction,
            subject: engagement.subject,
            start_at: engagement.start_at,
            end_time: engagement.end_time,
            type: engagement.type,
            company_id: engagement.id_crm_company,
            field_mappings: field_mappings,
          };
        }),
      );

      let res: UnifiedEngagementOutput[] = unifiedEngagements;

      if (remote_data) {
        const remote_array_data: UnifiedEngagementOutput[] = await Promise.all(
          res.map(async (engagement) => {
            const resp = await this.prisma.remote_data.findFirst({
              where: {
                ressource_owner_id: engagement.id,
              },
            });
            const remote_data = JSON.parse(resp.data);
            return { ...engagement, remote_data };
          }),
        );
        res = remote_array_data;
      }

      const event = await this.prisma.events.create({
        data: {
          id_event: uuidv4(),
          status: 'success',
          type: 'crm.engagement.pulled',
          method: 'GET',
          url: '/crm/engagements',
          provider: integrationId,
          direction: '0',
          timestamp: new Date(),
          id_linked_user: linkedUserId,
        },
      });

      return res;
    } catch (error) {
      handleServiceError(error, this.logger);
    }
  }

  async updateEngagement(
    id: string,
    data: Partial<UnifiedEngagementInput>,
  ): Promise<UnifiedEngagementOutput> {
    return;
  }
}
