/**
 * Pure, dependency-free parsing helpers for the workbook importer.
 *
 * These take raw cell rows (arrays indexed by 1-based column, mirroring exceljs
 * `row.getCell(n).value`) and turn them into typed upsert payloads. Keeping them
 * pure makes the money/date coercion + column mapping unit-testable without ever
 * touching the real .xlsx files or Prisma.
 *
 * exceljs returns formula cells as `{ formula, result }`; plain cells as string
 * | number | Date | null. `cellNum`/`cellStr`/`cellDate` normalise all of those.
 */

/** A single sheet row as exceljs exposes it: index 0 is unused, data at [1..N]. */
export type Row = Array<unknown>;

/** exceljs formula-cell shape. */
interface FormulaCell {
  formula?: string;
  result?: unknown;
}

function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && 'result' in (value as FormulaCell)) {
    return (value as FormulaCell).result;
  }
  if (value && typeof value === 'object' && 'text' in (value as { text?: unknown })) {
    // Rich-text / hyperlink cell.
    return (value as { text?: unknown }).text;
  }
  return value;
}

/** Coerce a cell to a number; blank / non-numeric → 0. */
export function cellNum(value: unknown): number {
  const v = unwrap(value);
  if (v === null || v === undefined || v === '') {
    return 0;
  }
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : 0;
  }
  const n = Number(String(v).replace(/[,$\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Coerce a cell to a trimmed string; blank → undefined. */
export function cellStr(value: unknown): string | undefined {
  const v = unwrap(value);
  if (v === null || v === undefined) {
    return undefined;
  }
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/** Coerce a cell to a Date; blank / invalid → undefined. */
export function cellDate(value: unknown): Date | undefined {
  const v = unwrap(value);
  if (v === null || v === undefined || v === '') {
    return undefined;
  }
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? undefined : v;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** "Yes"/"Y"/"true"/1 → true; everything else false. */
export function cellBool(value: unknown): boolean {
  const s = cellStr(value);
  if (s === undefined) {
    return false;
  }
  const lower = s.toLowerCase();
  return lower === 'yes' || lower === 'y' || lower === 'true' || lower === '1';
}

// ── Parsed row shapes (mirror the target Prisma models, sans FKs the service adds) ──

export interface ParsedClient {
  name: string;
  contactEmail?: string;
}

export interface ParsedContract {
  reference: string;
  clientName: string;
  title?: string;
  valueExVat: number;
  startDate?: Date;
  endDate?: Date;
  status: string;
}

export interface ParsedOrder {
  reference: string;
  clientName: string;
  title?: string;
  valueExVat: number;
  closingDate?: Date;
  dateIssued?: Date;
  serviced: boolean;
  servicedAt?: Date;
  receivedUsd: number;
  receivedZig: number;
  officialRate: number;
}

export interface ParsedOrderExpense {
  orderRef: string;
  date?: Date;
  description?: string;
  category?: string;
  amountExVat: number;
  vatPaid: boolean;
}

export interface ParsedGeneralExpense {
  date?: Date;
  description?: string;
  category?: string;
  amountExVat: number;
  vatPaid: boolean;
}

export interface ParsedOverhead {
  month?: Date;
  salaries: number;
  software: number;
  internet: number;
  rentals: number;
  other: number;
  comment?: string;
}

export interface ParsedLoan {
  reference: string;
  lender?: string;
  dateTaken?: Date;
  principal: number;
  weeklyRate: number;
  paidUsd: number;
}

export interface ParsedContractPayment {
  claimDate?: Date;
  contractRef: string;
  description?: string;
  amountExVat: number;
  /** Output VAT received on the contract claim (workbook col G). */
  vatReceived: number;
  /** VAT already remitted to ZIMRA against this claim (workbook col H). */
  vatPaidToDate: number;
}

export interface ParsedTaxDebt {
  description?: string;
  dueDate?: Date;
  payePrincipal: number;
  vatPrincipal: number;
  ratePct: number;
  /** Amount already paid against this brought-forward debt (workbook col I). */
  paidToDate: number;
}

// ── Per-sheet row parsers (fixed columns per the mapping doc) ──

/** Clients sheet: A name | D email. */
export function parseClientRow(row: Row): ParsedClient | null {
  const name = cellStr(row[1]);
  if (!name) {
    return null;
  }
  return { name, contactEmail: cellStr(row[4]) };
}

/** Contracts: A ref | B client | C title | D value | E start | F end | M status. */
export function parseContractRow(row: Row): ParsedContract | null {
  const reference = cellStr(row[1]);
  const clientName = cellStr(row[2]);
  if (!reference || !clientName) {
    return null;
  }
  return {
    reference,
    clientName,
    title: cellStr(row[3]),
    valueExVat: cellNum(row[4]),
    startDate: cellDate(row[5]),
    endDate: cellDate(row[6]),
    status: cellStr(row[13]) ?? 'ACTIVE',
  };
}

/**
 * Orders: A ref | B title | C client | D issued | E closing | F value |
 * J serviced? | K serviced date | M received USD | N received ZiG | O official rate.
 */
export function parseOrderRow(row: Row): ParsedOrder | null {
  const reference = cellStr(row[1]);
  const clientName = cellStr(row[3]);
  if (!reference || !clientName) {
    return null;
  }
  return {
    reference,
    clientName,
    title: cellStr(row[2]),
    dateIssued: cellDate(row[4]),
    closingDate: cellDate(row[5]),
    valueExVat: cellNum(row[6]),
    serviced: cellBool(row[10]),
    servicedAt: cellDate(row[11]),
    receivedUsd: cellNum(row[13]),
    receivedZig: cellNum(row[14]),
    officialRate: cellNum(row[15]),
  };
}

/** OrderExpenses: A date | B order | E desc | F category | G amount | H vat paid?. */
export function parseOrderExpenseRow(row: Row): ParsedOrderExpense | null {
  const orderRef = cellStr(row[2]);
  if (!orderRef) {
    return null;
  }
  return {
    orderRef,
    date: cellDate(row[1]),
    description: cellStr(row[5]),
    category: cellStr(row[6]),
    amountExVat: cellNum(row[7]),
    vatPaid: cellBool(row[8]),
  };
}

/** GeneralExpenses: A date | B desc | C category | D amount | E vat paid?. */
export function parseGeneralExpenseRow(row: Row): ParsedGeneralExpense | null {
  const description = cellStr(row[2]);
  const amount = cellNum(row[4]);
  if (!description && amount === 0) {
    return null;
  }
  return {
    date: cellDate(row[1]),
    description,
    category: cellStr(row[3]),
    amountExVat: amount,
    vatPaid: cellBool(row[5]),
  };
}

/** Overheads: A month | B salaries | F software | G internet | H rentals | I other | L comment. */
export function parseOverheadRow(row: Row): ParsedOverhead | null {
  const month = cellDate(row[1]);
  if (!month) {
    return null;
  }
  return {
    month,
    salaries: cellNum(row[2]),
    software: cellNum(row[6]),
    internet: cellNum(row[7]),
    rentals: cellNum(row[8]),
    other: cellNum(row[9]),
    comment: cellStr(row[12]),
  };
}

/** Loans: A ref | C lender | D date taken | E principal | F weekly rate | J paid USD. */
export function parseLoanRow(row: Row): ParsedLoan | null {
  const reference = cellStr(row[1]);
  if (!reference) {
    return null;
  }
  return {
    reference,
    lender: cellStr(row[3]),
    dateTaken: cellDate(row[4]),
    principal: cellNum(row[5]),
    weeklyRate: cellNum(row[6]),
    paidUsd: cellNum(row[10]),
  };
}

/**
 * ContractPayments: A month | B contract | E desc | F amount ex VAT |
 * G VAT received (output VAT) | H VAT paid to date.
 */
export function parseContractPaymentRow(row: Row): ParsedContractPayment | null {
  const contractRef = cellStr(row[2]);
  if (!contractRef) {
    return null;
  }
  return {
    claimDate: cellDate(row[1]),
    contractRef,
    description: cellStr(row[5]),
    amountExVat: cellNum(row[6]),
    vatReceived: cellNum(row[7]),
    vatPaidToDate: cellNum(row[8]),
  };
}

/**
 * OtherTaxDebt: A desc | B due | C PAYE principal | D VAT principal | E rate p.a. |
 * I paid to date.
 */
export function parseTaxDebtRow(row: Row): ParsedTaxDebt | null {
  const description = cellStr(row[1]);
  const paye = cellNum(row[3]);
  const vat = cellNum(row[4]);
  if (!description && paye === 0 && vat === 0) {
    return null;
  }
  return {
    description,
    dueDate: cellDate(row[2]),
    payePrincipal: paye,
    vatPrincipal: vat,
    ratePct: cellNum(row[5]),
    paidToDate: cellNum(row[9]),
  };
}

/**
 * The raw figures the workbook's Tax sheet consolidates into net VAT / net PAYE.
 * Each field mirrors a column total the spreadsheet sums (see the Tax sheet
 * SUM/SUMIFS formulas), read from the already-loaded cashflow sheets so the
 * importer can reproduce NET VAT PAYABLE and NET PAYE PAYABLE exactly.
 */
export interface TaxConsolidationInputs {
  /** Output VAT on serviced orders (Orders col G where Serviced? = Yes). */
  outputVatServicedOrders: number;
  /** Output VAT received on contract claims (ContractPayments col G). */
  outputVatContractClaims: number;
  /** Recoverable input VAT on order expenses (OrderExpenses col I). */
  inputVatOrderExpenses: number;
  /** Recoverable input VAT on general expenses (GeneralExpenses col F). */
  inputVatGeneralExpenses: number;
  /** Recoverable input VAT on overheads (Overheads col J). */
  inputVatOverheads: number;
  /** VAT already remitted against orders (Orders col V). */
  vatPaidOrders: number;
  /** VAT already remitted against contracts (ContractPayments col H). */
  vatPaidContracts: number;
  /** PAYE due for the current periods (Overheads col C). */
  payeDue: number;
  /** PAYE already remitted (Overheads col D). */
  payePaid: number;
}

/** Sum a numeric column over the data rows of a sheet (index 0 holds the row number). */
function sumColumn(rows: Row[], col: number, startRow: number): number {
  let total = 0;
  for (const row of rows) {
    if (typeof row[0] !== 'number' || (row[0] as number) < startRow) {
      continue;
    }
    total += cellNum(row[col]);
  }
  return total;
}

/**
 * Extract the Tax-sheet consolidation inputs from the raw cashflow sheets. Pure:
 * takes the same `Row[]` arrays the importer already reads and returns the column
 * totals the workbook's Net VAT / Net PAYE formulas depend on. `startRow` is the
 * first data row (5 for the cashflow sheets).
 */
export function parseTaxConsolidationInputs(
  sheets: {
    orders: Row[];
    orderExpenses: Row[];
    generalExpenses: Row[];
    overheads: Row[];
    contractPayments: Row[];
  },
  startRow = 5,
): TaxConsolidationInputs {
  // Output VAT on serviced orders only: Orders col G (7) where Serviced? (col J, 10) = Yes.
  let outputVatServicedOrders = 0;
  let vatPaidOrders = 0;
  for (const row of sheets.orders) {
    if (typeof row[0] !== 'number' || (row[0] as number) < startRow) {
      continue;
    }
    if (cellBool(row[10])) {
      outputVatServicedOrders += cellNum(row[7]);
    }
    vatPaidOrders += cellNum(row[22]);
  }

  return {
    outputVatServicedOrders,
    outputVatContractClaims: sumColumn(sheets.contractPayments, 7, startRow),
    inputVatOrderExpenses: sumColumn(sheets.orderExpenses, 9, startRow),
    inputVatGeneralExpenses: sumColumn(sheets.generalExpenses, 6, startRow),
    inputVatOverheads: sumColumn(sheets.overheads, 10, startRow),
    vatPaidOrders,
    vatPaidContracts: sumColumn(sheets.contractPayments, 8, startRow),
    payeDue: sumColumn(sheets.overheads, 3, startRow),
    payePaid: sumColumn(sheets.overheads, 4, startRow),
  };
}

// ── Payroll header detection + row parsing ──

/**
 * Build a column→index lookup for a payroll paysheet by scanning the two header
 * rows (group labels in row 2, field names in row 3) and matching known aliases.
 * Columns differ per workbook, so we detect by header text rather than fixed letters.
 * Returns a map of canonical field → 1-based column index.
 */
export function detectPayrollColumns(row2: Row, row3: Row): Record<string, number> {
  const width = Math.max(row2.length, row3.length);
  const map: Record<string, number> = {};

  // Combined "group / field" header text per column, lowercased.
  const header: string[] = [];
  for (let c = 1; c < width; c++) {
    const g = (cellStr(row2[c]) ?? '').toLowerCase();
    const f = (cellStr(row3[c]) ?? '').toLowerCase();
    header[c] = `${g} ${f}`.trim();
  }

  const find = (predicate: (h: string) => boolean): number | undefined => {
    for (let c = 1; c < width; c++) {
      if (header[c] && predicate(header[c])) {
        return c;
      }
    }
    return undefined;
  };
  const set = (key: string, col?: number) => {
    if (col !== undefined) {
      map[key] = col;
    }
  };

  set('worksNo', find((h) => h.includes('works')));
  set('station', find((h) => h.includes('station')));
  set('grade', find((h) => h === 'grade' || h.endsWith(' grade')));
  set('nssaNo', find((h) => h.includes('nssa number')));
  set('hours', find((h) => h === 'hours' || h.includes('hours worked')));
  set('basicUsd', find((h) => h.includes('basic') && h.includes('usd') && !h.includes('zwl')));
  set(
    'basicZwg',
    find((h) => h.includes('basic') && (h.includes('zwl') || h.includes('zwg') || h.includes('zig'))),
  );
  set('ugAllowance', find((h) => h.includes('underground')));
  set('nightAllowance', find((h) => h.includes('night shift')));
  set('gross', find((h) => h.includes('gross') && h.includes('total')));
  set('nssaEe', find((h) => h.includes('nssa usd')));
  set('mipf', find((h) => h.includes('mipf')));
  set('nec', find((h) => h === 'nec' || h.endsWith(' nec')));
  set('paye', find((h) => h.includes('paye usd')));
  set('aidsLevy', find((h) => h.includes('aids')));
  set('nyaradzo', find((h) => h.includes('nyaradzo')));
  set('netUsd', find((h) => h.includes('net salary') && h.includes('usd')));
  set('netZwg', find((h) => h.includes('net salary') && (h.includes('zwl') || h.includes('zwg') || h.includes('zig'))));

  return map;
}

export interface ParsedEmployee {
  worksNo: string;
  firstName: string;
  lastName: string;
  nationalId?: string;
  nssaNo?: string;
  grade?: string;
  occupation?: string;
  station?: string;
}

export interface ParsedPayrollLine {
  worksNo: string;
  basicUsd: number;
  basicZwg: number;
  ugAllowance: number;
  nightAllowance: number;
  gross: number;
  paye: number;
  aidsLevy: number;
  nssaEe: number;
  mipf: number;
  nec: number;
  nyaradzo: number;
  netUsd: number;
  netZwg: number;
}

/**
 * Parse one paysheet data row into an employee master record + a payroll line,
 * using the detected column map. Employee identity columns (works #, names,
 * national id, occupation) are at fixed early columns across all three sheets.
 * Missing statutory columns default to 0.
 */
export function parsePayrollRow(
  row: Row,
  cols: Record<string, number>,
): { employee: ParsedEmployee; line: ParsedPayrollLine } | null {
  const worksCol = cols.worksNo ?? 1;
  const worksNo = cellStr(row[worksCol]);
  if (!worksNo || !worksNo.toUpperCase().startsWith('AES-E')) {
    return null;
  }

  const at = (key: string): number => (cols[key] ? cellNum(row[cols[key]]) : 0);

  const employee: ParsedEmployee = {
    worksNo,
    firstName: cellStr(row[worksCol + 1]) ?? worksNo,
    lastName: cellStr(row[worksCol + 2]) ?? '',
    nationalId: cellStr(row[worksCol + 3]),
    occupation: cols.station ? cellStr(row[Math.min(cols.station + 1, row.length - 1)]) : undefined,
    grade: cols.grade ? cellStr(row[cols.grade]) : undefined,
    nssaNo: cols.nssaNo ? cellStr(row[cols.nssaNo]) : undefined,
    station: cols.station ? cellStr(row[cols.station]) : undefined,
  };

  const line: ParsedPayrollLine = {
    worksNo,
    basicUsd: at('basicUsd'),
    basicZwg: at('basicZwg'),
    ugAllowance: at('ugAllowance'),
    nightAllowance: at('nightAllowance'),
    gross: at('gross'),
    paye: at('paye'),
    aidsLevy: at('aidsLevy'),
    nssaEe: at('nssaEe'),
    mipf: at('mipf'),
    nec: at('nec'),
    nyaradzo: at('nyaradzo'),
    netUsd: at('netUsd'),
    netZwg: at('netZwg'),
  };

  return { employee, line };
}

/** Convert a spreadsheet period label ("3/25", "3/2025", "5/2023") to "YYYY-MM". */
export function periodToMonth(label: string | undefined, fallback: string): string {
  if (!label) {
    return fallback;
  }
  const m = label.match(/^(\d{1,2})\s*\/\s*(\d{2,4})$/);
  if (!m) {
    return fallback;
  }
  const month = m[1].padStart(2, '0');
  let year = m[2];
  if (year.length === 2) {
    year = `20${year}`;
  }
  return `${year}-${month}`;
}
