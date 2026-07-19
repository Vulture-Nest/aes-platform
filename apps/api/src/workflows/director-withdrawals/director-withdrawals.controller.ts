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
import {
  CompleteDirectorWithdrawalDto,
  CreateDirectorWithdrawalDto,
} from './dto/director-withdrawal.dto';
import { DirectorWithdrawalsService } from './director-withdrawals.service';

@ApiTags('director-withdrawals')
@ApiBearerAuth()
@Controller({ path: 'director-withdrawals', version: '1' })
export class DirectorWithdrawalsController {
  constructor(private readonly withdrawals: DirectorWithdrawalsService) {}

  @Get()
  @Roles('DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List director withdrawals (optionally filtered by status)' })
  @ApiQuery({ name: 'status', required: false })
  list(@Query('status') status?: string) {
    return this.withdrawals.list(status);
  }

  @Get(':id')
  @Roles('DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'Get a director withdrawal' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.withdrawals.findOne(id);
  }

  @Post()
  @Roles('DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Raise a director withdrawal (DRAFT)' })
  create(@Body() dto: CreateDirectorWithdrawalDto, @CurrentUser('id') actorId: string) {
    return this.withdrawals.create(dto, actorId);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Submit for co-approval by a SECOND director (merit-only)' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') requesterId: string) {
    return this.withdrawals.submit(id, requesterId);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @Roles('DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({
    summary:
      'Record the human transfer that completes a posted withdrawal (completer != requester)',
  })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteDirectorWithdrawalDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.withdrawals.complete(id, userId, dto);
  }
}
