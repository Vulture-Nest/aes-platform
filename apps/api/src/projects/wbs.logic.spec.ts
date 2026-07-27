import {
  flattenTemplate,
  projectPercent,
  rollUp,
  RollUpNode,
  scheduleHealth,
} from './wbs.logic';

describe('rollUp', () => {
  it('leaves keep their own percent', () => {
    const nodes: RollUpNode[] = [
      { id: 'a', parentId: null, weight: 1, percentComplete: 40 },
      { id: 'b', parentId: null, weight: 1, percentComplete: 80 },
    ];
    const r = rollUp(nodes);
    expect(r['a']).toBe(40);
    expect(r['b']).toBe(80);
  });

  it('a task % is the weighted average of its subtasks', () => {
    // task T with two subtasks: s1 weight 3 @ 100, s2 weight 1 @ 0 => (300+0)/4 = 75
    const nodes: RollUpNode[] = [
      { id: 'T', parentId: null, weight: 1, percentComplete: 0 },
      { id: 's1', parentId: 'T', weight: 3, percentComplete: 100 },
      { id: 's2', parentId: 'T', weight: 1, percentComplete: 0 },
    ];
    const r = rollUp(nodes);
    expect(r['T']).toBe(75);
  });

  it('rolls up three levels: phase = weighted avg of tasks = weighted avg of subtasks', () => {
    const nodes: RollUpNode[] = [
      { id: 'P', parentId: null, weight: 1, percentComplete: 0 },
      { id: 'T1', parentId: 'P', weight: 1, percentComplete: 0 },
      { id: 'T2', parentId: 'P', weight: 1, percentComplete: 0 },
      { id: 's1', parentId: 'T1', weight: 1, percentComplete: 100 },
      { id: 's2', parentId: 'T1', weight: 1, percentComplete: 50 },
      { id: 's3', parentId: 'T2', weight: 1, percentComplete: 0 },
    ];
    const r = rollUp(nodes);
    expect(r['T1']).toBe(75); // (100+50)/2
    expect(r['T2']).toBe(0);
    expect(r['P']).toBe(37.5); // (75+0)/2
  });

  it('falls back to unweighted average when child weights are all zero', () => {
    const nodes: RollUpNode[] = [
      { id: 'T', parentId: null, weight: 1, percentComplete: 0 },
      { id: 's1', parentId: 'T', weight: 0, percentComplete: 100 },
      { id: 's2', parentId: 'T', weight: 0, percentComplete: 0 },
    ];
    const r = rollUp(nodes);
    expect(r['T']).toBe(50);
  });

  it('clamps out-of-range leaf values', () => {
    const nodes: RollUpNode[] = [
      { id: 'a', parentId: null, weight: 1, percentComplete: 150 },
      { id: 'b', parentId: null, weight: 1, percentComplete: -20 },
    ];
    const r = rollUp(nodes);
    expect(r['a']).toBe(100);
    expect(r['b']).toBe(0);
  });
});

describe('projectPercent', () => {
  it('is the weighted average of top-level phases', () => {
    const nodes: RollUpNode[] = [
      { id: 'P1', parentId: null, weight: 2, percentComplete: 0 },
      { id: 'P2', parentId: null, weight: 1, percentComplete: 0 },
    ];
    const rolled = { P1: 90, P2: 0 };
    // (90*2 + 0*1)/3 = 60
    expect(projectPercent(nodes, rolled)).toBe(60);
  });

  it('is 0 with no top-level nodes', () => {
    expect(projectPercent([], {})).toBe(0);
  });
});

describe('scheduleHealth', () => {
  const start = new Date('2026-01-01T00:00:00Z');
  const finish = new Date('2026-01-11T00:00:00Z'); // 10-day plan

  it('computes planned% straight-line and RED when >10% behind', () => {
    // halfway through the plan => planned 50%; actual 30% => 20% behind => RED, slip
    const h = scheduleHealth({
      plannedStart: start,
      plannedFinish: finish,
      actualPercent: 30,
      asOf: new Date('2026-01-06T00:00:00Z'),
    });
    expect(h.plannedPercent).toBe(50);
    expect(h.actualPercent).toBe(30);
    expect(h.variancePercent).toBe(-20);
    expect(h.rag).toBe('RED');
    expect(h.slip).toBe(true);
    // 20% behind over 10 days => ~2 days behind
    expect(h.daysAheadBehind).toBe(-2);
  });

  it('is GREEN when on or ahead of schedule', () => {
    const h = scheduleHealth({
      plannedStart: start,
      plannedFinish: finish,
      actualPercent: 60,
      asOf: new Date('2026-01-06T00:00:00Z'), // planned 50
    });
    expect(h.variancePercent).toBe(10);
    expect(h.daysAheadBehind).toBe(1);
    expect(h.rag).toBe('GREEN');
    expect(h.slip).toBe(false);
  });

  it('is AMBER between the amber and red thresholds', () => {
    // planned 50, actual 43 => 7% behind => AMBER (>=5, <10)
    const h = scheduleHealth({
      plannedStart: start,
      plannedFinish: finish,
      actualPercent: 43,
      asOf: new Date('2026-01-06T00:00:00Z'),
    });
    expect(h.rag).toBe('AMBER');
    expect(h.slip).toBe(false);
  });

  it('clamps planned% to 100 past the planned finish', () => {
    const h = scheduleHealth({
      plannedStart: start,
      plannedFinish: finish,
      actualPercent: 100,
      asOf: new Date('2026-02-01T00:00:00Z'),
    });
    expect(h.plannedPercent).toBe(100);
    expect(h.variancePercent).toBe(0);
    expect(h.rag).toBe('GREEN');
  });

  it('returns GREEN/no-days when there is no schedule', () => {
    const h = scheduleHealth({
      plannedStart: null,
      plannedFinish: null,
      actualPercent: 25,
      asOf: new Date('2026-01-06T00:00:00Z'),
    });
    expect(h.daysAheadBehind).toBeNull();
    expect(h.rag).toBe('GREEN');
    expect(h.slip).toBe(false);
  });

  it('respects custom thresholds', () => {
    // 6% behind: with redThreshold 3 => RED
    const h = scheduleHealth({
      plannedStart: start,
      plannedFinish: finish,
      actualPercent: 44,
      asOf: new Date('2026-01-06T00:00:00Z'), // planned 50 => 6% behind
      redThreshold: 3,
      amberThreshold: 1,
    });
    expect(h.rag).toBe('RED');
  });
});

describe('flattenTemplate', () => {
  it('flattens nested structure, infers types by depth, links parents', () => {
    const structure = [
      {
        title: 'Phase 1',
        children: [
          { title: 'Task 1.1', weight: 2, children: [{ title: 'Sub 1.1.1' }] },
          { title: 'Task 1.2' },
        ],
      },
    ];
    const flat = flattenTemplate(structure);
    expect(flat).toHaveLength(4);

    const phase = flat.find((n) => n.title === 'Phase 1')!;
    expect(phase.type).toBe('PHASE');
    expect(phase.parentTempId).toBeNull();

    const task11 = flat.find((n) => n.title === 'Task 1.1')!;
    expect(task11.type).toBe('TASK');
    expect(task11.parentTempId).toBe(phase.tempId);
    expect(task11.weight).toBe(2);

    const sub = flat.find((n) => n.title === 'Sub 1.1.1')!;
    expect(sub.type).toBe('SUBTASK');
    expect(sub.parentTempId).toBe(task11.tempId);
    expect(sub.weight).toBe(1); // default
  });

  it('accepts an explicit type and { nodes: [...] } wrapper', () => {
    const flat = flattenTemplate({ nodes: [{ title: 'Milestone', type: 'TASK' }] });
    expect(flat).toHaveLength(1);
    expect(flat[0].type).toBe('TASK');
  });

  it('returns [] for empty/invalid structure', () => {
    expect(flattenTemplate(null)).toEqual([]);
    expect(flattenTemplate({})).toEqual([]);
  });
});
