import { RagStatus } from '@prisma/client';
import { computeRag, ragPoints, scoreToRag, weightedScore } from './performance.util';

describe('computeRag', () => {
  describe('HIGHER_BETTER', () => {
    it('is GREEN on or above target', () => {
      expect(computeRag(100, 100, 10, 'HIGHER_BETTER')).toBe(RagStatus.GREEN);
      expect(computeRag(120, 100, 10, 'HIGHER_BETTER')).toBe(RagStatus.GREEN);
    });
    it('is AMBER within tolerance below target', () => {
      expect(computeRag(95, 100, 10, 'HIGHER_BETTER')).toBe(RagStatus.AMBER);
      expect(computeRag(90, 100, 10, 'HIGHER_BETTER')).toBe(RagStatus.AMBER);
    });
    it('is RED beyond tolerance below target', () => {
      expect(computeRag(89, 100, 10, 'HIGHER_BETTER')).toBe(RagStatus.RED);
    });
  });

  describe('LOWER_BETTER', () => {
    it('is GREEN on or below target', () => {
      expect(computeRag(100, 100, 10, 'LOWER_BETTER')).toBe(RagStatus.GREEN);
      expect(computeRag(80, 100, 10, 'LOWER_BETTER')).toBe(RagStatus.GREEN);
    });
    it('is AMBER within tolerance above target', () => {
      expect(computeRag(105, 100, 10, 'LOWER_BETTER')).toBe(RagStatus.AMBER);
      expect(computeRag(110, 100, 10, 'LOWER_BETTER')).toBe(RagStatus.AMBER);
    });
    it('is RED beyond tolerance above target', () => {
      expect(computeRag(111, 100, 10, 'LOWER_BETTER')).toBe(RagStatus.RED);
    });
  });

  it('collapses the amber band when tolerance is null/zero', () => {
    expect(computeRag(99, 100, null, 'HIGHER_BETTER')).toBe(RagStatus.RED);
    expect(computeRag(100, 100, 0, 'HIGHER_BETTER')).toBe(RagStatus.GREEN);
  });

  it('defaults direction to HIGHER_BETTER', () => {
    expect(computeRag(101, 100, 5)).toBe(RagStatus.GREEN);
  });
});

describe('weightedScore', () => {
  it('returns 0 for no positively-weighted kpis', () => {
    expect(weightedScore([])).toBe(0);
    expect(weightedScore([{ weight: 0, rag: RagStatus.GREEN }])).toBe(0);
  });

  it('scores all-green as 100 and all-red as 0', () => {
    expect(weightedScore([{ weight: 1, rag: RagStatus.GREEN }])).toBe(100);
    expect(weightedScore([{ weight: 3, rag: RagStatus.RED }])).toBe(0);
  });

  it('weights KPIs by their weight', () => {
    // 75% weight green(100), 25% weight red(0) => 75
    const score = weightedScore([
      { weight: 3, rag: RagStatus.GREEN },
      { weight: 1, rag: RagStatus.RED },
    ]);
    expect(score).toBe(75);
  });

  it('treats amber as half credit', () => {
    expect(weightedScore([{ weight: 2, rag: RagStatus.AMBER }])).toBe(50);
  });

  it('ignores negative weights', () => {
    expect(
      weightedScore([
        { weight: -5, rag: RagStatus.RED },
        { weight: 1, rag: RagStatus.GREEN },
      ]),
    ).toBe(100);
  });
});

describe('ragPoints', () => {
  it('maps bands to points', () => {
    expect(ragPoints(RagStatus.GREEN)).toBe(100);
    expect(ragPoints(RagStatus.AMBER)).toBe(50);
    expect(ragPoints(RagStatus.RED)).toBe(0);
  });
});

describe('scoreToRag', () => {
  it('maps a weighted score back to a single RAG', () => {
    expect(scoreToRag(90)).toBe(RagStatus.GREEN);
    expect(scoreToRag(85)).toBe(RagStatus.GREEN);
    expect(scoreToRag(60)).toBe(RagStatus.AMBER);
    expect(scoreToRag(50)).toBe(RagStatus.AMBER);
    expect(scoreToRag(10)).toBe(RagStatus.RED);
  });
});
