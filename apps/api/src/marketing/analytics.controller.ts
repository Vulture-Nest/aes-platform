import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../rbac/roles.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('marketing-analytics')
@ApiBearerAuth()
@Controller({ path: 'marketing/analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @Roles('OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({
    summary:
      'Marketing analytics: per-campaign funnel, leaderboard (cost-per-lead, value-won) and channel comparison',
  })
  overview() {
    return this.analytics.overview();
  }
}
