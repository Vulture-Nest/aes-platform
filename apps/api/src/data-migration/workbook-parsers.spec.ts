import {
  cellBool,
  cellDate,
  cellNum,
  detectPayrollColumns,
  parseContractRow,
  parseLoanRow,
  parseOrderRow,
  parseOverheadRow,
  parsePayrollRow,
  parseSettingsSheet,
  parseTaxDebtRow,
  periodToMonth,
  Row,
} from './workbook-parsers';

/** Build a 1-based row array from an index→value map. */
function row(cells: Record<number, unknown>): Row {
  const arr: Row = [];
  const max = Math.max(...Object.keys(cells).map(Number));
  for (let c = 0; c <= max; c++) {
    arr[c] = cells[c];
  }
  return arr;
}

describe('workbook cell coercion', () => {
  it('unwraps exceljs formula cells to their result', () => {
    expect(cellNum({ formula: 'A1*2', result: 26.5 })).toBe(26.5);
  });
  it('strips currency/commas and returns 0 for blanks', () => {
    expect(cellNum('$1,200.50')).toBe(1200.5);
    expect(cellNum('')).toBe(0);
    expect(cellNum(null)).toBe(0);
  });
  it('coerces Yes to true and everything else to false', () => {
    expect(cellBool('Yes')).toBe(true);
    expect(cellBool('No')).toBe(false);
    expect(cellBool(undefined)).toBe(false);
  });
  it('parses ISO date strings and rejects blanks', () => {
    expect(cellDate('2026-05-05T00:00:00.000Z')?.getUTCFullYear()).toBe(2026);
    expect(cellDate('')).toBeUndefined();
  });
});

describe('cashflow row parsers', () => {
  it('maps an Orders row to reference, client, value, receipts + serviced', () => {
    // A ref | B title | C client | D issued | E closing | F value | J serviced | K date | M usd | N zig | O rate
    const parsed = parseOrderRow(
      row({
        1: 'AES-O-001',
        2: 'Ventilation doors',
        3: 'Zimplats',
        4: '2026-05-05T00:00:00.000Z',
        5: '2026-06-15T00:00:00.000Z',
        6: 18000,
        10: 'Yes',
        11: '2026-06-01T00:00:00.000Z',
        13: 10000,
        14: 120000,
        15: { formula: 'OffRate', result: 26.5 },
      }),
    );
    expect(parsed).toMatchObject({
      reference: 'AES-O-001',
      clientName: 'Zimplats',
      valueExVat: 18000,
      serviced: true,
      receivedUsd: 10000,
      receivedZig: 120000,
      officialRate: 26.5,
    });
    expect(parsed?.closingDate?.getUTCMonth()).toBe(5); // June (0-based)
  });

  it('returns null for an Orders row with no reference', () => {
    expect(parseOrderRow(row({ 3: 'Zimplats', 6: 100 }))).toBeNull();
  });

  it('maps a Contracts row', () => {
    const parsed = parseContractRow(
      row({ 1: 'UNK-CT-01', 2: 'Unki Mine', 3: 'Refuge chambers', 4: 480000, 13: 'ACTIVE' }),
    );
    expect(parsed).toMatchObject({ reference: 'UNK-CT-01', clientName: 'Unki Mine', valueExVat: 480000, status: 'ACTIVE' });
  });

  it('maps a Loans row (weekly rate stays a fraction here; service scales to pct)', () => {
    const parsed = parseLoanRow(
      row({ 1: 'LN-01', 3: 'QuickCash Lender', 4: '2026-05-08T00:00:00.000Z', 5: 5000, 6: 0.05, 10: 2000 }),
    );
    expect(parsed).toMatchObject({ reference: 'LN-01', lender: 'QuickCash Lender', principal: 5000, weeklyRate: 0.05, paidUsd: 2000 });
  });

  it('splits an OtherTaxDebt row into PAYE and VAT principals', () => {
    const vatRow = parseTaxDebtRow(row({ 1: 'VAT arrears', 2: '2026-01-25T00:00:00.000Z', 3: 0, 4: 4000, 5: 0.1 }));
    expect(vatRow).toMatchObject({ vatPrincipal: 4000, payePrincipal: 0, ratePct: 0.1 });
    const payeRow = parseTaxDebtRow(row({ 1: 'PAYE arrears', 2: '2025-12-10T00:00:00.000Z', 3: 1500, 4: 0, 5: 0.1 }));
    expect(payeRow).toMatchObject({ payePrincipal: 1500, vatPrincipal: 0 });
  });

  it('maps an Overheads month row to its cost buckets', () => {
    const parsed = parseOverheadRow(
      row({ 1: '2026-04-30T00:00:00.000Z', 2: 8000, 6: 300, 7: 150, 8: 1000, 9: 200 }),
    );
    expect(parsed).toMatchObject({ salaries: 8000, software: 300, internet: 150, rentals: 1000, other: 200 });
  });
});

describe('payroll header detection + row parsing', () => {
  // Head Office layout: group labels in row2, field names in row3 (subset of real sheet).
  const row2 = row({ 16: 'Basic', 17: 'Basic', 22: 'Gross', 25: 'Allowable Deductions', 26: 'Allowable Deductions', 37: 'PAYE USD', 38: 'PAYE USD', 48: 'Net Salary' });
  const row3 = row({
    1: 'Works #',
    8: 'Station',
    12: 'Hours Worked',
    13: 'Total Basic USD',
    15: 'Total Basic ZWL',
    22: 'Total',
    26: 'NSSA USD',
    37: 'PAYE  ',
    38: 'AIDS LEVY',
    48: 'USD',
  });

  it('detects columns by header text', () => {
    const cols = detectPayrollColumns(row2, row3);
    expect(cols.worksNo).toBe(1);
    expect(cols.basicUsd).toBe(13);
    expect(cols.nssaEe).toBe(26);
    expect(cols.paye).toBe(37);
    expect(cols.aidsLevy).toBe(38);
    expect(cols.netUsd).toBe(48);
  });

  it('parses a data row into an employee + payroll line, defaulting missing cols to 0', () => {
    const cols = detectPayrollColumns(row2, row3);
    const dataRow = row({
      1: 'AES-E007',
      2: 'Talent',
      3: 'Hungwe',
      4: '04-885408T08',
      8: 'Gweru',
      13: 400,
      26: 9,
      37: 30.25,
      38: 0.9075,
      48: 147.34,
    });
    const parsed = parsePayrollRow(dataRow, cols);
    expect(parsed).not.toBeNull();
    expect(parsed?.employee).toMatchObject({ worksNo: 'AES-E007', firstName: 'Talent', lastName: 'Hungwe', nationalId: '04-885408T08' });
    expect(parsed?.line).toMatchObject({ basicUsd: 400, nssaEe: 9, paye: 30.25, aidsLevy: 0.9075, netUsd: 147.34 });
    // Missing column (nyaradzo) defaults to 0.
    expect(parsed?.line.nyaradzo).toBe(0);
  });

  it('skips rows whose works # is not an AES employee number', () => {
    const cols = detectPayrollColumns(row2, row3);
    expect(parsePayrollRow(row({ 1: 'TOTAL', 13: 999 }), cols)).toBeNull();
  });
});

describe('periodToMonth', () => {
  it('normalises spreadsheet period labels to YYYY-MM', () => {
    expect(periodToMonth('3/25', '2025-03')).toBe('2025-03');
    expect(periodToMonth('3/2025', '2025-03')).toBe('2025-03');
    expect(periodToMonth('5/2023', '2023-06')).toBe('2023-05');
    expect(periodToMonth(undefined, '2025-03')).toBe('2025-03');
  });
});

describe('parseSettingsSheet (G23)', () => {
  it('extracts VAT rate, official/street rates, ZIMRA interest and report date by label', () => {
    const rows: Row[] = [
      row({ 1: 'SETTINGS & ASSUMPTIONS' }),
      row({ 1: 'VAT Rate (Zimbabwe standard)', 2: 0.155 }),
      row({ 1: 'Official Exchange Rate (ZiG per USD)', 2: 26.5 }),
      row({ 1: 'Street / Parallel Rate (ZiG per USD)', 2: 33 }),
      row({ 1: 'ZIMRA Overdue-Tax Interest (per annum)', 2: 0.1 }),
      row({ 1: 'Report / Valuation Date', 2: { formula: 'TODAY()', result: '2026-07-24T00:00:00.000Z' } }),
    ];
    const parsed = parseSettingsSheet(rows);
    expect(parsed.vatRateFraction).toBe(0.155);
    expect(parsed.officialRate).toBe(26.5);
    expect(parsed.streetRate).toBe(33);
    expect(parsed.zimraInterestFraction).toBe(0.1);
    expect(parsed.reportDate?.toISOString()).toBe('2026-07-24T00:00:00.000Z');
  });

  it('leaves fields undefined when their labels are absent', () => {
    const parsed = parseSettingsSheet([row({ 1: 'Business Name', 2: 'AES' })]);
    expect(parsed.vatRateFraction).toBeUndefined();
    expect(parsed.officialRate).toBeUndefined();
  });
});
