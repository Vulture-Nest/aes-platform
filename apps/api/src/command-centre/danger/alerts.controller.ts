import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import { AlertService } from './alert.service';
import { ListAlertsQueryDto } from './dto/alert.dto';

@ApiTags('alerts')
@ApiBearerAuth()
@Controller({ path: 'alerts', version: '1' })
export class AlertsController {
  constructor(private readonly alerts: AlertService) {}

  @Get()
  @Roles(
    Role.FINANCE_OFFICER,
    Role.FINANCE_DIRECTOR,
    Role.OPS_DIRECTOR,
    Role.DIRECTOR,
    Role.SYS_ADMIN,
    Role.AUDITOR,
  )
  @ApiOperation({ summary: 'List alerts (optionally active-only / by severity)' })
  list(@Query() query: ListAlertsQueryDto) {
    return this.alerts.list({ activeOnly: query.activeOnly, severity: query.severity });
  }

  @Post(':id/ack')
  @HttpCode(HttpStatus.OK)
  @Roles(
    Role.FINANCE_OFFICER,
    Role.FINANCE_DIRECTOR,
    Role.OPS_DIRECTOR,
    Role.DIRECTOR,
    Role.SYS_ADMIN,
  )
  @ApiOperation({ summary: 'Acknowledge an alert' })
  ack(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.alerts.ack(id, actorId);
  }
}
