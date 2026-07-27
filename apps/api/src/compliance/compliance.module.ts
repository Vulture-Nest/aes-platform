import { forwardRef, Module } from '@nestjs/common';
import { DangerModule } from '../command-centre/danger/danger.module';
import { COMPLIANCE_GENERATOR } from '../payroll/payroll.service';
import { PayrollModule } from '../payroll/payroll.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

/**
 * Statutory compliance calendar (spec §13/§16 / Prompt 10). Obligations are generated from an
 * approved payroll run's statutory returns and tracked to remittance; a scheduled sweep raises
 * danger/watch alerts on overdue / due-soon items. PrismaService and AuditService are global;
 * DangerModule supplies AlertService and PayrollModule supplies the statutory-returns source.
 */
@Module({
  imports: [DangerModule, forwardRef(() => PayrollModule)],
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    // Expose ComplianceService under the COMPLIANCE_GENERATOR token so PayrollService can
    // resolve it via forwardRef for the onApproved auto-generation hook (G22), without payroll
    // importing the concrete class (which would create a compile-time import cycle).
    { provide: COMPLIANCE_GENERATOR, useExisting: ComplianceService },
  ],
  exports: [ComplianceService, COMPLIANCE_GENERATOR],
})
export class ComplianceModule {}
