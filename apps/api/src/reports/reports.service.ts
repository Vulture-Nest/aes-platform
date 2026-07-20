import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { MoneyInOutParams, MoneyInOutService } from '../command-centre/panels/money-in-out.service';
import { PerformancePanelService } from '../command-centre/panels/performance-panel.service';
import { PayrollService } from '../payroll/payroll.service';
import { TimesheetsService } from '../timesheets/timesheets.service';

export interface ExportFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MONEY_FMT = '#,##0.00';

/**
 * Turns the read-only finance/HR services into downloadable artefacts: XLSX workbooks
 * (exceljs), payslip PDFs (pdfkit) and Sage-ready CSV. All data comes from existing
 * services — this layer only formats. Payroll exports audit the actor via the underlying
 * service (payroll privacy, spec §16).
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly performance: PerformancePanelService,
    private readonly moneyInOut: MoneyInOutService,
    private readonly payroll: PayrollService,
    private readonly timesheets: TimesheetsService,
  ) {}

  private async workbookBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
    const data = await wb.xlsx.writeBuffer();
    return Buffer.from(data as ArrayBuffer);
  }

  private styleHeader(row: ExcelJS.Row): void {
    row.font = { bold: true };
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF5EA' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
    });
  }

  // ── Financial summary (P&L) ────────────────────────────────────────────────
  async financialSummaryXlsx(params: { currency?: string; asOf?: Date }): Promise<ExportFile> {
    const p = await this.performance.compute(params);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AES Platform';
    const ws = wb.addWorksheet('Financial Summary');
    ws.columns = [
      { key: 'label', width: 34 },
      { key: 'value', width: 20, style: { numFmt: MONEY_FMT } },
    ];

    ws.addRow(['Financial Summary']).font = { bold: true, size: 16 };
    ws.addRow([`Currency: ${p.currency}`]);
    ws.addRow([`As of: ${new Date(p.asOf).toISOString().slice(0, 10)}`]);
    ws.addRow([]);

    this.styleHeader(ws.addRow(['Income', '']));
    ws.addRow(['Booked order value (ex VAT)', p.bookedOrderValue]);
    ws.addRow(['Serviced order income', p.servicedOrderIncome]);
    ws.addRow(['Contract claims income', p.claimsIncome]);
    ws.addRow(['Total income', p.income]).font = { bold: true };
    ws.addRow([]);

    this.styleHeader(ws.addRow(['Expenses', '']));
    ws.addRow(['Order expenses', p.expenseBreakdown.order]);
    ws.addRow(['General expenses', p.expenseBreakdown.general]);
    ws.addRow(['Overheads', p.expenseBreakdown.overheads]);
    ws.addRow(['Loan interest', p.expenseBreakdown.loanInterest]);
    ws.addRow(['Total expenses', p.expenses]).font = { bold: true };
    ws.addRow([]);

    this.styleHeader(ws.addRow(['Result', '']));
    ws.addRow(['Operating profit', p.operatingProfit]).font = { bold: true };
    const marginRow = ws.addRow(['Margin', p.margin ?? 0]);
    marginRow.getCell('value').numFmt = '0.0%';
    ws.addRow(['Orders', p.orderCount]).getCell('value').numFmt = '0';
    ws.addRow(['Serviced orders', p.servicedOrderCount]).getCell('value').numFmt = '0';

    return {
      filename: `financial-summary-${new Date(p.asOf).toISOString().slice(0, 10)}.xlsx`,
      contentType: XLSX_TYPE,
      body: await this.workbookBuffer(wb),
    };
  }

  // ── Cashflow (money in / out) ──────────────────────────────────────────────
  async cashflowXlsx(params: MoneyInOutParams): Promise<ExportFile> {
    const r = await this.moneyInOut.compute(params);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AES Platform';
    const ws = wb.addWorksheet('Cashflow');
    ws.columns = [
      { header: 'Period', key: 'bucket', width: 18 },
      { header: 'Inflow', key: 'inflow', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Outflow', key: 'outflow', width: 16, style: { numFmt: MONEY_FMT } },
      { header: 'Net', key: 'net', width: 16, style: { numFmt: MONEY_FMT } },
    ];

    ws.addRow([`Cashflow — by ${r.window} (${r.currency})`]).font = { bold: true, size: 14 };
    ws.addRow([]);
    this.styleHeader(ws.addRow(['Period', 'Inflow', 'Outflow', 'Net']));
    for (const b of r.buckets) {
      ws.addRow([b.bucket, b.inflow, b.outflow, b.net]);
    }
    const totalsRow = ws.addRow(['Total', r.totals.inflow, r.totals.outflow, r.totals.net]);
    totalsRow.font = { bold: true };

    return {
      filename: `cashflow-${r.window}.xlsx`,
      contentType: XLSX_TYPE,
      body: await this.workbookBuffer(wb),
    };
  }

  // ── Manhours (timesheet period) ────────────────────────────────────────────
  async manhoursXlsx(periodId: string): Promise<ExportFile> {
    const r = await this.timesheets.manhours(periodId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AES Platform';
    const ws = wb.addWorksheet('Manhours');
    ws.columns = [
      { key: 'worksNo', width: 12 },
      { key: 'name', width: 28 },
      { key: 'normal', width: 12, style: { numFmt: MONEY_FMT } },
      { key: 'ot15', width: 12, style: { numFmt: MONEY_FMT } },
      { key: 'ot20', width: 12, style: { numFmt: MONEY_FMT } },
      { key: 'ug', width: 12, style: { numFmt: MONEY_FMT } },
      { key: 'night', width: 12, style: { numFmt: MONEY_FMT } },
      { key: 'total', width: 12, style: { numFmt: MONEY_FMT } },
    ];

    ws.addRow([`Manhours — ${r.month} (${r.status})`]).font = { bold: true, size: 14 };
    ws.addRow([]);
    this.styleHeader(
      ws.addRow([
        'Works No',
        'Employee',
        'Normal',
        'OT 1.5x',
        'OT 2.0x',
        'UG shift',
        'Night',
        'Total',
      ]),
    );

    const sum = { normal: 0, ot15: 0, ot20: 0, ug: 0, night: 0, total: 0 };
    for (const row of r.rows) {
      ws.addRow([
        row.worksNo,
        row.employeeName,
        row.hoursNormal,
        row.hoursOt15,
        row.hoursOt20,
        row.ugShift,
        row.nightHours,
        row.totalHours,
      ]);
      sum.normal += row.hoursNormal;
      sum.ot15 += row.hoursOt15;
      sum.ot20 += row.hoursOt20;
      sum.ug += row.ugShift;
      sum.night += row.nightHours;
      sum.total += row.totalHours;
    }
    const totalsRow = ws.addRow([
      '',
      'Total',
      sum.normal,
      sum.ot15,
      sum.ot20,
      sum.ug,
      sum.night,
      sum.total,
    ]);
    totalsRow.font = { bold: true };

    return {
      filename: `manhours-${r.month}.xlsx`,
      contentType: XLSX_TYPE,
      body: await this.workbookBuffer(wb),
    };
  }

  // ── Sage journal (payroll run) ─────────────────────────────────────────────
  async sageJournalCsv(runId: string, actorId: string): Promise<ExportFile> {
    const r = await this.payroll.sageJournal(runId, actorId);
    const esc = (v: string | number): string => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [['Account', 'Description', 'Debit', 'Credit', 'Memo'].join(',')];
    for (const row of r.rows) {
      lines.push(
        [
          esc(row.account),
          esc(row.description),
          row.debit.toFixed(2),
          row.credit.toFixed(2),
          esc(row.memo),
        ].join(','),
      );
    }
    lines.push(['TOTAL', '', r.totalDebit.toFixed(2), r.totalCredit.toFixed(2), ''].join(','));

    return {
      filename: `sage-journal-${r.month}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: Buffer.from(lines.join('\r\n'), 'utf-8'),
    };
  }

  // ── Payslips (payroll run) ─────────────────────────────────────────────────
  async payslipsPdf(runId: string, actorId: string): Promise<ExportFile> {
    const r = await this.payroll.payslips(runId, actorId);
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));

    const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

    r.payslips.forEach((slip, idx) => {
      if (idx > 0) doc.addPage();

      doc.fontSize(18).fillColor('#2f7a35').text('AES — Payslip', { align: 'left' });
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor('#666').text(`Pay month: ${r.month}    Site: ${r.siteId}`);
      doc.moveDown(0.5);

      doc.fillColor('#000').fontSize(11);
      const name = [slip.firstName, slip.lastName].filter(Boolean).join(' ') || slip.employeeId;
      doc.text(`Employee: ${name}`);
      doc.text(`Works No: ${slip.worksNo ?? '—'}`);
      if (slip.bankName || slip.accountNo) {
        doc.text(`Bank: ${slip.bankName ?? '—'}    Account: ${slip.accountNo ?? '—'}`);
      }
      doc.moveDown(0.5);

      const section = (title: string, rows: [string, number][]) => {
        doc.moveDown(0.3);
        doc.fontSize(12).fillColor('#2f7a35').text(title);
        doc.fillColor('#000').fontSize(10);
        for (const [label, value] of rows) {
          const y = doc.y;
          doc.text(label, 48, y);
          doc.text(money(value), 400, y, { width: 100, align: 'right' });
          doc.moveDown(0.1);
        }
      };

      section('Earnings', [
        ['Basic (USD)', slip.earnings.basicUsd],
        ['Basic (ZWG)', slip.earnings.basicZwg],
        ['COLA', slip.earnings.cola],
        ['Underground allowance', slip.earnings.ugAllowance],
        ['Night allowance', slip.earnings.nightAllowance],
        ['Other allowances', slip.earnings.otherAllowances],
        ['Gross', slip.earnings.gross],
      ]);

      section('Deductions', [
        ['PAYE', slip.deductions.paye],
        ['AIDS levy', slip.deductions.aidsLevy],
        ['NSSA (employee)', slip.deductions.nssaEe],
        ['Nyaradzo', slip.deductions.nyaradzo],
        ['Other deductions', slip.deductions.otherDeductions],
      ]);

      section('Net pay', [
        ['Net (USD)', slip.net.netUsd],
        ['Net (ZWG)', slip.net.netZwg],
        ['Total net', slip.net.total],
      ]);

      doc.moveDown(1);
      doc
        .fontSize(8)
        .fillColor('#999')
        .text(
          'Confidential — payroll data. Employer statutory contributions are recorded separately.',
          48,
          doc.y,
        );
    });

    if (r.payslips.length === 0) {
      doc.fontSize(12).text('No payslips in this run.');
    }

    doc.end();
    await done;

    return {
      filename: `payslips-${r.month}.pdf`,
      contentType: 'application/pdf',
      body: Buffer.concat(chunks),
    };
  }
}
