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
import {
  CreateWhtRateDto,
  ListWhtRatesQueryDto,
  UpdateWhtRateDto,
  WhtCreditsQueryDto,
  WhtPayableDto,
  WhtSufferedDto,
} from './dto/returns.dto';
import { WhtService } from './wht.service';

@ApiTags('returns-wht')
@ApiBearerAuth()
@Controller({ path: 'returns/wht', version: '1' })
export class WhtController {
  constructor(private readonly wht: WhtService) {}

  // ----- Rates (effective-dated) -----

  @Get('rates')
  @Roles('FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List effective-dated WHT rates' })
  listRates(@Query() query: ListWhtRatesQueryDto) {
    return this.wht.listRates(query);
  }

  @Post('rates')
  @Roles('SYS_ADMIN', 'FINANCE_DIRECTOR')
  @ApiOperation({ summary: 'Create an effective-dated WHT rate' })
  createRate(@Body() dto: CreateWhtRateDto, @CurrentUser('id') actorId: string) {
    return this.wht.createRate(dto, actorId);
  }

  @Patch('rates/:id')
  @Roles('SYS_ADMIN', 'FINANCE_DIRECTOR')
  @ApiOperation({ summary: 'Update a WHT rate' })
  updateRate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWhtRateDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.wht.updateRate(id, dto, actorId);
  }

  @Delete('rates/:id')
  @Roles('SYS_ADMIN', 'FINANCE_DIRECTOR')
  @ApiOperation({ summary: 'Delete a WHT rate' })
  deleteRate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.wht.deleteRate(id, actorId);
  }

  // ----- Transactions -----

  @Post('payable')
  @Roles('FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN')
  @ApiOperation({
    summary: 'Record an outbound payment and auto-withhold WHT when clearance is not held',
  })
  payable(@Body() dto: WhtPayableDto, @CurrentUser('id') actorId: string) {
    return this.wht.payable(dto, actorId);
  }

  @Post('suffered')
  @Roles('FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Record WHT suffered (withheld from us) as an accumulated credit' })
  suffered(@Body() dto: WhtSufferedDto, @CurrentUser('id') actorId: string) {
    return this.wht.suffered(dto, actorId);
  }

  @Get('credits')
  @Roles('FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'WHT-suffered credit summary (total + pending-certificate) by currency' })
  credits(@Query() query: WhtCreditsQueryDto) {
    return this.wht.credits(query);
  }
}
