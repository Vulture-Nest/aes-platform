import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../rbac/roles.decorator';
import { DangerEngineService } from './danger-engine.service';

@ApiTags('danger-engine')
@ApiBearerAuth()
@Controller({ path: 'danger-engine', version: '1' })
export class DangerEngineController {
  constructor(private readonly engine: DangerEngineService) {}

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @Roles('SYS_ADMIN')
  @ApiOperation({ summary: 'Manually trigger a danger-engine evaluation pass (testing)' })
  evaluate() {
    return this.engine.evaluate();
  }
}
