import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
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
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'List contracts' })
  list() {
    return this.contracts.list();
  }

  @Get(':id')
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Get a contract' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.contracts.findOne(id);
  }

  @Post()
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Create a contract' })
  create(@Body() dto: CreateContractDto, @CurrentUser('id') actorId: string) {
    return this.contracts.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Update a contract' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContractDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.contracts.update(id, dto, actorId);
  }
}
