import { NssaService } from './nssa.service';

/**
 * NOTE: every rate/ceiling below is a clearly-labelled EXAMPLE value used
 * purely to exercise the pure maths. These are NOT the real ZIMRA/NSSA
 * statutory figures — real values are supplied at runtime from config.
 */
describe('NssaService', () => {
  let service: NssaService;

  // EXAMPLE statutory params (NOT real NSSA numbers).
  const EXAMPLE_EE_PCT = 4.5;
  const EXAMPLE_ER_PCT = 4.5;
  const EXAMPLE_CEILING = 5000;

  beforeEach(() => {
    service = new NssaService();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('below ceiling', () => {
    it('contributes on full insurable earnings', () => {
      const result = service.compute({
        insurableEarnings: 2000,
        ceiling: EXAMPLE_CEILING,
        eePct: EXAMPLE_EE_PCT,
        erPct: EXAMPLE_ER_PCT,
      });

      // 2000 * 4.5% = 90
      expect(result).toEqual({ employee: 90, employer: 90 });
    });

    it('rounds money to 2 decimal places', () => {
      const result = service.compute({
        insurableEarnings: 1234.56,
        ceiling: EXAMPLE_CEILING,
        eePct: 4.5,
        erPct: 4.5,
      });

      // 1234.56 * 4.5% = 55.5552 -> 55.56
      expect(result).toEqual({ employee: 55.56, employer: 55.56 });
    });
  });

  describe('at ceiling', () => {
    it('contributes on the ceiling amount when earnings equal the ceiling', () => {
      const result = service.compute({
        insurableEarnings: EXAMPLE_CEILING,
        ceiling: EXAMPLE_CEILING,
        eePct: EXAMPLE_EE_PCT,
        erPct: EXAMPLE_ER_PCT,
      });

      // 5000 * 4.5% = 225
      expect(result).toEqual({ employee: 225, employer: 225 });
    });
  });

  describe('above ceiling', () => {
    it('caps insurable earnings at the ceiling', () => {
      const result = service.compute({
        insurableEarnings: 10000,
        ceiling: EXAMPLE_CEILING,
        eePct: EXAMPLE_EE_PCT,
        erPct: EXAMPLE_ER_PCT,
      });

      // min(10000, 5000) = 5000; 5000 * 4.5% = 225
      expect(result).toEqual({ employee: 225, employer: 225 });
    });
  });

  describe('zero cases', () => {
    it('returns zero contributions for zero insurable earnings', () => {
      const result = service.compute({
        insurableEarnings: 0,
        ceiling: EXAMPLE_CEILING,
        eePct: EXAMPLE_EE_PCT,
        erPct: EXAMPLE_ER_PCT,
      });

      expect(result).toEqual({ employee: 0, employer: 0 });
    });

    it('returns zero contributions for a zero ceiling', () => {
      const result = service.compute({
        insurableEarnings: 3000,
        ceiling: 0,
        eePct: EXAMPLE_EE_PCT,
        erPct: EXAMPLE_ER_PCT,
      });

      expect(result).toEqual({ employee: 0, employer: 0 });
    });

    it('returns zero contributions for zero rates', () => {
      const result = service.compute({
        insurableEarnings: 3000,
        ceiling: EXAMPLE_CEILING,
        eePct: 0,
        erPct: 0,
      });

      expect(result).toEqual({ employee: 0, employer: 0 });
    });
  });

  describe('asymmetric employee/employer rates', () => {
    it('applies each rate independently', () => {
      const result = service.compute({
        insurableEarnings: 4000,
        ceiling: EXAMPLE_CEILING,
        eePct: 3, // EXAMPLE
        erPct: 6, // EXAMPLE
      });

      // 4000 * 3% = 120 ; 4000 * 6% = 240
      expect(result).toEqual({ employee: 120, employer: 240 });
    });
  });
});
