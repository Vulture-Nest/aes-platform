import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { CampaignsService } from './campaigns.service';
import {
  CreateCampaignDto,
  CreateChannelDto,
  CreateMetricDto,
  ListCampaignsQueryDto,
  UpdateCampaignDto,
  UpdateChannelDto,
} from './dto/campaign.dto';

const AUTHENTICATED = [
  'OPS_STAFF',
  'OPS_DIRECTOR',
  'DIRECTOR',
  'FINANCE_DIRECTOR',
  'SYS_ADMIN',
  'AUDITOR',
] as const;
const BD_MANAGE = ['OPS_DIRECTOR', 'FINANCE_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN'] as const;

@ApiTags('marketing-campaigns')
@ApiBearerAuth()
@Controller({ path: 'marketing/campaigns', version: '1' })
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @Roles(...AUTHENTICATED)
  @ApiOperation({ summary: 'List marketing campaigns (filter by status/entityId)' })
  list(@Query() query: ListCampaignsQueryDto) {
    return this.campaigns.list(query);
  }

  @Get(':id')
  @Roles(...AUTHENTICATED)
  @ApiOperation({ summary: 'Get a campaign with its channels' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.findOne(id);
  }

  @Post()
  @Roles(...BD_MANAGE)
  @ApiOperation({ summary: 'Create a marketing campaign' })
  create(@Body() dto: CreateCampaignDto, @CurrentUser('id') actorId: string) {
    return this.campaigns.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(...BD_MANAGE)
  @ApiOperation({ summary: 'Update a marketing campaign' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.campaigns.update(id, dto, actorId);
  }

  // ---- Channels (nested) --------------------------------------------------

  @Get(':id/channels')
  @Roles(...AUTHENTICATED)
  @ApiOperation({ summary: 'List a campaign channels' })
  listChannels(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.listChannels(id);
  }

  @Post(':id/channels')
  @Roles(...BD_MANAGE)
  @ApiOperation({ summary: 'Add a channel to a campaign (auto flierCode/link for Flier)' })
  createChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateChannelDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.campaigns.createChannel(id, dto, actorId);
  }

  @Patch('channels/:channelId')
  @Roles(...BD_MANAGE)
  @ApiOperation({ summary: 'Update a campaign channel' })
  updateChannel(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body() dto: UpdateChannelDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.campaigns.updateChannel(channelId, dto, actorId);
  }

  @Delete('channels/:channelId')
  @Roles(...BD_MANAGE)
  @ApiOperation({ summary: 'Delete a campaign channel' })
  deleteChannel(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.campaigns.deleteChannel(channelId, actorId);
  }

  // ---- Metrics (nested under a channel) -----------------------------------

  @Get('channels/:channelId/metrics')
  @Roles(...AUTHENTICATED)
  @ApiOperation({ summary: 'List weekly metrics for a channel' })
  listMetrics(@Param('channelId', ParseUUIDPipe) channelId: string) {
    return this.campaigns.listMetrics(channelId);
  }

  @Post('channels/:channelId/metrics')
  @Roles(...BD_MANAGE)
  @ApiOperation({ summary: 'Record a weekly metric snapshot for a channel' })
  createMetric(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body() dto: CreateMetricDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.campaigns.createMetric(channelId, dto, actorId);
  }
}
