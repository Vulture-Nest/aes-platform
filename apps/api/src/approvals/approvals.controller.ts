import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { Roles } from '../rbac/roles.decorator';
import { ApprovalService } from './approval.service';
import { DecideDto } from './dto/decide.dto';
import { SubmitDto } from './dto/submit.dto';

@ApiTags('approvals')
@ApiBearerAuth()
@Controller({ path: 'approvals', version: '1' })
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get('inbox')
  @ApiOperation({ summary: 'PENDING approval steps awaiting the current user' })
  inbox(@CurrentUser() user: AuthenticatedUser) {
    const roles = [...new Set(user.roles.map((r) => r.role))];
    return this.approvals.inbox({ id: user.id, roles });
  }

  @Post(':id/decide')
  @ApiOperation({ summary: 'Approve / reject / return an approval step' })
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.approvals.decide({
      approvalId: id,
      approverUserId: user.id,
      approverRoles: user.roles.map((r) => ({ siteId: r.siteId, role: r.role })),
      decision: dto.decision,
      comment: dto.comment,
    });
  }

  @Post('submit')
  @Roles('SYS_ADMIN')
  @ApiOperation({ summary: 'Submit a subject into the approval engine (testing / SYS_ADMIN)' })
  submit(@Body() dto: SubmitDto) {
    return this.approvals.submit({
      module: dto.module,
      subjectTable: dto.subjectTable,
      subjectId: dto.subjectId,
      amount: dto.amount,
      currency: dto.currency,
      siteId: dto.siteId,
      requesterId: dto.requesterId,
    });
  }
}
