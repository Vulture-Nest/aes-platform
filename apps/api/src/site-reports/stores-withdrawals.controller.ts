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
  CreateStoresWithdrawalDto,
  ListStoresWithdrawalsQueryDto,
  UpdateStoresWithdrawalDto,
} from './dto/stores-withdrawal.dto';
import { StoresWithdrawalsService } from './stores-withdrawals.service';

const READ_ROLES = [
  'SITE_MANAGER',
  'OPS_STAFF',
  'OPS_DIRECTOR',
  'FINANCE_DIRECTOR',
  'DIRECTOR',
  'SYS_ADMIN',
  'AUDITOR',
];
const WRITE_ROLES = ['SITE_MANAGER', 'OPS_STAFF', 'OPS_DIRECTOR', 'SYS_ADMIN'];

@ApiTags('site-reports-stores')
@ApiBearerAuth()
@Controller({ path: 'site-reports/stores-withdrawals', version: '1' })
export class StoresWithdrawalsController {
  constructor(private readonly stores: StoresWithdrawalsService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List stores withdrawals (with drawn-vs-allocation variance flag)' })
  list(@Query() query: ListStoresWithdrawalsQueryDto) {
    return this.stores.list(query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a stores withdrawal' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.stores.findOne(id);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Record a stores withdrawal (fuel/oil/material/tool)' })
  create(@Body() dto: CreateStoresWithdrawalDto, @CurrentUser('id') actorId: string) {
    return this.stores.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Update a stores withdrawal' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStoresWithdrawalDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.stores.update(id, dto, actorId);
  }

  @Delete(':id')
  @Roles('OPS_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Delete a stores withdrawal' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.stores.remove(id, actorId);
  }
}
