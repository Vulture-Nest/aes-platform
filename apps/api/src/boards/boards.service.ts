import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BoardVisibility, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import {
  canSeeConfidential,
  isDirector,
  isSysAdmin,
} from './confidentiality';
import {
  AddBoardMemberDto,
  AddChecklistItemDto,
  AddCommentDto,
  CreateBoardDto,
  CreateCardDto,
  CreateListDto,
  MoveCardDto,
  ReclassifyBoardDto,
  ToggleChecklistItemDto,
  UpdateBoardDto,
  UpdateCardDto,
  UpdateListDto,
} from './dto/board.dto';

/** Extract the flat list of role strings from an authenticated user. */
function rolesOf(user: AuthenticatedUser): string[] {
  return (user.roles ?? []).map((r) => r.role);
}

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // =========================================================================
  // Confidentiality plumbing
  // =========================================================================

  /**
   * Load a board with its members and apply the confidentiality predicate for
   * CONTENT access. Returns null when the user may NOT see the board content, so
   * callers can emit a 404 (never leak existence via 403).
   */
  private async loadVisibleBoard(id: string, user: AuthenticatedUser) {
    const board = await this.prisma.board.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!board) {
      return null;
    }
    const roles = rolesOf(user);
    if (!canSeeConfidential(roles, board, board.members, user.id)) {
      return null;
    }
    return board;
  }

  /** Board content getter — throws 404 (not 403) when hidden by confidentiality. */
  private async requireVisibleBoard(id: string, user: AuthenticatedUser) {
    const board = await this.loadVisibleBoard(id, user);
    if (!board) {
      throw new NotFoundException('Board not found');
    }
    return board;
  }

  /**
   * Resolve the board owning a card (via list) and enforce content visibility.
   * Returns the card with its list+board, or throws 404.
   */
  private async requireVisibleCard(cardId: string, user: AuthenticatedUser) {
    const card = await this.prisma.boardCard.findUnique({
      where: { id: cardId },
      include: { list: { include: { board: { include: { members: true } } } } },
    });
    if (!card) {
      throw new NotFoundException('Card not found');
    }
    const board = card.list.board;
    if (!canSeeConfidential(rolesOf(user), board, board.members, user.id)) {
      throw new NotFoundException('Card not found');
    }
    return card;
  }

  /** Resolve the board owning a list and enforce content visibility. */
  private async requireVisibleList(listId: string, user: AuthenticatedUser) {
    const list = await this.prisma.boardList.findUnique({
      where: { id: listId },
      include: { board: { include: { members: true } } },
    });
    if (!list) {
      throw new NotFoundException('List not found');
    }
    if (!canSeeConfidential(rolesOf(user), list.board, list.board.members, user.id)) {
      throw new NotFoundException('List not found');
    }
    return list;
  }

  // =========================================================================
  // Boards
  // =========================================================================

  /**
   * List boards visible to the user. Non-directors NEVER see DIRECTOR_CONFIDENTIAL
   * boards. Directors see confidential boards that either have no explicit members
   * or that name them as a member. Enforced in the DB WHERE clause so confidential
   * boards are simply absent — no separate filtering pass that could leak counts.
   */
  async listBoards(user: AuthenticatedUser) {
    const roles = rolesOf(user);
    const where: Prisma.BoardWhereInput = isDirector(roles)
      ? {
          OR: [
            { visibility: BoardVisibility.TEAM },
            // confidential + open to all directors (no explicit members)
            {
              visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
              members: { none: {} },
            },
            // confidential + this director is a named member
            {
              visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL,
              members: { some: { userId: user.id } },
            },
          ],
        }
      : { visibility: BoardVisibility.TEAM };

    return this.prisma.board.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { members: true },
    });
  }

  /** Get a single board with its lists/cards (confidential → 404 if not permitted). */
  async getBoard(id: string, user: AuthenticatedUser) {
    await this.requireVisibleBoard(id, user);
    return this.prisma.board.findUnique({
      where: { id },
      include: {
        members: true,
        lists: {
          orderBy: { position: 'asc' },
          include: {
            cards: {
              orderBy: { position: 'asc' },
              include: {
                checklistItems: { orderBy: { position: 'asc' } },
                comments: { orderBy: { createdAt: 'asc' } },
              },
            },
          },
        },
      },
    });
  }

  async createBoard(dto: CreateBoardDto, user: AuthenticatedUser) {
    // Only directors may create a DIRECTOR_CONFIDENTIAL board.
    if (
      dto.visibility === BoardVisibility.DIRECTOR_CONFIDENTIAL &&
      !isDirector(rolesOf(user))
    ) {
      throw new ForbiddenException('Only directors may create confidential boards');
    }
    const board = await this.prisma.board.create({
      data: {
        name: dto.name,
        description: dto.description,
        visibility: dto.visibility ?? BoardVisibility.TEAM,
        entityId: dto.entityId,
        projectId: dto.projectId,
        ownerUserId: dto.ownerUserId ?? user.id,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'CREATE',
      tableName: 'boards',
      recordId: board.id,
      after: { name: board.name, visibility: board.visibility },
    });
    return board;
  }

  async updateBoard(id: string, dto: UpdateBoardDto, user: AuthenticatedUser) {
    const before = await this.requireVisibleBoard(id, user);
    // Visibility changes must go through reclassify (director-only, audited).
    if (dto.visibility && dto.visibility !== before.visibility) {
      throw new ForbiddenException('Use the visibility endpoint to reclassify a board');
    }
    const board = await this.prisma.board.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        entityId: dto.entityId,
        projectId: dto.projectId,
        ownerUserId: dto.ownerUserId,
        updatedBy: user.id,
      },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'UPDATE',
      tableName: 'boards',
      recordId: id,
      before: { name: before.name },
      after: { name: board.name },
    });
    return board;
  }

  async deleteBoard(id: string, user: AuthenticatedUser) {
    await this.requireVisibleBoard(id, user);
    await this.prisma.board.delete({ where: { id } });
    await this.audit.record({
      actorUserId: user.id,
      action: 'DELETE',
      tableName: 'boards',
      recordId: id,
    });
    return { deleted: true };
  }

  /**
   * Reclassify a board's visibility ("graduation"). Director-only, audited. A
   * confidential board cannot be reclassified by a non-director (route guard also
   * enforces this, but we re-check here as defence-in-depth for confidential reads).
   */
  async reclassify(id: string, dto: ReclassifyBoardDto, user: AuthenticatedUser) {
    const roles = rolesOf(user);
    if (!isDirector(roles)) {
      throw new ForbiddenException('Only directors may reclassify board visibility');
    }
    const before = await this.prisma.board.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!before) {
      throw new NotFoundException('Board not found');
    }
    const board = await this.prisma.board.update({
      where: { id },
      data: { visibility: dto.visibility, updatedBy: user.id },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'STATUS_CHANGE',
      tableName: 'boards',
      recordId: id,
      before: { visibility: before.visibility },
      after: { visibility: board.visibility },
    });
    return board;
  }

  // =========================================================================
  // Members
  // =========================================================================

  async addMember(boardId: string, dto: AddBoardMemberDto, user: AuthenticatedUser) {
    await this.requireVisibleBoard(boardId, user);
    const member = await this.prisma.boardMember.upsert({
      where: { boardId_userId: { boardId, userId: dto.userId } },
      create: {
        boardId,
        userId: dto.userId,
        role: dto.role,
        createdBy: user.id,
        updatedBy: user.id,
      },
      update: { role: dto.role, updatedBy: user.id },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'UPDATE',
      tableName: 'board_members',
      recordId: member.id,
      after: { boardId, userId: dto.userId, role: dto.role },
    });
    return member;
  }

  async removeMember(boardId: string, userId: string, user: AuthenticatedUser) {
    await this.requireVisibleBoard(boardId, user);
    await this.prisma.boardMember.delete({
      where: { boardId_userId: { boardId, userId } },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'DELETE',
      tableName: 'board_members',
      before: { boardId, userId },
    });
    return { removed: true };
  }

  // =========================================================================
  // Lists
  // =========================================================================

  async createList(boardId: string, dto: CreateListDto, user: AuthenticatedUser) {
    await this.requireVisibleBoard(boardId, user);
    const position = dto.position ?? (await this.nextListPosition(boardId));
    return this.prisma.boardList.create({
      data: {
        boardId,
        name: dto.name,
        position,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
  }

  async updateList(listId: string, dto: UpdateListDto, user: AuthenticatedUser) {
    await this.requireVisibleList(listId, user);
    return this.prisma.boardList.update({
      where: { id: listId },
      data: { name: dto.name, position: dto.position, updatedBy: user.id },
    });
  }

  async deleteList(listId: string, user: AuthenticatedUser) {
    await this.requireVisibleList(listId, user);
    await this.prisma.boardList.delete({ where: { id: listId } });
    return { deleted: true };
  }

  private async nextListPosition(boardId: string): Promise<number> {
    const last = await this.prisma.boardList.findFirst({
      where: { boardId },
      orderBy: { position: 'desc' },
    });
    return last ? last.position + 1 : 0;
  }

  // =========================================================================
  // Cards
  // =========================================================================

  async createCard(listId: string, dto: CreateCardDto, user: AuthenticatedUser) {
    await this.requireVisibleList(listId, user);
    const position = dto.position ?? (await this.nextCardPosition(listId));
    return this.prisma.boardCard.create({
      data: {
        listId,
        title: dto.title,
        description: dto.description,
        position,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
  }

  async updateCard(cardId: string, dto: UpdateCardDto, user: AuthenticatedUser) {
    await this.requireVisibleCard(cardId, user);
    return this.prisma.boardCard.update({
      where: { id: cardId },
      data: {
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        updatedBy: user.id,
      },
    });
  }

  /** Move a card to another (or the same) list at a given zero-based position. */
  async moveCard(cardId: string, dto: MoveCardDto, user: AuthenticatedUser) {
    const card = await this.requireVisibleCard(cardId, user);
    // The destination list must belong to the SAME (visible) board — prevents
    // smuggling cards out of a confidential board into a team board.
    const destList = await this.requireVisibleList(dto.listId, user);
    if (destList.boardId !== card.list.boardId) {
      throw new ForbiddenException('Cannot move a card across boards');
    }
    return this.prisma.boardCard.update({
      where: { id: cardId },
      data: { listId: dto.listId, position: dto.position, updatedBy: user.id },
    });
  }

  async assignCard(cardId: string, assigneeId: string | null, user: AuthenticatedUser) {
    await this.requireVisibleCard(cardId, user);
    return this.prisma.boardCard.update({
      where: { id: cardId },
      data: { assigneeId, updatedBy: user.id },
    });
  }

  async deleteCard(cardId: string, user: AuthenticatedUser) {
    await this.requireVisibleCard(cardId, user);
    await this.prisma.boardCard.delete({ where: { id: cardId } });
    return { deleted: true };
  }

  private async nextCardPosition(listId: string): Promise<number> {
    const last = await this.prisma.boardCard.findFirst({
      where: { listId },
      orderBy: { position: 'desc' },
    });
    return last ? last.position + 1 : 0;
  }

  // =========================================================================
  // Checklist items
  // =========================================================================

  async addChecklistItem(
    cardId: string,
    dto: AddChecklistItemDto,
    user: AuthenticatedUser,
  ) {
    await this.requireVisibleCard(cardId, user);
    const position =
      dto.position ??
      (await this.prisma.cardChecklistItem
        .findFirst({ where: { cardId }, orderBy: { position: 'desc' } })
        .then((last) => (last ? last.position + 1 : 0)));
    return this.prisma.cardChecklistItem.create({
      data: { cardId, text: dto.text, position },
    });
  }

  async toggleChecklistItem(
    itemId: string,
    dto: ToggleChecklistItemDto,
    user: AuthenticatedUser,
  ) {
    const item = await this.prisma.cardChecklistItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }
    await this.requireVisibleCard(item.cardId, user);
    return this.prisma.cardChecklistItem.update({
      where: { id: itemId },
      data: { done: dto.done },
    });
  }

  async deleteChecklistItem(itemId: string, user: AuthenticatedUser) {
    const item = await this.prisma.cardChecklistItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }
    await this.requireVisibleCard(item.cardId, user);
    await this.prisma.cardChecklistItem.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  // =========================================================================
  // Comments
  // =========================================================================

  async addComment(cardId: string, dto: AddCommentDto, user: AuthenticatedUser) {
    await this.requireVisibleCard(cardId, user);
    return this.prisma.cardComment.create({
      data: { cardId, body: dto.body, authorId: user.id },
    });
  }

  async listComments(cardId: string, user: AuthenticatedUser) {
    await this.requireVisibleCard(cardId, user);
    return this.prisma.cardComment.findMany({
      where: { cardId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // =========================================================================
  // Admin container management (does NOT grant content access)
  // =========================================================================

  /**
   * Admin container access — rename/backup/restore metadata WITHOUT content. This
   * exists so a SYS_ADMIN who is NOT a director can manage the container (e.g. for
   * a backup/restore tool) while being blocked from card contents. Any such access
   * to a confidential board is prominently audited.
   */
  async adminGetBoardContainer(id: string, user: AuthenticatedUser) {
    const roles = rolesOf(user);
    if (!isSysAdmin(roles)) {
      throw new ForbiddenException('Admin access required');
    }
    const board = await this.prisma.board.findUnique({ where: { id } });
    if (!board) {
      throw new NotFoundException('Board not found');
    }
    const director = isDirector(roles);
    if (board.visibility === BoardVisibility.DIRECTOR_CONFIDENTIAL && !director) {
      // Loud audit trail: an admin touched a confidential container.
      await this.audit.record({
        actorUserId: user.id,
        action: 'STATUS_CHANGE',
        tableName: 'boards',
        recordId: id,
        after: { access: 'BOARD_CONFIDENTIAL_ADMIN_ACCESS' },
      });
    }
    // Return container metadata ONLY — never lists/cards/checklist/comments.
    return {
      id: board.id,
      name: board.name,
      description: board.description,
      visibility: board.visibility,
      entityId: board.entityId,
      projectId: board.projectId,
      ownerUserId: board.ownerUserId,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    };
  }

  async adminRenameBoard(id: string, name: string, user: AuthenticatedUser) {
    const roles = rolesOf(user);
    if (!isSysAdmin(roles)) {
      throw new ForbiddenException('Admin access required');
    }
    const board = await this.prisma.board.findUnique({ where: { id } });
    if (!board) {
      throw new NotFoundException('Board not found');
    }
    if (
      board.visibility === BoardVisibility.DIRECTOR_CONFIDENTIAL &&
      !isDirector(roles)
    ) {
      await this.audit.record({
        actorUserId: user.id,
        action: 'STATUS_CHANGE',
        tableName: 'boards',
        recordId: id,
        after: { access: 'BOARD_CONFIDENTIAL_ADMIN_ACCESS', name },
      });
    }
    return this.prisma.board.update({
      where: { id },
      data: { name, updatedBy: user.id },
    });
  }
}
