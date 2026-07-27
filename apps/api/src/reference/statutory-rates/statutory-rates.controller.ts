import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { CreateStatutoryRateDto, StatutoryValueQueryDto } from './dto/statutory-rate.dto';
import { StatutoryRatesService } from './statutory-rates.service';

@ApiTags('reference: statutory-rates')
@ApiBearerAuth()
@Controller({ path: 'statutory-rates', version: '1' })
export class StatutoryRatesController {
  constructor(private readonly rates: StatutoryRatesService) {}

  @Post()
  @Roles('FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Record an effective-dated statutory parameter' })
  create(@Body() dto: CreateStatutoryRateDto, @CurrentUser('id') actorId: string) {
    return this.rates.create(dto, actorId);
  }

  @Get()
  @ApiOperation({ summary: 'List statutory parameters (optionally by key)' })
  list(@Query('key') key?: string) {
    return this.rates.list(key);
  }

  @Get('as-of')
  @ApiOperation({ summary: 'Resolve the statutory value effective on a date' })
  asOf(@Query() q: StatutoryValueQueryDto) {
    return this.rates.valueAsOf(q.key, q.date ?? new Date(), q.currency, q.country);
  }
}
