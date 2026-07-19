import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ReferenceModule } from '../reference/reference.module';
import { GrossBuildupService } from './calculators/gross-buildup.service';
import { NssaService } from './calculators/nssa.service';
import { PayeService } from './calculators/paye.service';
import { EmployerStatutoryService } from './calculators/statutory-employer.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

/**
 * Payroll engine (spec §13 / Prompt 10). Builds monthly runs from SITE_APPROVED/LOCKED
 * timesheets, computes gross + statutory from effective config via the pure calculators, and
 * drives the Finance-Director approval chain (module 'payroll_run') — posting the employer
 * cost to the shared ledger when the chain resolves APPROVED. PrismaService, AuditService and
 * LedgerService are global; ApprovalsModule supplies the engine + transition registry and
 * ReferenceModule supplies StatutoryRatesService.
 */
@Module({
  imports: [ApprovalsModule, ReferenceModule],
  controllers: [PayrollController],
  providers: [
    PayrollService,
    GrossBuildupService,
    PayeService,
    NssaService,
    EmployerStatutoryService,
  ],
  exports: [PayrollService],
})
export class PayrollModule {}
