import { addMonths, compliancePercent } from './ppe.service';

describe('compliancePercent', () => {
  it('is 100 when nothing is required', () => {
    expect(compliancePercent(0, 0)).toBe(100);
  });

  it('computes items in-date/issued over items required', () => {
    expect(compliancePercent(10, 8)).toBe(80);
    expect(compliancePercent(4, 1)).toBe(25);
    expect(compliancePercent(3, 3)).toBe(100);
  });

  it('rounds to two decimals', () => {
    expect(compliancePercent(3, 1)).toBe(33.33);
  });
});

describe('addMonths', () => {
  it('adds calendar months in UTC', () => {
    const d = new Date('2026-01-15T00:00:00.000Z');
    expect(addMonths(d, 12).toISOString()).toBe('2027-01-15T00:00:00.000Z');
    expect(addMonths(d, 3).toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });
});
