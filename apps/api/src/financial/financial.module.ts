import { Module } from '@nestjs/common';
import { ClientsController } from './clients/clients.controller';
import { ClientsService } from './clients/clients.service';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';
import { LoansController } from './loans/loans.controller';
import { LoansService } from './loans/loans.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { OrderFinancialsService } from './domain/order-financials.service';
import { OrderHealthService } from './domain/order-health.service';
import { ContractVarianceService } from './domain/contract-variance.service';
import { LoanInterestService } from './domain/loan-interest.service';
import { TaxLedgerConsolidationService } from './domain/tax-ledger-consolidation.service';
import { ZimraReconciliationService } from './domain/zimra-reconciliation.service';
import { PerformanceService } from './domain/performance.service';
import { HealthVerdictService } from './domain/health-verdict.service';

/**
 * S3 financial core (spec Prompt 4). Table-driven CRUD for the money entities,
 * plus the Appendix A domain calculation services (pure, reusable).
 */
@Module({
  controllers: [ClientsController, ContractsController, OrdersController, LoansController],
  providers: [
    ClientsService,
    ContractsService,
    OrdersService,
    LoansService,
    OrderFinancialsService,
    OrderHealthService,
    ContractVarianceService,
    LoanInterestService,
    TaxLedgerConsolidationService,
    ZimraReconciliationService,
    PerformanceService,
    HealthVerdictService,
  ],
  exports: [
    ClientsService,
    ContractsService,
    OrdersService,
    LoansService,
    OrderFinancialsService,
    OrderHealthService,
    ContractVarianceService,
    LoanInterestService,
    TaxLedgerConsolidationService,
    ZimraReconciliationService,
    PerformanceService,
    HealthVerdictService,
  ],
})
export class FinancialModule {}
