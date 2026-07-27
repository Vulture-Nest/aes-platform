import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { existsSync } from 'fs';
import * as path from 'path';
import { TaxLedgerConsolidationService } from '../financial/domain/tax-ledger-consolidation.service';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  detectPayrollColumns,
  parseClientRow,
  parseContractPaymentRow,
  parseContractRow,
  parseGeneralExpenseRow,
  parseLoanRow,
  parseOrderExpenseRow,
  parseOrderRow,
  parseOverheadRow,
  parsePayrollRow,
  parseTaxConsolidationInputs,
  parseTaxDebtRow,
  Row,
} from './workbook-parsers';

/** Default entity every imported row is stamped with (seeded). */
const DEFAULT_ENTITY_ID = '00000000-0000-0000-0000-0000000000e1';
/** All cashflow money is USD per the workbook. */
const USD = 'USD';
/** Data starts on row 5 for the cashflow sheets (title/desc/blank/header above). */
const DATA_START = 5;

/** Locate the repo `docs/` dir robustly across dev (ts) and prod (dist) run contexts. */
const DOCS_DIR = (() => {
  const candidates = [
    path.resolve(__dirname, '../../../../docs'),
    path.resolve(process.cwd(), '../../docs'),
    path.resolve(process.cwd(), 'docs'),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0];
})();

/** Prisma transaction client type. */
type Tx = Prisma.TransactionClient;

/** Mutable per-table created/updated tally. */
type Counts = Record<string, { created: number; updated: number }>;

/** Payroll workbook descriptor. */
interface PayrollFile {
  file: string;
  sheet: string;
  station: string;
  month: string;
}

const PAYROLL_FILES: PayrollFile[] = [
  { file: 'Head_Office_Payroll_March_2025.xlsx', sheet: 'Pay Sheet', station: 'Head Office', month: '2025-03' },
  { file: 'Mimosa_Payroll_March_2025.xlsx', sheet: 'Paysheet', station: 'Mimosa', month: '2025-03' },
  { file: 'Unki_Payroll_June_2023.xlsx', sheet: 'Paysheet', station: 'Unki', month: '2023-06' },
];

/** Statutory return types posted to the Returns Hub after payroll import. */
const RETURN_TYPES: Array<{ taxType: string; field: keyof PayrollTotals }> = [
  { taxType: 'PAYE', field: 'paye' },
  { taxType: 'AIDS_LEVY', field: 'aidsLevy' },
  { taxType: 'NSSA', field: 'nssaEe' },
  { taxType: 'MIPF', field: 'mipf' },
  { taxType: 'NEC', field: 'nec' },
  { taxType: 'NYARADZO', field: 'nyaradzo' },
];

interface PayrollTotals {
  paye: number;
  aidsLevy: number;
  nssaEe: number;
  mipf: number;
  nec: number;
  nyaradzo: number;
}

/**
 * Migration importer (spec Appendix A.10 parity rehearsal). Parses the operational
 * workbooks in `docs/` and upserts them into the existing financial + HR tables so
 * the live Command Centre / FinancialSummary services recompute the same figures the
 * spreadsheet showed. Idempotent: everything upserts by natural key (order/loan/
 * contract reference, client name, employee works #, site+month) so re-running never
 * duplicates. Each workbook runs inside its own transaction; payroll/manhours are
 * best-effort and never abort the priority-1 cashflow import.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taxConsolidation: TaxLedgerConsolidationService,
    private readonly ledger: LedgerService,
  ) {}

  private bump(counts: Counts, table: string, created: boolean): void {
    const cell = counts[table] ?? { created: 0, updated: 0 };
    if (created) {
      cell.created += 1;
    } else {
      cell.updated += 1;
    }
    counts[table] = cell;
  }

  /** Read a worksheet's rows into plain arrays (1-based cols), skipping header rows. */
  private async readSheet(file: string, sheetName: string): Promise<Row[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(DOCS_DIR, file));
    const ws = wb.getWorksheet(sheetName);
    if (!ws) {
      throw new Error(`Sheet "${sheetName}" not found in ${file}`);
    }
    const rows: Row[] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const arr: Row = [];
      arr[0] = rowNumber; // stash the 1-based row number at index 0 (col indexes are 1-based)
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        arr[colNumber] = cell.value;
      });
      rows[rowNumber] = arr;
    });
    return rows.filter((r): r is Row => r !== undefined);
  }

  // ── Priority 1: Operational cashflow ────────────────────────────────────────

  async importCashflow(actorId: string | null, counts: Counts): Promise<void> {
    const file = 'Operational_Cashflow_Report.xlsx';
    const [
      clients,
      contracts,
      orders,
      orderExpenses,
      generalExpenses,
      overheads,
      loans,
      contractPayments,
      taxDebt,
    ] = await Promise.all([
      this.readSheet(file, 'Clients'),
      this.readSheet(file, 'Contracts'),
      this.readSheet(file, 'Orders'),
      this.readSheet(file, 'OrderExpenses'),
      this.readSheet(file, 'GeneralExpenses'),
      this.readSheet(file, 'Overheads'),
      this.readSheet(file, 'Loans'),
      this.readSheet(file, 'ContractPayments'),
      this.readSheet(file, 'OtherTaxDebt'),
    ]);

    await this.prisma.$transaction(
      async (tx) => {
        const clientIds = await this.upsertClients(tx, clients, actorId, counts);
        const contractIds = await this.upsertContracts(tx, contracts, clientIds, actorId, counts);
        const orderIds = await this.upsertOrders(tx, orders, clientIds, actorId, counts);
        await this.upsertOrderExpenses(tx, orderExpenses, orderIds, actorId, counts);
        await this.upsertGeneralExpenses(tx, generalExpenses, actorId, counts);
        await this.upsertOverheads(tx, overheads, actorId, counts);
        await this.upsertLoans(tx, loans, actorId, counts);
        await this.upsertContractClaims(tx, contractPayments, contractIds, actorId, counts);
        await this.upsertTaxDebt(tx, taxDebt, actorId, counts);
        await this.consolidateOperationalTax(
          tx,
          { orders, orderExpenses, generalExpenses, overheads, contractPayments },
          taxDebt,
          actorId,
          counts,
        );
      },
      { timeout: 120000 },
    );
  }

  /**
   * Consolidate operational VAT & PAYE (the workbook Tax sheet) into the tax
   * ledger so the Command Centre health verdict reports the same NET VAT PAYABLE
   * and NET PAYE PAYABLE the spreadsheet showed — instead of only the raw
   * brought-forward debt principals.
   *
   * VAT  = output (serviced orders + contract claims) − recoverable input
   *        (order/general/overhead expenses) + VAT brought forward − VAT paid.
   * PAYE = overhead PAYE due + PAYE brought forward − PAYE paid.
   *
   * The pure {@link TaxLedgerConsolidationService} (Appendix A.5) does the maths;
   * brought-forward principals come from the OtherTaxDebt rows. Each net position
   * is stored as a single TaxLedger row (amountDue = net payable, amountPaid = 0)
   * keyed by a stable synthetic reference so re-import replaces rather than
   * appends. A recoverable (negative) net is floored at 0 for the ledger.
   */
  private async consolidateOperationalTax(
    tx: Tx,
    sheets: {
      orders: Row[];
      orderExpenses: Row[];
      generalExpenses: Row[];
      overheads: Row[];
      contractPayments: Row[];
    },
    taxDebtRows: Row[],
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    const inputs = parseTaxConsolidationInputs(sheets, DATA_START);

    // Brought-forward principals from the OtherTaxDebt sheet (VAT vs PAYE).
    let vatBroughtForward = 0;
    let payeBroughtForward = 0;
    for (const row of this.dataRows(taxDebtRows)) {
      const parsed = parseTaxDebtRow(row);
      if (!parsed) {
        continue;
      }
      vatBroughtForward += parsed.vatPrincipal;
      payeBroughtForward += parsed.payePrincipal;
    }

    // Input VAT is expressed as already-computed amounts (not taxable base + rate),
    // so pass a single claimable line at 100% for each recoverable bucket.
    const asClaimableAmount = (amount: number) => ({ taxableAmount: amount, vatRatePct: 100, claimable: true });
    const asOutputAmount = (amount: number) => ({ taxableAmount: amount, vatRatePct: 100 });

    const vat = this.taxConsolidation.consolidateVat({
      servicedOrders: [asOutputAmount(inputs.outputVatServicedOrders)],
      contractClaims: [asOutputAmount(inputs.outputVatContractClaims)],
      flaggedOrders: [asClaimableAmount(inputs.inputVatOrderExpenses)],
      generalExpenses: [asClaimableAmount(inputs.inputVatGeneralExpenses)],
      overheads: [asClaimableAmount(inputs.inputVatOverheads)],
      broughtForwardVatPrincipal: vatBroughtForward,
      vatPaid: inputs.vatPaidOrders + inputs.vatPaidContracts,
    });

    const paye = this.taxConsolidation.consolidatePaye({
      due: inputs.payeDue,
      broughtForward: payeBroughtForward,
      paid: inputs.payePaid,
    });

    await this.upsertOperationalTaxLedger(tx, 'VAT', Math.max(0, vat.netVat), actorId, counts);
    await this.upsertOperationalTaxLedger(tx, 'PAYE', Math.max(0, paye.netPaye), actorId, counts);
  }

  /** Upsert the single consolidated net-payable TaxLedger row for a tax head. */
  private async upsertOperationalTaxLedger(
    tx: Tx,
    taxType: 'VAT' | 'PAYE',
    netPayable: number,
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    // Idempotency key: the synthetic "IMPORT" period for this tax head.
    const periodMonth = 'IMPORT';
    const data = {
      taxType,
      periodMonth,
      currency: USD,
      amountDue: new Prisma.Decimal(netPayable),
      amountPaid: new Prisma.Decimal(0),
      entityId: DEFAULT_ENTITY_ID,
    };
    const existing = await tx.taxLedger.findFirst({
      where: { taxType, periodMonth, entityId: DEFAULT_ENTITY_ID },
    });
    if (existing) {
      await tx.taxLedger.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
      this.bump(counts, 'tax_ledger', false);
    } else {
      await tx.taxLedger.create({ data: { ...data, createdBy: actorId, updatedBy: actorId } });
      this.bump(counts, 'tax_ledger', true);
    }
  }

  private dataRows(rows: Row[]): Row[] {
    // rows[i] is the row whose row.number is i; keep rows at/after DATA_START.
    return rows.filter((r) => typeof r[0] === 'number' && (r[0] as number) >= DATA_START);
  }

  private async upsertClients(
    tx: Tx,
    rows: Row[],
    actorId: string | null,
    counts: Counts,
  ): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const row of this.dataRows(rows)) {
      const parsed = parseClientRow(row);
      if (!parsed) {
        continue;
      }
      const existing = await tx.client.findUnique({ where: { name: parsed.name } });
      if (existing) {
        const updated = await tx.client.update({
          where: { id: existing.id },
          data: { contactEmail: parsed.contactEmail ?? existing.contactEmail, updatedBy: actorId },
        });
        ids.set(parsed.name, updated.id);
        this.bump(counts, 'clients', false);
      } else {
        const created = await tx.client.create({
          data: { name: parsed.name, contactEmail: parsed.contactEmail, createdBy: actorId, updatedBy: actorId },
        });
        ids.set(parsed.name, created.id);
        this.bump(counts, 'clients', true);
      }
    }
    return ids;
  }

  /** Resolve a client id by name, creating a stub client if the master row is absent. */
  private async resolveClient(
    tx: Tx,
    name: string,
    ids: Map<string, string>,
    actorId: string | null,
    counts: Counts,
  ): Promise<string> {
    const cached = ids.get(name);
    if (cached) {
      return cached;
    }
    const existing = await tx.client.findUnique({ where: { name } });
    if (existing) {
      ids.set(name, existing.id);
      return existing.id;
    }
    const created = await tx.client.create({
      data: { name, createdBy: actorId, updatedBy: actorId },
    });
    ids.set(name, created.id);
    this.bump(counts, 'clients', true);
    return created.id;
  }

  private async upsertContracts(
    tx: Tx,
    rows: Row[],
    clientIds: Map<string, string>,
    actorId: string | null,
    counts: Counts,
  ): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const row of this.dataRows(rows)) {
      const parsed = parseContractRow(row);
      if (!parsed) {
        continue;
      }
      const clientId = await this.resolveClient(tx, parsed.clientName, clientIds, actorId, counts);
      const data = {
        clientId,
        valueExVat: new Prisma.Decimal(parsed.valueExVat),
        currency: USD,
        startDate: parsed.startDate ?? new Date(),
        endDate: parsed.endDate ?? new Date(),
        status: parsed.status,
        entityId: DEFAULT_ENTITY_ID,
      };
      const existing = await tx.contract.findFirst({ where: { reference: parsed.reference } });
      if (existing) {
        await tx.contract.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
        ids.set(parsed.reference, existing.id);
        this.bump(counts, 'contracts', false);
      } else {
        const created = await tx.contract.create({
          data: { ...data, reference: parsed.reference, createdBy: actorId, updatedBy: actorId },
        });
        ids.set(parsed.reference, created.id);
        this.bump(counts, 'contracts', true);
      }
    }
    return ids;
  }

  private async upsertOrders(
    tx: Tx,
    rows: Row[],
    clientIds: Map<string, string>,
    actorId: string | null,
    counts: Counts,
  ): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const row of this.dataRows(rows)) {
      const parsed = parseOrderRow(row);
      if (!parsed) {
        continue;
      }
      const clientId = await this.resolveClient(tx, parsed.clientName, clientIds, actorId, counts);
      const data = {
        clientId,
        valueExVat: new Prisma.Decimal(parsed.valueExVat),
        currency: USD,
        closingDate: parsed.closingDate ?? null,
        serviced: parsed.serviced,
        servicedAt: parsed.servicedAt ?? null,
        entityId: DEFAULT_ENTITY_ID,
      };
      let orderId: string;
      const existing = await tx.order.findFirst({ where: { reference: parsed.reference } });
      if (existing) {
        await tx.order.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
        orderId = existing.id;
        this.bump(counts, 'orders', false);
      } else {
        const created = await tx.order.create({
          data: { ...data, reference: parsed.reference, createdBy: actorId, updatedBy: actorId },
        });
        orderId = created.id;
        this.bump(counts, 'orders', true);
      }
      ids.set(parsed.reference, orderId);
      await this.upsertOrderReceipts(tx, orderId, parsed, actorId, counts);
    }
    return ids;
  }

  /**
   * Money received against an order → OrderReceipt. USD-direct (col M) posts as USD;
   * ZiG (col N) converts to USD at the official rate (col O). Idempotent via a stable
   * synthetic reference per order/leg so re-import replaces rather than appends.
   */
  private async upsertOrderReceipts(
    tx: Tx,
    orderId: string,
    parsed: ReturnType<typeof parseOrderRow> & object,
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    const receivedDate = parsed.servicedAt ?? parsed.closingDate ?? parsed.dateIssued ?? new Date();
    const legs: Array<{ ref: string; amount: number }> = [];
    if (parsed.receivedUsd > 0) {
      legs.push({ ref: `IMP:${parsed.reference}:USD`, amount: parsed.receivedUsd });
    }
    if (parsed.receivedZig > 0 && parsed.officialRate > 0) {
      legs.push({ ref: `IMP:${parsed.reference}:ZIG`, amount: parsed.receivedZig / parsed.officialRate });
    }
    for (const leg of legs) {
      const existing = await tx.orderReceipt.findFirst({ where: { orderId, reference: leg.ref } });
      const data = {
        orderId,
        amount: new Prisma.Decimal(leg.amount),
        currency: USD,
        receivedDate,
        reference: leg.ref,
      };
      let receiptId: string;
      if (existing) {
        await tx.orderReceipt.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
        receiptId = existing.id;
        this.bump(counts, 'order_receipts', false);
      } else {
        const created = await tx.orderReceipt.create({ data: { ...data, createdBy: actorId, updatedBy: actorId } });
        receiptId = created.id;
        this.bump(counts, 'order_receipts', true);
      }
      // G14: post the revenue inflow for this receipt (idempotent per receipt id).
      await this.ledger.postOrderReceipt(
        { id: receiptId, amount: leg.amount, currency: USD, createdBy: actorId, receivedDate },
        tx,
      );
    }
  }

  private async upsertOrderExpenses(
    tx: Tx,
    rows: Row[],
    orderIds: Map<string, string>,
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    for (const row of this.dataRows(rows)) {
      const parsed = parseOrderExpenseRow(row);
      if (!parsed) {
        continue;
      }
      const orderId = orderIds.get(parsed.orderRef);
      if (!orderId) {
        continue; // expense against an unknown order — skip rather than orphan.
      }
      // Natural key: order + description + amount. Idempotent replace on re-import.
      const existing = await tx.orderExpense.findFirst({
        where: { orderId, description: parsed.description ?? null, amount: new Prisma.Decimal(parsed.amountExVat) },
      });
      const data = {
        orderId,
        amount: new Prisma.Decimal(parsed.amountExVat),
        currency: USD,
        vatClaimable: parsed.vatPaid,
        description: parsed.description ?? null,
      };
      if (existing) {
        await tx.orderExpense.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
        this.bump(counts, 'order_expenses', false);
      } else {
        await tx.orderExpense.create({ data: { ...data, createdBy: actorId, updatedBy: actorId } });
        this.bump(counts, 'order_expenses', true);
      }
    }
  }

  private async upsertGeneralExpenses(
    tx: Tx,
    rows: Row[],
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    for (const row of this.dataRows(rows)) {
      const parsed = parseGeneralExpenseRow(row);
      if (!parsed) {
        continue;
      }
      const expenseDate = parsed.date ?? new Date();
      // GeneralExpense has no description column; fold the sheet description into category.
      const category = parsed.category ?? parsed.description ?? null;
      const existing = await tx.generalExpense.findFirst({
        where: {
          category,
          amount: new Prisma.Decimal(parsed.amountExVat),
          expenseDate,
        },
      });
      const data = {
        amount: new Prisma.Decimal(parsed.amountExVat),
        currency: USD,
        vatClaimable: parsed.vatPaid,
        category,
        expenseDate,
      };
      if (existing) {
        await tx.generalExpense.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
        this.bump(counts, 'general_expenses', false);
      } else {
        await tx.generalExpense.create({ data: { ...data, createdBy: actorId, updatedBy: actorId } });
        this.bump(counts, 'general_expenses', true);
      }
    }
  }

  /**
   * Overheads sheet is one row per month with several cost columns; the schema stores
   * one Overhead row per (periodMonth, category). We fan the columns out into rows and
   * upsert by (periodMonth, category). PAYE due/paid are handled by the tax ledger, not
   * stored as an overhead.
   */
  private async upsertOverheads(
    tx: Tx,
    rows: Row[],
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    const seen = new Set<string>();
    for (const row of this.dataRows(rows)) {
      const parsed = parseOverheadRow(row);
      if (!parsed || !parsed.month) {
        continue;
      }
      const periodMonth = `${parsed.month.getUTCFullYear()}-${`${parsed.month.getUTCMonth() + 1}`.padStart(2, '0')}`;
      if (seen.has(periodMonth)) {
        continue; // skip the trailing "Sample data" duplicate month row.
      }
      seen.add(periodMonth);
      const buckets: Array<[string, number]> = [
        ['Salaries', parsed.salaries],
        ['Software', parsed.software],
        ['Internet', parsed.internet],
        ['Rentals', parsed.rentals],
        ['Other', parsed.other],
      ];
      for (const [category, amount] of buckets) {
        if (amount === 0) {
          continue;
        }
        const existing = await tx.overhead.findFirst({ where: { periodMonth, category } });
        const data = { amount: new Prisma.Decimal(amount), currency: USD, category, periodMonth };
        if (existing) {
          await tx.overhead.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
          this.bump(counts, 'overheads', false);
        } else {
          await tx.overhead.create({ data: { ...data, createdBy: actorId, updatedBy: actorId } });
          this.bump(counts, 'overheads', true);
        }
      }
    }
  }

  private async upsertLoans(
    tx: Tx,
    rows: Row[],
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    for (const row of this.dataRows(rows)) {
      const parsed = parseLoanRow(row);
      if (!parsed) {
        continue;
      }
      const data = {
        lender: parsed.lender ?? 'Unknown',
        principal: new Prisma.Decimal(parsed.principal),
        currency: USD,
        // Sheet weekly rate is a fraction (0.05); weeklyRatePct is a percent → *100.
        weeklyRatePct: new Prisma.Decimal(parsed.weeklyRate * 100),
        startDate: parsed.dateTaken ?? new Date(),
      };
      let loanId: string;
      const existing = await tx.loan.findFirst({
        where: { lender: data.lender, principal: data.principal, startDate: data.startDate },
      });
      if (existing) {
        await tx.loan.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
        loanId = existing.id;
        this.bump(counts, 'loans', false);
      } else {
        const created = await tx.loan.create({ data: { ...data, createdBy: actorId, updatedBy: actorId } });
        loanId = created.id;
        this.bump(counts, 'loans', true);
      }
      if (parsed.paidUsd > 0) {
        const repaidDate = parsed.dateTaken ?? new Date();
        const existingRep = await tx.loanRepayment.findFirst({
          where: { loanId, amount: new Prisma.Decimal(parsed.paidUsd) },
        });
        const repData = { loanId, amount: new Prisma.Decimal(parsed.paidUsd), currency: USD, repaidDate };
        if (existingRep) {
          await tx.loanRepayment.update({ where: { id: existingRep.id }, data: { ...repData, updatedBy: actorId } });
          this.bump(counts, 'loan_repayments', false);
        } else {
          await tx.loanRepayment.create({ data: { ...repData, createdBy: actorId, updatedBy: actorId } });
          this.bump(counts, 'loan_repayments', true);
        }
      }
    }
  }

  private async upsertContractClaims(
    tx: Tx,
    rows: Row[],
    contractIds: Map<string, string>,
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    for (const row of this.dataRows(rows)) {
      const parsed = parseContractPaymentRow(row);
      if (!parsed) {
        continue;
      }
      const contractId = contractIds.get(parsed.contractRef);
      if (!contractId) {
        continue;
      }
      const claimDate = parsed.claimDate ?? new Date();
      const existing = await tx.contractClaim.findFirst({
        where: { contractId, claimDate, amountExVat: new Prisma.Decimal(parsed.amountExVat) },
      });
      const data = {
        contractId,
        amountExVat: new Prisma.Decimal(parsed.amountExVat),
        currency: USD,
        claimDate,
      };
      let claimId: string;
      if (existing) {
        await tx.contractClaim.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
        claimId = existing.id;
        this.bump(counts, 'contract_claims', false);
      } else {
        const created = await tx.contractClaim.create({ data: { ...data, createdBy: actorId, updatedBy: actorId } });
        claimId = created.id;
        this.bump(counts, 'contract_claims', true);
      }
      // G14: recognise revenue for this claim (DEBIT receivable + CREDIT revenue; idempotent).
      await this.ledger.postContractClaim(
        { id: claimId, amountExVat: parsed.amountExVat, currency: USD, createdBy: actorId, claimDate },
        tx,
      );
    }
  }

  private async upsertTaxDebt(
    tx: Tx,
    rows: Row[],
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    for (const row of this.dataRows(rows)) {
      const parsed = parseTaxDebtRow(row);
      if (!parsed) {
        continue;
      }
      const dueDate = parsed.dueDate ?? new Date();
      // Each debt row carries a single principal (PAYE or VAT); the row's
      // "paid to date" belongs to whichever leg is populated.
      const legs: Array<{ taxType: 'PAYE' | 'VAT'; principal: number }> = [];
      if (parsed.payePrincipal > 0) {
        legs.push({ taxType: 'PAYE', principal: parsed.payePrincipal });
      }
      if (parsed.vatPrincipal > 0) {
        legs.push({ taxType: 'VAT', principal: parsed.vatPrincipal });
      }
      for (const leg of legs) {
        const existing = await tx.otherTaxDebt.findFirst({
          where: { taxType: leg.taxType, dueDate, principal: new Prisma.Decimal(leg.principal) },
        });
        const data = {
          taxType: leg.taxType,
          principal: new Prisma.Decimal(leg.principal),
          paidToDate: new Prisma.Decimal(parsed.paidToDate),
          currency: USD,
          dueDate,
          // Sheet rate is a fraction (0.1); ratePct is a percent → ×100.
          ratePct: new Prisma.Decimal(parsed.ratePct * 100),
          entityId: DEFAULT_ENTITY_ID,
        };
        if (existing) {
          await tx.otherTaxDebt.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
          this.bump(counts, 'other_tax_debt', false);
        } else {
          await tx.otherTaxDebt.create({ data: { ...data, createdBy: actorId, updatedBy: actorId } });
          this.bump(counts, 'other_tax_debt', true);
        }
      }
    }
  }

  // ── Priority 2: Payroll (best-effort) ───────────────────────────────────────

  async importPayroll(actorId: string | null, counts: Counts): Promise<void> {
    for (const pf of PAYROLL_FILES) {
      try {
        await this.importOnePayroll(pf, actorId, counts);
      } catch (err) {
        this.logger.error(`Payroll import failed for ${pf.file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private async importOnePayroll(pf: PayrollFile, actorId: string | null, counts: Counts): Promise<void> {
    const rows = await this.readSheet(pf.file, pf.sheet);
    const row2 = rows.find((r) => r[0] === 2) ?? [];
    const row3 = rows.find((r) => r[0] === 3) ?? [];
    const cols = detectPayrollColumns(row2, row3);
    const dataRows = rows.filter((r) => typeof r[0] === 'number' && (r[0] as number) >= 4);

    const site = await this.prisma.site.findUnique({ where: { name: pf.station } });
    if (!site) {
      this.logger.warn(`Payroll: site "${pf.station}" not found — skipping ${pf.file}`);
      return;
    }

    await this.prisma.$transaction(
      async (tx) => {
        const run = await this.upsertPayrollRun(tx, site.id, pf.month, actorId, counts);
        const totals: PayrollTotals = { paye: 0, aidsLevy: 0, nssaEe: 0, mipf: 0, nec: 0, nyaradzo: 0 };

        for (const row of dataRows) {
          const parsed = parsePayrollRow(row, cols);
          if (!parsed) {
            continue;
          }
          const employeeId = await this.upsertEmployee(tx, parsed.employee, site.id, pf.month, actorId, counts);
          await this.upsertPayrollLine(tx, run.id, employeeId, parsed.line, actorId, counts);
          totals.paye += parsed.line.paye;
          totals.aidsLevy += parsed.line.aidsLevy;
          totals.nssaEe += parsed.line.nssaEe;
          totals.mipf += parsed.line.mipf;
          totals.nec += parsed.line.nec;
          totals.nyaradzo += parsed.line.nyaradzo;
        }

        await this.postStatutoryReturns(tx, pf, totals, actorId, counts);
      },
      { timeout: 120000 },
    );
  }

  private async upsertPayrollRun(
    tx: Tx,
    siteId: string,
    month: string,
    actorId: string | null,
    counts: Counts,
  ) {
    const existing = await tx.payrollRun.findUnique({ where: { siteId_month: { siteId, month } } });
    if (existing) {
      this.bump(counts, 'payroll_runs', false);
      return existing;
    }
    const created = await tx.payrollRun.create({
      data: { siteId, month, status: 'APPROVED', entityId: DEFAULT_ENTITY_ID, createdBy: actorId, updatedBy: actorId },
    });
    this.bump(counts, 'payroll_runs', true);
    return created;
  }

  private async upsertEmployee(
    tx: Tx,
    emp: NonNullable<ReturnType<typeof parsePayrollRow>>['employee'],
    siteId: string,
    month: string,
    actorId: string | null,
    counts: Counts,
  ): Promise<string> {
    const existing = await tx.employee.findUnique({ where: { worksNo: emp.worksNo } });
    const base = {
      firstName: emp.firstName,
      lastName: emp.lastName,
      nationalId: emp.nationalId ?? null,
      nssaNo: emp.nssaNo ?? null,
      grade: emp.grade ?? null,
      occupation: emp.occupation ?? null,
      siteId,
      entityId: DEFAULT_ENTITY_ID,
    };
    if (existing) {
      await tx.employee.update({ where: { id: existing.id }, data: { ...base, updatedBy: actorId } });
      this.bump(counts, 'employees', false);
      return existing.id;
    }
    const created = await tx.employee.create({
      data: {
        worksNo: emp.worksNo,
        ...base,
        employmentType: 'PERMANENT',
        payMode: 'FIXED',
        startDate: new Date(`${month}-01`),
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    this.bump(counts, 'employees', true);
    return created.id;
  }

  private async upsertPayrollLine(
    tx: Tx,
    runId: string,
    employeeId: string,
    line: NonNullable<ReturnType<typeof parsePayrollRow>>['line'],
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    const data = {
      basicUsd: new Prisma.Decimal(line.basicUsd),
      basicZwg: new Prisma.Decimal(line.basicZwg),
      ugAllowance: new Prisma.Decimal(line.ugAllowance),
      nightAllowance: new Prisma.Decimal(line.nightAllowance),
      gross: new Prisma.Decimal(line.gross),
      paye: new Prisma.Decimal(line.paye),
      aidsLevy: new Prisma.Decimal(line.aidsLevy),
      nssaEe: new Prisma.Decimal(line.nssaEe),
      mipf: new Prisma.Decimal(line.mipf),
      nec: new Prisma.Decimal(line.nec),
      nyaradzo: new Prisma.Decimal(line.nyaradzo),
      netUsd: new Prisma.Decimal(line.netUsd),
      netZwg: new Prisma.Decimal(line.netZwg),
    };
    const existing = await tx.payrollLine.findUnique({ where: { runId_employeeId: { runId, employeeId } } });
    if (existing) {
      await tx.payrollLine.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
      this.bump(counts, 'payroll_lines', false);
    } else {
      await tx.payrollLine.create({ data: { runId, employeeId, ...data, createdBy: actorId, updatedBy: actorId } });
      this.bump(counts, 'payroll_lines', true);
    }
  }

  private async postStatutoryReturns(
    tx: Tx,
    pf: PayrollFile,
    totals: PayrollTotals,
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    for (const { taxType, field } of RETURN_TYPES) {
      const amount = totals[field];
      if (amount <= 0) {
        continue;
      }
      const sourceRef = `${pf.station}:${pf.month}`;
      const existing = await tx.statutoryReturn.findFirst({
        where: { taxType, periodMonth: pf.month, entityId: DEFAULT_ENTITY_ID, sourceRef },
      });
      const data = {
        entityId: DEFAULT_ENTITY_ID,
        taxType,
        periodMonth: pf.month,
        currency: USD,
        amountDue: new Prisma.Decimal(amount),
        status: 'DUE',
        source: 'PAYROLL_IMPORT',
        sourceRef,
      };
      if (existing) {
        await tx.statutoryReturn.update({ where: { id: existing.id }, data: { ...data, updatedBy: actorId } });
        this.bump(counts, 'statutory_returns', false);
      } else {
        await tx.statutoryReturn.create({ data: { ...data, createdBy: actorId, updatedBy: actorId } });
        this.bump(counts, 'statutory_returns', true);
      }
    }
  }

  // ── Priority 3: Manhours (best-effort) ──────────────────────────────────────

  async importManhours(actorId: string | null, counts: Counts): Promise<void> {
    const file = 'AES_MANHOURS_2022-23_-NEW.xlsx';
    let wb: ExcelJS.Workbook;
    try {
      wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(path.join(DOCS_DIR, file));
    } catch (err) {
      this.logger.error(`Manhours workbook unreadable: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    for (const ws of wb.worksheets) {
      try {
        await this.importOneManhoursSheet(ws, actorId, counts);
      } catch (err) {
        this.logger.error(`Manhours sheet "${ws.name}" failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * One monthly grid: row 7 headers, row 8 day-numbers across F..AJ (6..36), data from
   * row 9. Each employee's daily hours are written as TimesheetEntry rows against a
   * (site, month) TimesheetPeriod. Best-effort: rows for unknown employees are skipped.
   */
  private async importOneManhoursSheet(
    ws: ExcelJS.Worksheet,
    actorId: string | null,
    counts: Counts,
  ): Promise<void> {
    const month = this.monthFromSheetName(ws.name);
    if (!month) {
      return; // not a monthly grid (e.g. a summary/notes tab).
    }
    // Day numbers live in row 8, columns 6..36 (F..AJ).
    const dayRow = ws.getRow(8);
    const dayCols: Array<{ col: number; day: number }> = [];
    for (let c = 6; c <= 36; c++) {
      const day = Number(dayRow.getCell(c).value);
      if (Number.isInteger(day) && day >= 1 && day <= 31) {
        dayCols.push({ col: c, day });
      }
    }
    if (dayCols.length === 0) {
      return;
    }

    const [year, monthNum] = month.split('-').map(Number);

    for (let r = 9; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const worksNo = this.cellText(row.getCell(5).value); // col E work/company number
      if (!worksNo || !worksNo.toUpperCase().startsWith('AES-E')) {
        continue;
      }
      const employee = await this.prisma.employee.findUnique({ where: { worksNo } });
      if (!employee) {
        continue;
      }
      const period = await this.ensureTimesheetPeriod(employee.siteId, month, actorId, counts);

      for (const { col, day } of dayCols) {
        const hours = Number(row.getCell(col).value);
        if (!Number.isFinite(hours) || hours <= 0) {
          continue;
        }
        const date = new Date(Date.UTC(year, monthNum - 1, day));
        const existing = await this.prisma.timesheetEntry.findUnique({
          where: { periodId_employeeId_date: { periodId: period.id, employeeId: employee.id, date } },
        });
        if (existing) {
          await this.prisma.timesheetEntry.update({
            where: { id: existing.id },
            data: { hoursNormal: new Prisma.Decimal(hours), updatedBy: actorId },
          });
          this.bump(counts, 'timesheet_entries', false);
        } else {
          await this.prisma.timesheetEntry.create({
            data: {
              periodId: period.id,
              employeeId: employee.id,
              date,
              hoursNormal: new Prisma.Decimal(hours),
              createdBy: actorId,
              updatedBy: actorId,
            },
          });
          this.bump(counts, 'timesheet_entries', true);
        }
      }
    }
  }

  private async ensureTimesheetPeriod(
    siteId: string,
    month: string,
    actorId: string | null,
    counts: Counts,
  ) {
    const existing = await this.prisma.timesheetPeriod.findUnique({ where: { siteId_month: { siteId, month } } });
    if (existing) {
      return existing;
    }
    const created = await this.prisma.timesheetPeriod.create({
      data: { siteId, month, createdBy: actorId, updatedBy: actorId },
    });
    this.bump(counts, 'timesheet_periods', true);
    return created;
  }

  /** "OCT 22" → "2022-10"; returns undefined for non-month sheet names. */
  private monthFromSheetName(name: string): string | undefined {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const m = name.trim().toLowerCase().match(/^([a-z]{3})[a-z]*\s*'?(\d{2,4})$/);
    if (!m || !months[m[1]]) {
      return undefined;
    }
    let year = m[2];
    if (year.length === 2) {
      year = `20${year}`;
    }
    return `${year}-${months[m[1]]}`;
  }

  private cellText(value: unknown): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'object' && value !== null && 'result' in value) {
      const r = (value as { result?: unknown }).result;
      return r === null || r === undefined ? undefined : String(r).trim();
    }
    const s = String(value).trim();
    return s === '' ? undefined : s;
  }

  // ── Orchestration ───────────────────────────────────────────────────────────

  /**
   * Run the requested import(s) and return a per-table created/updated summary.
   * Cashflow (P1) runs first and its failure surfaces; payroll (P2) and manhours (P3)
   * are best-effort and their failures are logged into the summary rather than thrown.
   */
  async run(which: 'cashflow' | 'payroll' | 'manhours' | 'all', actorId: string | null) {
    const counts: Counts = {};
    const errors: string[] = [];

    if (which === 'cashflow' || which === 'all') {
      await this.importCashflow(actorId, counts);
    }
    if (which === 'payroll' || which === 'all') {
      try {
        await this.importPayroll(actorId, counts);
      } catch (err) {
        errors.push(`payroll: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (which === 'manhours' || which === 'all') {
      try {
        await this.importManhours(actorId, counts);
      } catch (err) {
        errors.push(`manhours: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { which, perTable: counts, errors };
  }
}
