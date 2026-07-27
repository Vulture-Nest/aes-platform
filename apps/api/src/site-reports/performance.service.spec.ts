import { resolveTarget } from './performance.service';

describe('resolveTarget', () => {
  it('prefers an exact periodMonth match', () => {
    const targets = [
      { periodMonth: '2026-06', effectiveFrom: null },
      { periodMonth: '2026-07', effectiveFrom: null },
    ];
    expect(resolveTarget(targets, '2026-07')).toEqual({ periodMonth: '2026-07', effectiveFrom: null });
  });

  it('falls back to the latest effective-from at/before the month (stepped targets)', () => {
    const targets = [
      { periodMonth: null, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
      { periodMonth: null, effectiveFrom: new Date('2026-06-01T00:00:00.000Z') },
      { periodMonth: null, effectiveFrom: new Date('2027-01-01T00:00:00.000Z') },
    ];
    const chosen = resolveTarget(targets, '2026-07');
    expect(chosen?.effectiveFrom?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('falls back to a baseline (no month, no date) target', () => {
    const targets = [{ periodMonth: null, effectiveFrom: null }];
    expect(resolveTarget(targets, '2026-07')).toEqual({ periodMonth: null, effectiveFrom: null });
  });

  it('returns undefined for no targets', () => {
    expect(resolveTarget([], '2026-07')).toBeUndefined();
  });
});
