import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { ContractsService } from './contracts.service';
import { CreateContractDto, UpdateContractDto } from './dto/contract.dto';

@ApiTags('contracts')
@ApiBearerAuth()
@Controller({ path: 'contracts', version: '1' })
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List contracts' })
  list() {
    return this.contracts.list();
  }

  @Get(':id')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'Get a contract' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.findOne(id);
  }

  @Post()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Create a contract' })
  create(@Body() dto: CreateContractDto, @CurrentUser('id') actorId: string) {
    return this.contracts.create(dto, actorId);
  }

  @Patch(':id')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Update a contract' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.contracts.update(id, dto, actorId);
  }
}
