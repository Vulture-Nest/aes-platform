import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { CreateDelegationDto } from './dto/delegation.dto';
import { DelegationService } from './delegation.service';

@ApiTags('reference: delegation')
@ApiBearerAuth()
@Controller({ path: 'delegation-rules', version: '1' })
export class DelegationController {
  constructor(private readonly delegation: DelegationService) {}

  @Post()
  @Roles('FINANCE_DIRECTOR', 'OPS_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Create an approver → alternate delegation window' })
  create(@Body() dto: CreateDelegationDto, @CurrentUser('id') actorId: string) {
    return this.delegation.create(dto, actorId);
  }

  @Get()
  @ApiOperation({ summary: 'List delegation rules (optionally by approver)' })
  list(@Query('approverUserId') approverUserId?: string) {
    return this.delegation.list(approverUserId);
  }
}
