import { Module } from '@nestjs/common';
import { ReferenceModule } from '../reference/reference.module';
import { ClientsController } from './clients/clients.controller';
import { ClientsService } from './clients/clients.service';
import { ContractsController } from './contracts/contracts.controller';
import { ContractsService } from './contracts/contracts.service';
import { LoansController } from './loans/loans.controller';
import { LoansService } from './loans/loans.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { ExpensesService } from './expenses/expenses.service';
import { GeneralExpensesController } from './expenses/general-expenses.controller';
import { OverheadsController } from './expenses/overheads.controller';
import { OrderFinancialsService } from './domain/order-financials.service';
import { OrderFinancialsFacadeService } from './domain/order-financials-facade.service';
import { IncomeTaxProvisionService } from './domain/income-tax-provision.service';
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
  imports: [ReferenceModule],
  controllers: [
    ClientsController,
    ContractsController,
    OrdersController,
    LoansController,
    GeneralExpensesController,
    OverheadsController,
  ],
  providers: [
    ClientsService,
    ContractsService,
    OrdersService,
    LoansService,
    ExpensesService,
    OrderFinancialsService,
    OrderFinancialsFacadeService,
    IncomeTaxProvisionService,
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
    OrderFinancialsFacadeService,
    IncomeTaxProvisionService,
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
