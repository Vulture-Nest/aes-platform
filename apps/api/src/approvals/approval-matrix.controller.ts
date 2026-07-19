import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { ApprovalMatrixService } from './approval-matrix.service';
import { CreateApprovalMatrixDto } from './dto/approval-matrix.dto';

@ApiTags('approvals: matrix')
@ApiBearerAuth()
@Roles('SYS_ADMIN', 'FINANCE_DIRECTOR')
@Controller({ path: 'approval-matrix', version: '1' })
export class ApprovalMatrixController {
  constructor(private readonly matrix: ApprovalMatrixService) {}

  @Post()
  @ApiOperation({ summary: 'Create an approval-matrix rule' })
  create(@Body() dto: CreateApprovalMatrixDto, @CurrentUser('id') actorId: string) {
    return this.matrix.create(dto, actorId);
  }

  @Get()
  @ApiOperation({ summary: 'List approval-matrix rules (optionally by module)' })
  list(@Query('module') module?: string) {
    return this.matrix.list(module);
  }
}
