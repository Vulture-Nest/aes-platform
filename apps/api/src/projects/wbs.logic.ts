/**
 * Pure WBS calculation helpers — no Prisma, no I/O — so they can be unit-tested in
 * isolation. All percentages are plain `number` in the range 0..100. Weights are plain
 * numbers (already coerced from Prisma.Decimal by the caller).
 */

/** A flat WBS node as needed by the roll-up. Leaves keep their own percentComplete. */
export interface RollUpNode {
  id: string;
  parentId: string | null;
  weight: number;
  /** Only meaningful for leaves; recomputed for parents. */
  percentComplete: number;
}

/** The rolled-up percent for every node, keyed by node id (0..100, rounded to 2dp). */
export type RollUpResult = Record<string, number>;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute each node's percentComplete as the weighted average of its children, bottom-up.
 * Leaves (no children) retain their given percentComplete. A parent whose children carry
 * zero total weight falls back to a simple (unweighted) average so progress is never lost.
 *
 * Pure: does not mutate the input; returns a map id -> rolled-up percent.
 */
export function rollUp(nodes: RollUpNode[]): RollUpResult {
  const childrenOf = new Map<string | null, RollUpNode[]>();
  for (const n of nodes) {
    const key = n.parentId ?? null;
    const list = childrenOf.get(key);
    if (list) list.push(n);
    else childrenOf.set(key, [n]);
  }

  const result: RollUpResult = {};

  const compute = (node: RollUpNode): number => {
    if (node.id in result) return result[node.id];
    const kids = childrenOf.get(node.id) ?? [];
    let pct: number;
    if (kids.length === 0) {
      pct = node.percentComplete;
    } else {
      const childPcts = kids.map((k) => ({ pct: compute(k), weight: k.weight }));
      const totalWeight = childPcts.reduce((s, c) => s + c.weight, 0);
      if (totalWeight > 0) {
        pct = childPcts.reduce((s, c) => s + c.pct * c.weight, 0) / totalWeight;
      } else {
        pct = childPcts.reduce((s, c) => s + c.pct, 0) / childPcts.length;
      }
    }
    const clamped = Math.min(100, Math.max(0, pct));
    result[node.id] = round2(clamped);
    return result[node.id];
  };

  for (const n of nodes) compute(n);
  return result;
}

/**
 * The project-level percentComplete = weighted average of its top-level (parentId null)
 * nodes, using the rolled-up map. Returns 0 when there are no top-level nodes.
 */
export function projectPercent(nodes: RollUpNode[], rolled: RollUpResult): number {
  const roots = nodes.filter((n) => n.parentId === null || n.parentId === undefined);
  if (roots.length === 0) return 0;
  const totalWeight = roots.reduce((s, n) => s + n.weight, 0);
  let pct: number;
  if (totalWeight > 0) {
    pct = roots.reduce((s, n) => s + (rolled[n.id] ?? 0) * n.weight, 0) / totalWeight;
  } else {
    pct = roots.reduce((s, n) => s + (rolled[n.id] ?? 0), 0) / roots.length;
  }
  return round2(Math.min(100, Math.max(0, pct)));
}

// ---------------------------------------------------------------------------
// Schedule health / RAG
// ---------------------------------------------------------------------------
export type Rag = 'GREEN' | 'AMBER' | 'RED';

export interface ScheduleHealthInput {
  plannedStart: Date | null;
  plannedFinish: Date | null;
  actualPercent: number;
  /** "today" — injectable for deterministic tests. */
  asOf: Date;
  /** Percent behind at/above which it goes RED (default 10). */
  redThreshold?: number;
  /** Percent behind at/above which it goes AMBER (default 5). */
  amberThreshold?: number;
}

export interface ScheduleHealth {
  plannedPercent: number;
  actualPercent: number;
  /** actual - planned. Positive = ahead of schedule, negative = behind. */
  variancePercent: number;
  /** Positive = ahead by N days, negative = behind by N days. Null if no schedule. */
  daysAheadBehind: number | null;
  rag: Rag;
  /** True when behind beyond the red threshold — surfaced to the command centre. */
  slip: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Straight-line planned progress from plannedStart→plannedFinish vs actual %, producing a
 * variance, an estimate of days ahead/behind, and a RAG flag. Pure and deterministic
 * given `asOf`.
 */
export function scheduleHealth(input: ScheduleHealthInput): ScheduleHealth {
  const redThreshold = input.redThreshold ?? 10;
  const amberThreshold = input.amberThreshold ?? 5;
  const actualPercent = round2(Math.min(100, Math.max(0, input.actualPercent)));

  const { plannedStart, plannedFinish, asOf } = input;

  // No schedule dates → cannot judge; treat as on-track green.
  if (!plannedStart || !plannedFinish || plannedFinish <= plannedStart) {
    return {
      plannedPercent: 0,
      actualPercent,
      variancePercent: actualPercent,
      daysAheadBehind: null,
      rag: 'GREEN',
      slip: false,
    };
  }

  const totalMs = plannedFinish.getTime() - plannedStart.getTime();
  const elapsedMs = asOf.getTime() - plannedStart.getTime();
  const plannedFraction = Math.min(1, Math.max(0, elapsedMs / totalMs));
  const plannedPercent = round2(plannedFraction * 100);

  const variancePercent = round2(actualPercent - plannedPercent);

  // Convert the % variance into an approximate day count over the plan duration.
  const totalDays = totalMs / MS_PER_DAY;
  const daysAheadBehind = round2((variancePercent / 100) * totalDays);

  const behind = -variancePercent; // positive when behind
  let rag: Rag = 'GREEN';
  if (behind >= redThreshold) rag = 'RED';
  else if (behind >= amberThreshold) rag = 'AMBER';

  return {
    plannedPercent,
    actualPercent,
    variancePercent,
    daysAheadBehind,
    rag,
    slip: rag === 'RED',
  };
}

// ---------------------------------------------------------------------------
// Template explosion
// ---------------------------------------------------------------------------
export interface TemplateNode {
  title: string;
  type?: string;
  weight?: number;
  children?: TemplateNode[];
}

export interface FlatTemplateNode {
  tempId: string;
  parentTempId: string | null;
  title: string;
  type: 'PHASE' | 'TASK' | 'SUBTASK';
  weight: number;
  position: number;
}

const DEPTH_TYPE: Array<'PHASE' | 'TASK' | 'SUBTASK'> = ['PHASE', 'TASK', 'SUBTASK'];

/**
 * Flatten a nested template structure into a parent-linked list with temp ids, inferring
 * node type from depth when not explicitly given (0=PHASE, 1=TASK, 2+=SUBTASK). Pure.
 */
export function flattenTemplate(structure: unknown): FlatTemplateNode[] {
  const out: FlatTemplateNode[] = [];
  let counter = 0;

  const roots: TemplateNode[] = Array.isArray(structure)
    ? (structure as TemplateNode[])
    : structure && typeof structure === 'object' && Array.isArray((structure as any).nodes)
      ? ((structure as any).nodes as TemplateNode[])
      : [];

  const walk = (node: TemplateNode, parentTempId: string | null, depth: number, position: number) => {
    const tempId = `t${counter++}`;
    const type =
      node.type && DEPTH_TYPE.includes(node.type as any)
        ? (node.type as 'PHASE' | 'TASK' | 'SUBTASK')
        : DEPTH_TYPE[Math.min(depth, DEPTH_TYPE.length - 1)];
    out.push({
      tempId,
      parentTempId,
      title: node.title,
      type,
      weight: typeof node.weight === 'number' && node.weight >= 0 ? node.weight : 1,
      position,
    });
    (node.children ?? []).forEach((child, i) => walk(child, tempId, depth + 1, i));
  };

  roots.forEach((r, i) => walk(r, null, 0, i));
  return out;
}
