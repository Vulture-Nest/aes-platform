import { Module } from '@nestjs/common';
import { DangerModule } from '../command-centre/danger/danger.module';
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
  imports: [DangerModule, PayrollModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
