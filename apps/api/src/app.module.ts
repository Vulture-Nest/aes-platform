import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './rbac/roles.guard';
import { AuditModule } from './audit/audit.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    StorageModule,
    AuditModule,
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
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
