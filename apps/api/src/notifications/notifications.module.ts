import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationService } from './notification.service';
import { EmailTransport } from './transports/email.transport';
import { PushTransport } from './transports/push.transport';
import { TeamsTransport } from './transports/teams.transport';

/** Global so approval engine, danger engine, etc. can dispatch notifications. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationService, EmailTransport, PushTransport, TeamsTransport],
  exports: [NotificationService],
})
export class NotificationsModule {}
