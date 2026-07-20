import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { APPROVAL_MODES, APPROVAL_MODULES } from './approval-options';
import { ApprovalMatrixService } from './approval-matrix.service';
import { CreateApprovalMatrixDto, UpdateApprovalMatrixDto } from './dto/approval-matrix.dto';

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

  @Get('options')
  @ApiOperation({ summary: 'Engine-defined approval modes and modules (read-only)' })
  options() {
    return { modes: APPROVAL_MODES, modules: APPROVAL_MODULES };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Enable or disable an approval-matrix rule' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApprovalMatrixDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.matrix.update(id, dto, actorId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an approval-matrix rule' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.matrix.remove(id, actorId);
  }
}
