import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { InteractionsService } from './interactions.service';
import { CreateInteractionDto, ListInteractionsQueryDto } from './dto/interaction.dto';

@ApiTags('crm-interactions')
@ApiBearerAuth()
@Controller({ path: 'crm/interactions', version: '1' })
export class InteractionsController {
  constructor(private readonly interactions: InteractionsService) {}

  @Get()
  @Roles(
    Role.OPS_STAFF,
    Role.OPS_DIRECTOR,
    Role.DIRECTOR,
    Role.SYS_ADMIN,
    Role.FINANCE_DIRECTOR,
    Role.AUDITOR,
  )
  @ApiOperation({ summary: 'List CRM interactions (filter by organisationId and/or contactId)' })
  list(@Query() query: ListInteractionsQueryDto) {
    return this.interactions.list(query);
  }

  @Post()
  @Roles(Role.OPS_STAFF, Role.OPS_DIRECTOR, Role.DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Log a CRM interaction (call/visit/email/tender/meeting)' })
  create(@Body() dto: CreateInteractionDto, @CurrentUser('id') actorId: string) {
    return this.interactions.create(dto, actorId);
  }
}
