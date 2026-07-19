import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { CreateExchangeRateDto, RateAsOfQueryDto } from './dto/exchange-rate.dto';
import { ExchangeRatesService } from './exchange-rates.service';
import { RateType } from './rate-type.enum';

@ApiTags('reference: exchange-rates')
@ApiBearerAuth()
@Controller({ path: 'exchange-rates', version: '1' })
export class ExchangeRatesController {
  constructor(private readonly rates: ExchangeRatesService) {}

  @Post()
  @Roles('FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Record an effective-dated FX rate (append-only)' })
  create(@Body() dto: CreateExchangeRateDto, @CurrentUser('id') actorId: string) {
    return this.rates.create(dto, actorId);
  }

  @Get()
  @ApiOperation({ summary: 'List FX rates (optionally by pair)' })
  list(@Query('pair') pair?: string) {
    return this.rates.list(pair);
  }

  @Get('as-of')
  @ApiOperation({ summary: 'Resolve the rate effective on a date (official|parallel)' })
  asOf(@Query() q: RateAsOfQueryDto) {
    return this.rates.rateAsOf(q.pair, q.date ?? new Date(), q.type ?? RateType.OFFICIAL);
  }
}
