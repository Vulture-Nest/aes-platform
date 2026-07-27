import { Prisma } from '@prisma/client';
import { ProjectsService } from './projects.service';

function decimal(n: number) {
  return new Prisma.Decimal(n);
}

describe('ProjectsService.recomputeProject', () => {
  const audit = { record: jest.fn() };

  function makePrisma(nodes: any[]) {
    return {
      projectNode: {
        findMany: jest.fn().mockResolvedValue(nodes),
        update: jest.fn().mockImplementation((args: any) => Promise.resolve(args)),
      },
      project: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it('persists rolled-up parent % and project %', async () => {
    const nodes = [
      { id: 'P', parentId: null, weight: decimal(1), percentComplete: decimal(0) },
      { id: 's1', parentId: 'P', weight: decimal(1), percentComplete: decimal(100) },
      { id: 's2', parentId: 'P', weight: decimal(1), percentComplete: decimal(0) },
    ];
    const prisma = makePrisma(nodes);
    const service = new ProjectsService(prisma as any, audit as any);

    const pct = await service.recomputeProject('proj', 'user');

    // parent P should be updated to 50, project to 50
    expect(prisma.projectNode.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'P' } }),
    );
    expect(pct).toBe(50);
    const projArgs = prisma.project.update.mock.calls[0][0];
    expect(projArgs.data.percentComplete.toNumber()).toBe(50);
  });

  it('does not update leaf nodes (only parents whose value changed)', async () => {
    const nodes = [
      { id: 'a', parentId: null, weight: decimal(1), percentComplete: decimal(40) },
    ];
    const prisma = makePrisma(nodes);
    const service = new ProjectsService(prisma as any, audit as any);

    await service.recomputeProject('proj', 'user');
    // 'a' is a leaf -> no node update
    expect(prisma.projectNode.update).not.toHaveBeenCalled();
  });
});
