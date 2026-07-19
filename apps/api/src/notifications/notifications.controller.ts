import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SetPreferenceDto } from './dto/notification.dto';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: "The current user's notifications" })
  list(@CurrentUser('id') userId: string, @Query('unreadOnly') unreadOnly?: string) {
    return this.notifications.listForUser(userId, unreadOnly === 'true');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count of unread notifications' })
  async unreadCount(@CurrentUser('id') userId: string) {
    return { count: await this.notifications.unreadCount(userId) };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a notification read' })
  markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.notifications.markRead(id, userId);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications read' })
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Per-channel notification preferences' })
  preferences(@CurrentUser('id') userId: string) {
    return this.notifications.getPreferences(userId);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Enable/disable a notification channel' })
  setPreference(@CurrentUser('id') userId: string, @Body() dto: SetPreferenceDto) {
    return this.notifications.setPreference(userId, dto.channel, dto.enabled);
  }
}
