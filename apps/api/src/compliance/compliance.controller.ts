import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { ComplianceService } from './compliance.service';
import { RemitObligationDto } from './dto/compliance.dto';

@ApiTags('compliance')
@ApiBearerAuth()
@Controller({ path: 'compliance-obligations', version: '1' })
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List statutory compliance obligations (optionally by status)' })
  @ApiQuery({ name: 'status', required: false })
  list(@Query('status') status?: string) {
    return this.compliance.list({ status });
  }

  @Post('from-run/:runId')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Generate compliance obligations from a payroll run’s statutory returns' })
  generate(@Param('runId', ParseUUIDPipe) runId: string, @CurrentUser('id') actorId: string) {
    return this.compliance.generateFromPayrollRun(runId, actorId);
  }

  @Post(':id/remit')
  @HttpCode(HttpStatus.OK)
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Record a statutory remittance against an obligation' })
  remit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemitObligationDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.compliance.remit(id, dto.reference, actorId);
  }
}
