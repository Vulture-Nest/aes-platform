import { RagStatus } from '@prisma/client';

export type KpiDirection = 'HIGHER_BETTER' | 'LOWER_BETTER';

/**
 * Compute a RAG status for a KPI actual against its target.
 *
 * `direction` controls polarity:
 *  - HIGHER_BETTER: on/above target is GREEN; within `tolerance` below is AMBER; further below is RED.
 *  - LOWER_BETTER : on/below target is GREEN; within `tolerance` above is AMBER; further above is RED.
 *
 * `tolerance` is an absolute amount in the KPI's own unit (an amber band width). When
 * tolerance is null/undefined/0 the amber band collapses and results are GREEN or RED only.
 */
export function computeRag(
  actual: number,
  target: number,
  tolerance: number | null | undefined,
  direction: KpiDirection = 'HIGHER_BETTER',
): RagStatus {
  const tol = tolerance != null && tolerance > 0 ? tolerance : 0;

  if (direction === 'LOWER_BETTER') {
    if (actual <= target) return RagStatus.GREEN;
    if (actual <= target + tol) return RagStatus.AMBER;
    return RagStatus.RED;
  }

  // HIGHER_BETTER (default)
  if (actual >= target) return RagStatus.GREEN;
  if (actual >= target - tol) return RagStatus.AMBER;
  return RagStatus.RED;
}

export interface WeightedKpi {
  weight: number;
  rag: RagStatus;
}

/** Numeric score per RAG band used in the weighted roll-up (0..100). */
export function ragPoints(rag: RagStatus): number {
  switch (rag) {
    case RagStatus.GREEN:
      return 100;
    case RagStatus.AMBER:
      return 50;
    case RagStatus.RED:
    default:
      return 0;
  }
}

/**
 * Weighted site score (0..100) = Σ(weight * ragPoints) / Σ(weight). Zero/negative
 * weights are ignored. Returns 0 when there are no positively-weighted KPIs.
 */
export function weightedScore(kpis: WeightedKpi[]): number {
  let weightSum = 0;
  let scoreSum = 0;
  for (const k of kpis) {
    const w = k.weight > 0 ? k.weight : 0;
    if (w === 0) continue;
    weightSum += w;
    scoreSum += w * ragPoints(k.rag);
  }
  if (weightSum === 0) return 0;
  return Math.round((scoreSum / weightSum) * 100) / 100;
}

/** Roll a set of KPI RAGs up to a single site RAG from its weighted score. */
export function scoreToRag(score: number): RagStatus {
  if (score >= 85) return RagStatus.GREEN;
  if (score >= 50) return RagStatus.AMBER;
  return RagStatus.RED;
}
