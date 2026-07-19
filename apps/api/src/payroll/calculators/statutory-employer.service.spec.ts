import { BadRequestException } from '@nestjs/common';
import { EmployerStatutoryService } from './statutory-employer.service';

/*
 * NOTE: every rate below is a clearly-labelled EXAMPLE value, NOT a real
 * ZIMRA/NSSA/NEC figure. The service is pure and takes rates as inputs, so the
 * numbers here only need to be internally consistent for arithmetic.
 */

describe('EmployerStatutoryService', () => {
  let service: EmployerStatutoryService;

  beforeEach(() => {
    service = new EmployerStatutoryService();
  });

  // method under test -> the three flavours share identical percent-of-gross math.
  const methods: Array<keyof EmployerStatutoryService> = ['zimdef', 'nec', 'mipf'];

  describe.each(methods)('%s(): percent-of-gross', (method) => {
    // [description, gross, EXAMPLE pct, expected]
    const cases: Array<[string, number, number, number]> = [
      ['zero gross yields zero', 0, 1, 0],
      ['zero pct yields zero', 1000, 0, 0],
      ['whole-percent of round gross', 1000, 1, 10],
      ['fractional pct rounds to 2dp', 1234.56, 1.5, 18.52],
      ['sub-cent result rounds up (half away from zero)', 100, 0.005, 0.01],
      ['larger example rate', 2500, 3, 75],
    ];

    it.each(cases)('%s', (_desc, gross, pct, expected) => {
      expect(service[method]({ gross, pct })).toBe(expected);
    });
  });

  describe('worked spot-check example', () => {
    it('zimdef of gross 5000 at EXAMPLE 1% is 50', () => {
      expect(service.zimdef({ gross: 5000, pct: 1 })).toBe(50);
    });

    it('nec of gross 3200 at EXAMPLE 0.5% is 16', () => {
      expect(service.nec({ gross: 3200, pct: 0.5 })).toBe(16);
    });

    it('mipf of gross 4800 at EXAMPLE 4.5% is 216', () => {
      expect(service.mipf({ gross: 4800, pct: 4.5 })).toBe(216);
    });
  });

  describe('rounding to 2dp', () => {
    it('rounds a repeating fraction to 2dp', () => {
      // 100 * 0.333 / 100 = 0.333 -> 0.33
      expect(service.zimdef({ gross: 100, pct: 0.333 })).toBe(0.33);
    });

    it('avoids binary-float artefacts (0.1-style)', () => {
      // 70 * 0.1 / 100 = 0.07 exactly, must not surface as 0.06999...
      expect(service.nec({ gross: 70, pct: 0.1 })).toBe(0.07);
    });
  });

  describe('guards against invalid inputs', () => {
    const invalid: Array<[string, number, number]> = [
      ['negative gross', -1, 1],
      ['negative pct', 1000, -1],
      ['both negative', -1, -1],
    ];

    it.each(invalid)('rejects %s', (_desc, gross, pct) => {
      for (const method of methods) {
        expect(() => service[method]({ gross, pct })).toThrow(BadRequestException);
      }
    });

    it('rejects non-finite gross (NaN / Infinity)', () => {
      expect(() => service.zimdef({ gross: NaN, pct: 1 })).toThrow(BadRequestException);
      expect(() => service.nec({ gross: Infinity, pct: 1 })).toThrow(BadRequestException);
    });

    it('rejects non-finite pct', () => {
      expect(() => service.mipf({ gross: 1000, pct: NaN })).toThrow(BadRequestException);
    });
  });
});
