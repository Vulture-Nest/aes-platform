import { Module } from '@nestjs/common';
import { ReferenceModule } from '../reference/reference.module';
import { ApprovalMatrixController } from './approval-matrix.controller';
import { ApprovalMatrixService } from './approval-matrix.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalService } from './approval.service';
import { StatusTransitionRegistry } from './status-transition.registry';

/**
 * Generic approval engine (spec S2). Exports ApprovalService and the transition
 * registry so downstream modules (S5+) can submit subjects and react to outcomes.
 */
@Module({
  imports: [ReferenceModule],
  controllers: [ApprovalMatrixController, ApprovalsController],
  providers: [ApprovalService, ApprovalMatrixService, StatusTransitionRegistry],
  exports: [ApprovalService, StatusTransitionRegistry],
})
export class ApprovalsModule {}
