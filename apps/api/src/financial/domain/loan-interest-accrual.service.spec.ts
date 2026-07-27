import { Prisma } from '@prisma/client';
import { LoanInterestAccrualService } from './loan-interest-accrual.service';
import { LoanInterestService } from './loan-interest.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Build a service over an in-memory `loan_interest` store keyed by
 * (loanId, accrualDate-iso) so we can exercise the real idempotency path:
 * createMany({ skipDuplicates }) drops rows whose key already exists.
 */
function makeService(loans: any[]) {
  const store = new Map<string, any>();
  const key = (loanId: string, d: Date) => `${loanId}::${d.toISOString().slice(0, 10)}`;

  const prisma = {
    loan: { findMany: jest.fn().mockResolvedValue(loans) },
    loanInterest: {
      findFirst: jest.fn(async ({ where }: any) => {
        const rows = [...store.values()].filter((r) => r.loanId === where.loanId);
        if (rows.length === 0) return null;
        rows.sort((a, b) => b.accrualDate.getTime() - a.accrualDate.getTime());
        return rows[0];
      }),
      createMany: jest.fn(async ({ data }: any) => {
        let count = 0;
        for (const row of data) {
          const k = key(row.loanId, row.accrualDate);
          if (!store.has(k)) {
            store.set(k, row);
            count += 1;
          }
        }
        return { count };
      }),
    },
  };

  const service = new LoanInterestAccrualService(prisma as any, new LoanInterestService());
  return { service, prisma, store };
}

describe('LoanInterestAccrualService', () => {
  const activeLoan = {
    id: 'loan1',
    principal: dec(10000),
    currency: 'USD',
    weeklyRatePct: dec(5), // 5% / week => per-day = 10000 * 0.05 / 7 = 71.428... -> 71.43
    interestMethod: 'FLAT',
    startDate: day('2026-07-01'),
    status: 'ACTIVE',
  };

  it('writes one per-day row of the right interest amount for each elapsed day', async () => {
    const { service, store } = makeService([activeLoan]);
    // now = 2026-07-08 -> days accrued are 2026-07-01 .. 2026-07-07 (yesterday) = 7 rows.
    const res = await service.accrueAll(day('2026-07-08'));

    expect(res.loansConsidered).toBe(1);
    expect(res.rowsWritten).toBe(7);
    expect(store.size).toBe(7);

    const rows = [...store.values()];
    // per-day amount = 10000 * 0.05 / 7 = 71.4285... -> round2 -> 71.43
    for (const r of rows) {
      expect(Number(r.amount)).toBeCloseTo(71.43, 2);
      expect(r.currency).toBe('USD');
    }
    // Sum of 7 days ~ one week's flat interest (7 * 71.43 = 500.01).
    const total = rows.reduce((s, r) => s + Number(r.amount), 0);
    expect(total).toBeCloseTo(500.01, 2);
  });

  it('is idempotent: a second run on the same day writes NO new rows', async () => {
    const { service, store } = makeService([activeLoan]);
    await service.accrueAll(day('2026-07-08'));
    expect(store.size).toBe(7);

    const second = await service.accrueAll(day('2026-07-08'));
    expect(second.rowsWritten).toBe(0);
    expect(store.size).toBe(7);
  });

  it('only accrues the NEW days on a later run (resumes after the last accrual)', async () => {
    const { service, store } = makeService([activeLoan]);
    await service.accrueAll(day('2026-07-08')); // 7 rows (Jul 1..7)
    const next = await service.accrueAll(day('2026-07-11')); // adds Jul 8,9,10 = 3 rows
    expect(next.rowsWritten).toBe(3);
    expect(store.size).toBe(10);
  });

  it('accrues nothing before the loan start date (no full day elapsed yet)', async () => {
    const { service, store } = makeService([activeLoan]);
    const res = await service.accrueAll(day('2026-07-01')); // start day, yesterday < start
    expect(res.rowsWritten).toBe(0);
    expect(store.size).toBe(0);
  });

  it('skips loans with zero principal or zero rate (no noise rows)', async () => {
    const { service, store } = makeService([
      { ...activeLoan, id: 'z1', principal: dec(0) },
      { ...activeLoan, id: 'z2', weeklyRatePct: dec(0) },
    ]);
    const res = await service.accrueAll(day('2026-08-01'));
    expect(res.rowsWritten).toBe(0);
    expect(store.size).toBe(0);
  });
});
