import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { BoardVisibility } from '@prisma/client';
import { BoardsService } from './boards.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

function user(id: string, roles: string[]): AuthenticatedUser {
  return {
    id,
    email: `${id}@aes.test`,
    status: 'ACTIVE' as AuthenticatedUser['status'],
    roles: roles.map((role) => ({ siteId: null, role })),
  };
}

const director = user('d1', ['FINANCE_DIRECTOR']);
const otherDirector = user('d2', ['OPS_DIRECTOR']);
const staff = user('s1', ['OPS_STAFF']);
const admin = user('a1', ['SYS_ADMIN']);

describe('BoardsService — confidentiality enforcement', () => {
  const prisma = {
    board: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    boardCard: { findUnique: jest.fn(), update: jest.fn() },
  } as Record<string, Record<string, jest.Mock>>;
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new BoardsService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  describe('listBoards', () => {
    it('non-director query only requests TEAM boards', async () => {
      prisma.board.findMany.mockResolvedValue([]);
      await service.listBoards(staff);
      expect(prisma.board.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { visibility: BoardVisibility.TEAM } }),
      );
    });

    it('director query includes confidential (open + member-of) boards', async () => {
      prisma.board.findMany.mockResolvedValue([]);
      await service.listBoards(director);
      const arg = prisma.board.findMany.mock.calls[0][0];
      expect(arg.where.OR).toEqual(
        expect.arrayContaining([
          { visibility: BoardVisibility.TEAM },
          {
            visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
            members: { none: {} },
          },
          {
            visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
            members: { some: { userId: 'd1' } },
          },
        ]),
      );
    });
  });

  describe('getBoard', () => {
    it('returns 404 for a confidential board to a non-director (no existence leak)', async () => {
      prisma.board.findUnique.mockResolvedValue({
        id: 'b1',
        visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
        members: [],
      });
      await expect(service.getBoard('b1', staff)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 for a confidential board to a SYS_ADMIN who is not a director', async () => {
      prisma.board.findUnique.mockResolvedValue({
        id: 'b1',
        visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
        members: [],
      });
      await expect(service.getBoard('b1', admin)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('director sees a confidential board with no members', async () => {
      prisma.board.findUnique
        .mockResolvedValueOnce({
          id: 'b1',
          visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
          members: [],
        })
        .mockResolvedValueOnce({ id: 'b1', lists: [] });
      const res = await service.getBoard('b1', director);
      expect(res).toEqual({ id: 'b1', lists: [] });
    });

    it('member-restricted confidential board is hidden from a non-member director (404)', async () => {
      prisma.board.findUnique.mockResolvedValue({
        id: 'b1',
        visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
        members: [{ userId: 'd1' }],
      });
      await expect(service.getBoard('b1', otherDirector)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('member-restricted confidential board is visible to the named director', async () => {
      prisma.board.findUnique
        .mockResolvedValueOnce({
          id: 'b1',
          visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
          members: [{ userId: 'd1' }],
        })
        .mockResolvedValueOnce({ id: 'b1', lists: [] });
      const res = await service.getBoard('b1', director);
      expect(res).toEqual({ id: 'b1', lists: [] });
    });
  });

  describe('card content access', () => {
    it('blocks a non-director from reading a confidential card (404)', async () => {
      prisma.boardCard.findUnique.mockResolvedValue({
        id: 'c1',
        list: {
          boardId: 'b1',
          board: { visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL, members: [] },
        },
      });
      await expect(service.listComments('c1', staff)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createBoard', () => {
    it('forbids a non-director from creating a confidential board', async () => {
      await expect(
        service.createBoard(
          { name: 'secret', visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL },
          staff,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets a director create a confidential board and audits it', async () => {
      prisma.board.create.mockResolvedValue({
        id: 'b1',
        name: 'secret',
        visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
      });
      const res = await service.createBoard(
        { name: 'secret', visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL },
        director,
      );
      expect(res.id).toBe('b1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', tableName: 'boards' }),
      );
    });
  });

  describe('reclassify', () => {
    it('forbids a non-director from reclassifying', async () => {
      await expect(
        service.reclassify('b1', { visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL }, staff),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('director reclassify writes a STATUS_CHANGE audit entry', async () => {
      prisma.board.findUnique.mockResolvedValue({
        id: 'b1',
        visibility: BoardVisibility.TEAM,
        members: [],
      });
      prisma.board.update.mockResolvedValue({
        id: 'b1',
        visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
      });
      await service.reclassify(
        'b1',
        { visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL },
        director,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STATUS_CHANGE', tableName: 'boards' }),
      );
    });
  });

  describe('admin container access', () => {
    it('audits a confidential-board container access by a non-director admin', async () => {
      prisma.board.findUnique.mockResolvedValue({
        id: 'b1',
        name: 'secret',
        visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
      });
      const res = await service.adminGetBoardContainer('b1', admin);
      // returns metadata only — never lists/cards
      expect(res).not.toHaveProperty('lists');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ after: { access: 'BOARD_CONFIDENTIAL_ADMIN_ACCESS' } }),
      );
    });

    it('does not audit for a plain TEAM board container access', async () => {
      prisma.board.findUnique.mockResolvedValue({
        id: 'b1',
        name: 'open',
        visibility: BoardVisibility.TEAM,
      });
      await service.adminGetBoardContainer('b1', admin);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('rejects a non-admin from container access', async () => {
      await expect(service.adminGetBoardContainer('b1', staff)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
