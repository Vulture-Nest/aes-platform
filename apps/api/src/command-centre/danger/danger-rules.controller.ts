import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { DangerRulesService } from './danger-rules.service';
import { CreateDangerRuleDto, UpdateDangerRuleDto } from './dto/danger-rule.dto';

@ApiTags('danger-rules')
@ApiBearerAuth()
@Controller({ path: 'danger-rules', version: '1' })
export class DangerRulesController {
  constructor(private readonly rules: DangerRulesService) {}

  @Get()
  @Roles('SYS_ADMIN', 'FINANCE_DIRECTOR')
  @ApiOperation({ summary: 'List danger rules' })
  list() {
    return this.rules.list();
  }

  @Post()
  @Roles('SYS_ADMIN', 'FINANCE_DIRECTOR')
  @ApiOperation({ summary: 'Create a danger rule' })
  create(@Body() dto: CreateDangerRuleDto, @CurrentUser('id') actorId: string) {
    return this.rules.create(dto, actorId);
  }

  @Patch(':id')
  @Roles('SYS_ADMIN', 'FINANCE_DIRECTOR')
  @ApiOperation({ summary: 'Update a danger rule (params/severity/enabled)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDangerRuleDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.rules.update(id, dto, actorId);
  }
}
