import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { CreateTravelRateDto } from './dto/travel-rate.dto';
import { TravelRatesService } from './travel-rates.service';

@ApiTags('travel-rates')
@ApiBearerAuth()
@Controller({ path: 'travel-rates', version: '1' })
export class TravelRatesController {
  constructor(private readonly rates: TravelRatesService) {}

  @Get()
  @Roles('FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'List per-diem travel rates (optionally filtered by grade)' })
  @ApiQuery({ name: 'grade', required: false })
  list(@Query('grade') grade?: string) {
    return this.rates.list(grade);
  }

  @Post()
  @Roles('FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Create an effective-dated per-diem travel rate' })
  create(@Body() dto: CreateTravelRateDto, @CurrentUser('id') actorId: string) {
    return this.rates.create(dto, actorId);
  }
}
