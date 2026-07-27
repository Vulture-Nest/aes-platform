import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import {
  CreateSheRecordDto,
  ListSheRecordsQueryDto,
  SheStatsQueryDto,
  UpdateSheRecordDto,
} from './dto/she.dto';
import { SheService } from './she.service';

const READ_ROLES = [
  'SITE_CLERK',
  'SITE_MANAGER',
  'OPS_STAFF',
  'OPS_DIRECTOR',
  'FINANCE_DIRECTOR',
  'DIRECTOR',
  'SYS_ADMIN',
  'AUDITOR',
];
/** Front-line capture: clerks, managers and ops staff log SHE records. */
const CAPTURE_ROLES = ['SITE_CLERK', 'SITE_MANAGER', 'OPS_STAFF', 'SYS_ADMIN'];
/** Investigation / status changes: managers and ops leadership. */
const INVESTIGATE_ROLES = ['SITE_MANAGER', 'OPS_DIRECTOR', 'SYS_ADMIN'];

@ApiTags('she')
@ApiBearerAuth()
@Controller({ path: 'she', version: '1' })
export class SheController {
  constructor(private readonly she: SheService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List SHE records (filter by site/type/status)' })
  list(@Query() query: ListSheRecordsQueryDto) {
    return this.she.list(query);
  }

  @Get('stats')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'TRIFR-style SHE summary (counts by type, LTI, open investigations)' })
  stats(@Query() query: SheStatsQueryDto) {
    return this.she.stats(query);
  }

  @Post()
  @Roles(...CAPTURE_ROLES)
  @ApiOperation({ summary: 'Capture a SHE record at a site' })
  create(@Body() dto: CreateSheRecordDto, @CurrentUser('id') actorId: string) {
    return this.she.create(dto, actorId);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a single SHE record' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.she.findOne(id);
  }

  @Patch(':id')
  @Roles(...INVESTIGATE_ROLES)
  @ApiOperation({ summary: 'Update a SHE record (status / investigation / LTI)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSheRecordDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.she.update(id, dto, actorId);
  }
}
