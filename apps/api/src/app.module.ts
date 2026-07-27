import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { RlsModule } from './rls/rls.module';
import { RlsMiddleware } from './rls/rls.middleware';
import { CryptoModule } from './crypto/crypto.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './rbac/roles.guard';
import { AuditModule } from './audit/audit.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';
import { SitesModule } from './sites/sites.module';
import { ReferenceModule } from './reference/reference.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { LedgerModule } from './ledger/ledger.module';
import { FinancialModule } from './financial/financial.module';
import { RequisitionsModule } from './workflows/requisitions/requisitions.module';
import { TravelModule } from './workflows/travel/travel.module';
import { PettyCashModule } from './workflows/petty-cash/petty-cash.module';
import { BudgetsModule } from './workflows/budgets/budgets.module';
import { DirectorWithdrawalsModule } from './workflows/director-withdrawals/director-withdrawals.module';
import { VatFiscalInvoiceModule } from './workflows/vat-fiscal-invoice/vat-fiscal-invoice.module';
import { DangerModule } from './command-centre/danger/danger.module';
import { CommandCentreModule } from './command-centre/command-centre.module';
import { HrModule } from './hr/hr.module';
import { TimesheetsModule } from './timesheets/timesheets.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PayrollModule } from './payroll/payroll.module';
import { ComplianceModule } from './compliance/compliance.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { CrmModule } from './crm/crm.module';
import { ReportsModule } from './reports/reports.module';
import { JobsModule } from './jobs/jobs.module';
import { EntitiesModule } from './entities/entities.module';
import { MarketingModule } from './marketing/marketing.module';
import { BoardsModule } from './boards/boards.module';
import { ProjectsModule } from './projects/projects.module';
import { ReturnsModule } from './returns/returns.module';
import { PayrollAdjustmentsModule } from './payroll-adjustments/payroll-adjustments.module';
import { SiteReportsModule } from './site-reports/site-reports.module';
import { SheModule } from './she/she.module';
import { DataMigrationModule } from './data-migration/data-migration.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    RlsModule,
    CryptoModule,
    PrismaModule,
    StorageModule,
    AuditModule,
    SettingsModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    SitesModule,
    ReferenceModule,
    ApprovalsModule,
    LedgerModule,
    FinancialModule,
    RequisitionsModule,
    TravelModule,
    PettyCashModule,
    BudgetsModule,
    DirectorWithdrawalsModule,
    VatFiscalInvoiceModule,
    DangerModule,
    CommandCentreModule,
    HrModule,
    TimesheetsModule,
    PayrollModule,
    ComplianceModule,
    AttachmentsModule,
    CrmModule,
    ReportsModule,
    JobsModule,
    EntitiesModule,
    MarketingModule,
    BoardsModule,
    ProjectsModule,
    ReturnsModule,
    PayrollAdjustmentsModule,
    SiteReportsModule,
    SheModule,
    DataMigrationModule,
    HealthModule,
  ],
  providers: [
    // Every route requires a valid JWT unless marked @Public(); then RBAC runs.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // RlsMiddleware first so the RLS AsyncLocalStorage context wraps the whole request.
    consumer.apply(RlsMiddleware, CorrelationIdMiddleware).forRoutes('*');
  }
}
