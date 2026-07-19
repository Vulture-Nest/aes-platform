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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { CreateRequisitionDto, DisburseRequisitionDto } from './dto/requisition.dto';
import { RequisitionsService } from './requisitions.service';

@ApiTags('requisitions')
@ApiBearerAuth()
@Controller({ path: 'requisitions', version: '1' })
export class RequisitionsController {
  constructor(private readonly requisitions: RequisitionsService) {}

  @Get()
  @Roles(
    'SITE_CLERK',
    'SITE_MANAGER',
    'OPS_STAFF',
    'FINANCE_OFFICER',
    'FINANCE_DIRECTOR',
    'OPS_DIRECTOR',
    'DIRECTOR',
    'SYS_ADMIN',
    'AUDITOR',
  )
  @ApiOperation({ summary: 'List cash requisitions (optionally filtered by status)' })
  @ApiQuery({ name: 'status', required: false })
  list(@Query('status') status?: string) {
    return this.requisitions.list(status);
  }

  @Get(':id')
  @Roles(
    'SITE_CLERK',
    'SITE_MANAGER',
    'OPS_STAFF',
    'FINANCE_OFFICER',
    'FINANCE_DIRECTOR',
    'OPS_DIRECTOR',
    'DIRECTOR',
    'SYS_ADMIN',
    'AUDITOR',
  )
  @ApiOperation({ summary: 'Get a cash requisition' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.requisitions.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a cash requisition (DRAFT)' })
  create(@Body() dto: CreateRequisitionDto, @CurrentUser('id') actorId: string) {
    return this.requisitions.create(dto, actorId);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a requisition into the approval engine (merit-only)' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') requesterId: string) {
    return this.requisitions.submit(id, requesterId);
  }

  @Post(':id/disburse')
  @HttpCode(HttpStatus.OK)
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR')
  @ApiOperation({
    summary: 'Record a disbursement: post the ledger outflow and close the requisition',
  })
  disburse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisburseRequisitionDto,
    @CurrentUser('id') financeUserId: string,
  ) {
    return this.requisitions.disburse(id, financeUserId, dto);
  }
}
