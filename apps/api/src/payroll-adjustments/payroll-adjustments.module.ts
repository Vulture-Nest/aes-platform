import { Module } from '@nestjs/common';
import { ActingService } from './acting.service';
import { BackPayService } from './back-pay.service';
import { PayrollAdjustmentsController } from './payroll-adjustments.controller';

/**
 * Back-Pay + Acting Allowances (Additional Features — Prompt 27). Back-pay batches recompute
 * old-vs-new pay per employee×period from a gazetted rate change (historical runs stay locked)
 * and, on Finance-Director approval, emit one PayrollExtraEarning (kind BACK_PAY) per employee.
 * Acting assignments (FIXED/PERCENT) are overlap-validated, approved Site-Manager→Finance-
 * Director, and pro-rated into a run via computeActingForRun (kind ACTING_ALLOWANCE). The next
 * payroll run consumes these extra earnings. PrismaService and AuditService are global.
 */
@Module({
  controllers: [PayrollAdjustmentsController],
  providers: [BackPayService, ActingService],
  exports: [BackPayService, ActingService],
})
export class PayrollAdjustmentsModule {}
