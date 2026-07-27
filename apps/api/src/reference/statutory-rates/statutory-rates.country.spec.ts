import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StatutoryRatesService } from './statutory-rates.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Country scoping (multinational readiness, gap G4): a second entity in a different country
 * carries its OWN effective-dated statutory rates, while the Zimbabwe path — whose rows are all
 * country-agnostic (country = NULL) — resolves unchanged via the resolver's NULL fallback.
 *
 * The resolver is proved against an in-memory row store that mimics the Prisma `findFirst`
 * (key + currency + country + dateEffective <= date, newest first) so the country-preference /
 * NULL-fallback branch is exercised exactly as it runs against Postgres.
 */
describe('StatutoryRatesService — country scoping + fallback', () => {
  const dec = (n: number) => new Prisma.Decimal(n);

  // Seed: ZW-style country-agnostic (NULL) rows + XX-specific rows with DISTINCT values.
  const rows: any[] = [
    // Country-agnostic default (the existing ZW behaviour): vat_pct 15, aids_levy_pct 3.
    { id: 'z-vat', key: 'vat_pct', currency: null, country: null, value: dec(15), params: null, dateEffective: new Date('2025-01-01') },
    { id: 'z-aids', key: 'aids_levy_pct', currency: null, country: null, value: dec(3), params: null, dateEffective: new Date('2025-01-01') },
    // XX-specific overrides: distinct values so isolation is unambiguous.
    { id: 'x-vat', key: 'vat_pct', currency: null, country: 'XX', value: dec(20), params: null, dateEffective: new Date('2025-01-01') },
    { id: 'x-head', key: 'xx_special_pct', currency: null, country: 'XX', value: dec(7.5), params: null, dateEffective: new Date('2025-01-01') },
  ];

  const prisma = {
    statutoryRate: {
      findFirst: jest.fn(({ where, orderBy }: any) => {
        const matches = rows
          .filter(
            (r) =>
              r.key === where.key &&
              r.currency === (where.currency ?? null) &&
              r.country === (where.country ?? null) &&
              r.dateEffective <= where.dateEffective.lte,
          )
          .sort(
            (a, b) =>
              (orderBy?.dateEffective === 'desc' ? -1 : 1) *
              (a.dateEffective.getTime() - b.dateEffective.getTime()),
          );
        return Promise.resolve(matches[0] ?? null);
      }),
    },
  };
  const audit = { record: jest.fn() };
  const lookups = { assertValid: jest.fn() };
  const service = new StatutoryRatesService(prisma as any, audit as any, lookups as any);
  const asOf = new Date('2026-07-01');

  beforeEach(() => jest.clearAllMocks());

  it('returns the XX-specific value when country = XX (isolation)', async () => {
    const vat = await service.valueAsOf('vat_pct', asOf, undefined, 'XX');
    expect(vat.id).toBe('x-vat');
    expect(vat.value!.toNumber()).toBe(20);

    const head = await service.valueAsOf('xx_special_pct', asOf, undefined, 'XX');
    expect(head.value!.toNumber()).toBe(7.5);
  });

  it('returns the country-agnostic (ZW) value when country = ZW — via NULL fallback', async () => {
    const vat = await service.valueAsOf('vat_pct', asOf, undefined, 'ZW');
    expect(vat.id).toBe('z-vat'); // NOT the XX row — isolation holds the other direction too
    expect(vat.value!.toNumber()).toBe(15);
  });

  it('returns the country-agnostic value when country is omitted (unchanged ZW default)', async () => {
    const vat = await service.valueAsOf('vat_pct', asOf);
    expect(vat.id).toBe('z-vat');
    expect(vat.value!.toNumber()).toBe(15);

    const aids = await service.valueAsOf('aids_levy_pct', asOf);
    expect(aids.value!.toNumber()).toBe(3);
  });

  it('falls back to the NULL row for a country that has no scoped row for the key', async () => {
    // aids_levy_pct has no XX-specific row → the XX lookup falls back to the country-agnostic one.
    const aids = await service.valueAsOf('aids_levy_pct', asOf, undefined, 'XX');
    expect(aids.id).toBe('z-aids');
    expect(aids.value!.toNumber()).toBe(3);
  });

  it('throws when neither a scoped nor a country-agnostic row exists', async () => {
    await expect(
      service.valueAsOf('does_not_exist', asOf, undefined, 'XX'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
