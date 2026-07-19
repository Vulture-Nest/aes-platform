import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { CreateThresholdDto } from './dto/threshold.dto';
import { ThresholdsService } from './thresholds.service';

@ApiTags('reference: thresholds')
@ApiBearerAuth()
@Controller({ path: 'thresholds', version: '1' })
export class ThresholdsController {
  constructor(private readonly thresholds: ThresholdsService) {}

  @Post()
  @Roles('FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Set a threshold / tunable parameter' })
  create(@Body() dto: CreateThresholdDto, @CurrentUser('id') actorId: string) {
    return this.thresholds.create(dto, actorId);
  }

  @Get()
  @ApiOperation({ summary: 'List thresholds (optionally by key)' })
  list(@Query('key') key?: string) {
    return this.thresholds.list(key);
  }

  @Get('current')
  @ApiOperation({ summary: 'Current value for a threshold key' })
  current(@Query('key') key: string, @Query('currency') currency?: string) {
    return this.thresholds.current(key, currency);
  }
}
