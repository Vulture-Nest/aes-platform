import { Module } from '@nestjs/common';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';
import { PpeController } from './ppe.controller';
import { PpeService } from './ppe.service';
import { SiteReportsController } from './site-reports.controller';
import { SiteReportsService } from './site-reports.service';
import { StoresWithdrawalsController } from './stores-withdrawals.controller';
import { StoresWithdrawalsService } from './stores-withdrawals.service';

/**
 * Long-Contract Monthly Site Reports + Performance/RAG (Additional Features —
 * Prompt 27). Monthly per-site report periods (standard sections, lifecycle,
 * auto-populate from timesheets/projects/finance/stores, Site Manager submit +
 * lock/archive), a stores/withdrawals ledger with drawn-vs-allocation variance,
 * a PPE requirement/issue matrix with compliance %, and KPI targets/actuals with
 * RAG + weighted site scores (cross-site + contract-to-date). PrismaService and
 * AuditService are global.
 */
@Module({
  controllers: [
    SiteReportsController,
    StoresWithdrawalsController,
    PpeController,
    PerformanceController,
  ],
  providers: [SiteReportsService, StoresWithdrawalsService, PpeService, PerformanceService],
  exports: [SiteReportsService, StoresWithdrawalsService, PpeService, PerformanceService],
})
export class SiteReportsModule {}
