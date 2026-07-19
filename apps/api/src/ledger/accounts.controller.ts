import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

@ApiTags('accounts')
@ApiBearerAuth()
@Controller({ path: 'accounts', version: '1' })
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'List accounts' })
  list() {
    return this.accounts.list();
  }

  @Get(':id')
  @Roles(Role.FINANCE_OFFICER, Role.FINANCE_DIRECTOR, Role.SYS_ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Get an account' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.findOne(id);
  }

  @Post()
  @Roles(Role.FINANCE_DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Create an account' })
  create(@Body() dto: CreateAccountDto, @CurrentUser('id') actorId: string) {
    return this.accounts.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(Role.FINANCE_DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Update an account' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.accounts.update(id, dto, actorId);
  }
}
