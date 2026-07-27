import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { Roles } from '../rbac/roles.decorator';
import { BoardsService } from './boards.service';
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

// Roles allowed to reach board CONTENT routes. Note: the route guard only gates
// which roles can hit the endpoint at all — DIRECTOR_CONFIDENTIAL visibility is
// enforced per-record in the service layer (invisible to non-directors → 404).
const BOARD_ROLES = [
  'OPS_STAFF',
  'OPS_DIRECTOR',
  'FINANCE_DIRECTOR',
  'DIRECTOR',
  'SITE_MANAGER',
  'SYS_ADMIN',
] as const;

const DIRECTOR_ROLES = ['OPS_DIRECTOR', 'FINANCE_DIRECTOR', 'DIRECTOR'] as const;

@ApiTags('boards')
@ApiBearerAuth()
@Controller({ path: 'boards', version: '1' })
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  // ---- Boards -------------------------------------------------------------

  @Get()
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'List boards (confidential boards hidden from non-directors)' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.boards.listBoards(user);
  }

  @Get(':id')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Get a board with lists/cards (404 if confidential and not permitted)' })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.boards.getBoard(id, user);
  }

  @Post()
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Create a board (confidential requires a director)' })
  create(@Body() dto: CreateBoardDto, @CurrentUser() user: AuthenticatedUser) {
    return this.boards.createBoard(dto, user);
  }

  @Patch(':id')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Update board metadata' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoardDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.updateBoard(id, dto, user);
  }

  @Delete(':id')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Delete a board' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.boards.deleteBoard(id, user);
  }

  @Post(':id/visibility')
  @Roles(...DIRECTOR_ROLES)
  @ApiOperation({ summary: 'Reclassify board visibility (director-only, audited)' })
  reclassify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReclassifyBoardDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.reclassify(id, dto, user);
  }

  // ---- Members ------------------------------------------------------------

  @Post(':id/members')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Add or update a board member' })
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddBoardMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.addMember(id, dto, user);
  }

  @Delete(':id/members/:userId')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Remove a board member' })
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.removeMember(id, userId, user);
  }

  // ---- Lists --------------------------------------------------------------

  @Post(':id/lists')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Create a list on a board' })
  createList(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateListDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.createList(id, dto, user);
  }

  @Patch('lists/:listId')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Rename/reposition a list' })
  updateList(
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: UpdateListDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.updateList(listId, dto, user);
  }

  @Delete('lists/:listId')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Delete a list' })
  deleteList(
    @Param('listId', ParseUUIDPipe) listId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.deleteList(listId, user);
  }

  // ---- Cards --------------------------------------------------------------

  @Post('lists/:listId/cards')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Create a card in a list' })
  createCard(
    @Param('listId', ParseUUIDPipe) listId: string,
    @Body() dto: CreateCardDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.createCard(listId, dto, user);
  }

  @Patch('cards/:cardId')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Update a card (title/description/assignee/due date)' })
  updateCard(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: UpdateCardDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.updateCard(cardId, dto, user);
  }

  @Post('cards/:cardId/move')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Move a card between lists / positions (same board only)' })
  moveCard(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: MoveCardDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.moveCard(cardId, dto, user);
  }

  @Post('cards/:cardId/assign')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Assign (or clear) a card assignee' })
  assignCard(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() body: { assigneeId: string | null },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.assignCard(cardId, body?.assigneeId ?? null, user);
  }

  @Delete('cards/:cardId')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Delete a card' })
  deleteCard(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.deleteCard(cardId, user);
  }

  // ---- Checklist items ----------------------------------------------------

  @Post('cards/:cardId/checklist')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Add a checklist item to a card' })
  addChecklistItem(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: AddChecklistItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.addChecklistItem(cardId, dto, user);
  }

  @Patch('checklist/:itemId')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Toggle a checklist item done/undone' })
  toggleChecklistItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ToggleChecklistItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.toggleChecklistItem(itemId, dto, user);
  }

  @Delete('checklist/:itemId')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Delete a checklist item' })
  deleteChecklistItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.deleteChecklistItem(itemId, user);
  }

  // ---- Comments -----------------------------------------------------------

  @Post('cards/:cardId/comments')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'Add a comment to a card' })
  addComment(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.addComment(cardId, dto, user);
  }

  @Get('cards/:cardId/comments')
  @Roles(...BOARD_ROLES)
  @ApiOperation({ summary: 'List comments on a card' })
  listComments(
    @Param('cardId', ParseUUIDPipe) cardId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.listComments(cardId, user);
  }

  // ---- Admin container management (no content access) ---------------------

  @Get(':id/container')
  @Roles('SYS_ADMIN')
  @ApiOperation({
    summary: 'Admin: get board container metadata only (no content; confidential access is audited)',
  })
  adminContainer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.adminGetBoardContainer(id, user);
  }

  @Patch(':id/container')
  @Roles('SYS_ADMIN')
  @ApiOperation({ summary: 'Admin: rename a board container (confidential access is audited)' })
  adminRename(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.boards.adminRenameBoard(id, body.name, user);
  }
}
