import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { CreateTravelDto, DisburseTravelDto, RetireTravelDto } from './dto/travel.dto';
import { TravelService } from './travel.service';

@ApiTags('travel')
@ApiBearerAuth()
@Controller({ path: 'travel', version: '1' })
export class TravelController {
  constructor(private readonly travel: TravelService) {}

  @Get()
  @Roles(
    Role.SITE_CLERK,
    Role.SITE_MANAGER,
    Role.OPS_STAFF,
    Role.FINANCE_OFFICER,
    Role.FINANCE_DIRECTOR,
    Role.OPS_DIRECTOR,
    Role.DIRECTOR,
    Role.SYS_ADMIN,
    Role.AUDITOR,
  )
  @ApiOperation({ summary: 'List travel requests (optionally filtered by status)' })
  @ApiQuery({ name: 'status', required: false })
  list(@Query('status') status?: string) {
    return this.travel.list(status);
  }

  @Get(':id')
  @Roles(
    Role.SITE_CLERK,
    Role.SITE_MANAGER,
    Role.OPS_STAFF,
    Role.FINANCE_OFFICER,
    Role.FINANCE_DIRECTOR,
    Role.OPS_DIRECTOR,
    Role.DIRECTOR,
    Role.SYS_ADMIN,
    Role.AUDITOR,
  )
  @ApiOperation({ summary: 'Get a travel request' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.travel.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a travel request (DRAFT); per-diem resolved from rate table' })
  create(@Body() dto: CreateTravelDto, @CurrentUser('id') actorId: string) {
    return this.travel.create(dto, actorId);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a travel request into the approval engine (merit-only)' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') requesterId: string) {
    return this.travel.submit(id, requesterId);
  }

  @Post(':id/disburse')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR)
  @ApiOperation({
    summary: 'Record an advance disbursement: post the ledger outflow, move to DISBURSED',
  })
  disburse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisburseTravelDto,
    @CurrentUser('id') financeUserId: string,
  ) {
    return this.travel.disburse(id, financeUserId, dto);
  }

  @Post(':id/retire')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR)
  @ApiOperation({
    summary: 'Retire a disbursed advance: reconcile refundDue/refundOwed and close it',
  })
  retire(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetireTravelDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.travel.retire(id, actorId, dto);
  }
}
