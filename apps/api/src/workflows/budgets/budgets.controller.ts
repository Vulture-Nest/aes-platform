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
import { CreateBudgetDto, ReviseBudgetDto } from './dto/budget.dto';
import { BudgetsService } from './budgets.service';

@ApiTags('budgets')
@ApiBearerAuth()
@Controller({ path: 'budgets', version: '1' })
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  @Roles(
    Role.FINANCE_OFFICER,
    Role.FINANCE_DIRECTOR,
    Role.OPS_DIRECTOR,
    Role.DIRECTOR,
    Role.SYS_ADMIN,
    Role.AUDITOR,
  )
  @ApiOperation({ summary: 'List budgets (optionally filtered by status)' })
  @ApiQuery({ name: 'status', required: false })
  list(@Query('status') status?: string) {
    return this.budgets.list(status);
  }

  @Get(':id')
  @Roles(
    Role.FINANCE_OFFICER,
    Role.FINANCE_DIRECTOR,
    Role.OPS_DIRECTOR,
    Role.DIRECTOR,
    Role.SYS_ADMIN,
    Role.AUDITOR,
  )
  @ApiOperation({ summary: 'Get a budget with its lines and actuals-vs-budget' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.budgets.findOne(id);
  }

  @Post()
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR)
  @ApiOperation({ summary: 'Create a budget with lines (DRAFT)' })
  create(@Body() dto: CreateBudgetDto, @CurrentUser('id') actorId: string) {
    return this.budgets.create(dto, actorId);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR)
  @ApiOperation({
    summary: 'Submit a budget for PARALLEL co-approval by the Ops Director and Finance Director',
  })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') requesterId: string) {
    return this.budgets.submit(id, requesterId);
  }

  @Post(':id/revise')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR)
  @ApiOperation({
    summary: 'Revise an active budget: clone to a new version (a fresh dual-approval subject)',
  })
  revise(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviseBudgetDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.budgets.revise(id, dto, actorId);
  }
}
