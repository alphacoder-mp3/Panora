import { Module } from '@nestjs/common';
import { SyncService } from './sync/sync.service';
import { WebhookService } from '@@core/webhook/webhook.service';
import { EncryptionService } from '@@core/encryption/encryption.service';
import { LoggerService } from '@@core/logger/logger.service';
import { PrismaService } from '@@core/prisma/prisma.service';
import { ZendeskService } from './services/zendesk';
import { BullModule } from '@nestjs/bull';
import { FieldMappingService } from '@@core/field-mapping/field-mapping.service';
import { ServiceRegistry } from './services/registry.service';
import { ContactService } from './services/contact.service';
import { ContactController } from './contact.controller';
import { FrontService } from './services/front';
import { GithubService } from './services/github';
import { GorgiasService } from './services/gorgias';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhookDelivery',
    }),
  ],
  controllers: [ContactController],
  providers: [
    ContactService,
    PrismaService,
    LoggerService,
    SyncService,
    WebhookService,
    EncryptionService,
    FieldMappingService,
    ServiceRegistry,
    /* PROVIDERS SERVICES */
    ZendeskService,
    FrontService,
    GithubService,
    GorgiasService,
  ],
  exports: [SyncService],
})
export class ContactModule {}
