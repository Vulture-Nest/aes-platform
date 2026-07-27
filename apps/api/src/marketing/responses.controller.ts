import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import {
  ConvertResponseDto,
  CreateResponseDto,
  ListResponsesQueryDto,
  UpdateResponseStatusDto,
} from './dto/response.dto';
import { ResponsesService } from './responses.service';

const BD_USER = [
  'OPS_STAFF',
  'OPS_DIRECTOR',
  'DIRECTOR',
  'FINANCE_DIRECTOR',
  'SYS_ADMIN',
] as const;

@ApiTags('marketing-responses')
@ApiBearerAuth()
@Controller({ path: 'marketing/responses', version: '1' })
export class ResponsesController {
  constructor(private readonly responses: ResponsesService) {}

  @Get()
  @Roles(...BD_USER, 'AUDITOR')
  @ApiOperation({ summary: 'List inbound campaign responses/leads (filter by status/campaign)' })
  list(@Query() query: ListResponsesQueryDto) {
    return this.responses.list(query);
  }

  @Get(':id')
  @Roles(...BD_USER, 'AUDITOR')
  @ApiOperation({ summary: 'Get an inbound campaign response' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.responses.findOne(id);
  }

  @Post()
  @Roles(...BD_USER)
  @ApiOperation({ summary: 'Capture an inbound campaign response (BD user entry; howHeard required)' })
  create(@Body() dto: CreateResponseDto, @CurrentUser('id') actorId: string) {
    return this.responses.create(dto, actorId);
  }

  @Patch(':id/status')
  @Roles(...BD_USER)
  @ApiOperation({ summary: 'Move a lead status NEW->CONTACTED->QUALIFIED->DEAD' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResponseStatusDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.responses.updateStatus(id, dto.status, actorId);
  }

  @Post(':id/convert')
  @Roles(...BD_USER)
  @ApiOperation({ summary: 'Convert a lead into a CRM opportunity (with campaign attribution)' })
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertResponseDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.responses.convert(id, dto, actorId);
  }
}
