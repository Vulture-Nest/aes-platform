import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { ActingService } from './acting.service';
import { BackPayService } from './back-pay.service';
import {
  ActingRegisterQueryDto,
  ComputeActingForRunDto,
  CreateActingAssignmentDto,
} from './dto/acting.dto';
import { CreateBackPayBatchDto } from './dto/back-pay.dto';

@ApiTags('payroll-adjustments')
@ApiBearerAuth()
@Controller({ path: 'payroll-adjustments', version: '1' })
export class PayrollAdjustmentsController {
  constructor(
    private readonly backPay: BackPayService,
    private readonly acting: ActingService,
  ) {}

  // ---------------------------------------------------------------------------
  // Back-pay
  // ---------------------------------------------------------------------------

  @Get('back-pay')
  @Roles('FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List back-pay batches' })
  listBatches(@Query('entityId') entityId?: string) {
    return this.backPay.list(entityId);
  }

  @Get('back-pay/:id')
  @Roles('FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'Get a back-pay batch with per-employee workings (auditable)' })
  getBatch(@Param('id', ParseUUIDPipe) id: string) {
    return this.backPay.findOne(id);
  }

  @Post('back-pay')
  @Roles('FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({
    summary:
      'Create a DRAFT back-pay batch from gazetted new rates; recompute old vs new per employee×period',
  })
  createBatch(@Body() dto: CreateBackPayBatchDto, @CurrentUser('id') actorId: string) {
    return this.backPay.createBatch(dto, actorId);
  }

  @Post('back-pay/:id/submit')
  @Roles('FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Submit a DRAFT back-pay batch for approval' })
  submitBatch(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.backPay.submit(id, actorId);
  }

  @Post('back-pay/:id/approve')
  @Roles('FINANCE_DIRECTOR')
  @ApiOperation({
    summary: 'Approve a back-pay batch; emit one PayrollExtraEarning (BACK_PAY) per employee',
  })
  approveBatch(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
    @Body('approvalRef') approvalRef?: string,
  ) {
    return this.backPay.approve(id, actorId, approvalRef);
  }

  // ---------------------------------------------------------------------------
  // Acting allowances
  // ---------------------------------------------------------------------------

  @Get('acting')
  @Roles('SITE_MANAGER', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'Acting register: who acted in what, how long, and cost (from=&to=)' })
  register(@Query() query: ActingRegisterQueryDto) {
    return this.acting.register(query);
  }

  @Get('acting/:id')
  @Roles('SITE_MANAGER', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'Get an acting assignment' })
  getActing(@Param('id', ParseUUIDPipe) id: string) {
    return this.acting.findOne(id);
  }

  @Post('acting')
  @Roles('SITE_MANAGER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Create a DRAFT acting assignment (rejects overlapping assignments)' })
  createActing(@Body() dto: CreateActingAssignmentDto, @CurrentUser('id') actorId: string) {
    return this.acting.create(dto, actorId);
  }

  @Post('acting/:id/submit')
  @Roles('SITE_MANAGER', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Submit a DRAFT acting assignment for approval (Site Manager)' })
  submitActing(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.acting.submit(id, actorId);
  }

  @Post('acting/:id/approve')
  @Roles('FINANCE_DIRECTOR')
  @ApiOperation({ summary: 'Approve a submitted acting assignment (Finance Director)' })
  approveActing(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
    @Body('approvalRef') approvalRef?: string,
  ) {
    return this.acting.approve(id, actorId, approvalRef);
  }

  @Post('acting/compute-for-run')
  @Roles('FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({
    summary:
      'Pro-rate an approved acting allowance across a run month and emit a PayrollExtraEarning',
  })
  computeForRun(@Body() dto: ComputeActingForRunDto, @CurrentUser('id') actorId: string) {
    return this.acting.computeActingForRun(dto, actorId);
  }
}
