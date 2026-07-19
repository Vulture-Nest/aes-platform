import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { CreateLoanDto, CreateLoanRepaymentDto } from './dto/loan.dto';
import { LoansService } from './loans.service';

@ApiTags('loans')
@ApiBearerAuth()
@Controller({ path: 'loans', version: '1' })
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get()
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'List loans' })
  list() {
    return this.loans.list();
  }

  @Get(':id')
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Get a loan (with repayments)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.loans.findOne(id);
  }

  @Post()
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Create a loan' })
  create(@Body() dto: CreateLoanDto, @CurrentUser('id') actorId: string) {
    return this.loans.create(dto, actorId);
  }

  @Post(':id/repayments')
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Record a repayment against a loan' })
  recordRepayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLoanRepaymentDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.loans.recordRepayment(id, dto, actorId);
  }
}
