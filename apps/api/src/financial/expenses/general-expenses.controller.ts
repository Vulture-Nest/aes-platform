import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { CreateGeneralExpenseDto } from './dto/general-expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('general-expenses')
@ApiBearerAuth()
@Controller({ path: 'general-expenses', version: '1' })
export class GeneralExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List general (non-order) expenses' })
  list() {
    return this.expenses.listGeneral();
  }

  @Post()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Record a general expense' })
  create(@Body() dto: CreateGeneralExpenseDto, @CurrentUser('id') actorId: string) {
    return this.expenses.createGeneral(dto, actorId);
  }
}
