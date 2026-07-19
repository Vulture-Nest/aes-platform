import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../rbac/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { ConversionAnalyticsQueryDto } from './dto/analytics.dto';

@ApiTags('crm-analytics')
@ApiBearerAuth()
@Controller({ path: 'crm/analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('conversion')
  @Roles('OPS_DIRECTOR', 'DIRECTOR', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({
    summary: 'Business-development conversion funnel (overall and per owner) over a date range',
  })
  conversion(@Query() query: ConversionAnalyticsQueryDto) {
    return this.analytics.conversion(query);
  }
}
