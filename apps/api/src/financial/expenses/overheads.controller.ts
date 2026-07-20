import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { CreateOverheadDto } from './dto/overhead.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('overheads')
@ApiBearerAuth()
@Controller({ path: 'overheads', version: '1' })
export class OverheadsController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List overheads' })
  list() {
    return this.expenses.listOverheads();
  }

  @Post()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Record an overhead' })
  create(@Body() dto: CreateOverheadDto, @CurrentUser('id') actorId: string) {
    return this.expenses.createOverhead(dto, actorId);
  }
}
