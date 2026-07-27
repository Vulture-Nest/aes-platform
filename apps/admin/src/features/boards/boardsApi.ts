import { api } from '../../api/api';

export type BoardVisibility = 'TEAM' | 'DIRECTOR_CONFIDENTIAL';

export interface BoardMember {
  id: string;
  boardId: string;
  userId: string;
  role: string | null;
}

export interface BoardRecord {
  id: string;
  entityId: string | null;
  name: string;
  description: string | null;
  visibility: BoardVisibility;
  ownerUserId: string | null;
  projectId: string | null;
  createdAt: string;
  members: BoardMember[];
}

export interface ChecklistItem {
  id: string;
  cardId: string;
  text: string;
  done: boolean;
  position: number;
}

export interface CardComment {
  id: string;
  cardId: string;
  authorId: string | null;
  body: string;
  createdAt: string;
}

export interface BoardCard {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  position: number;
  assigneeId: string | null;
  dueDate: string | null;
  createdAt: string;
  checklistItems: ChecklistItem[];
  comments: CardComment[];
}

export interface BoardList {
  id: string;
  boardId: string;
  name: string;
  position: number;
  cards: BoardCard[];
}

export interface BoardDetail extends BoardRecord {
  lists: BoardList[];
}

export const boardsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getBoards: build.query<BoardRecord[], void>({
      query: () => 'v1/boards',
    }),
    getBoard: build.query<BoardDetail, string>({
      query: (id) => `v1/boards/${id}`,
    }),
    createBoard: build.mutation<
      BoardRecord,
      { name: string; description?: string; visibility?: BoardVisibility }
    >({
      query: (body) => ({ url: 'v1/boards', method: 'POST', body }),
    }),
    reclassifyBoard: build.mutation<BoardRecord, { id: string; visibility: BoardVisibility }>({
      query: ({ id, visibility }) => ({
        url: `v1/boards/${id}/visibility`,
        method: 'POST',
        body: { visibility },
      }),
    }),

    createList: build.mutation<BoardList, { boardId: string; name: string; position?: number }>({
      query: ({ boardId, ...body }) => ({
        url: `v1/boards/${boardId}/lists`,
        method: 'POST',
        body,
      }),
    }),

    createCard: build.mutation<
      BoardCard,
      {
        boardId: string;
        listId: string;
        title: string;
        description?: string;
        assigneeId?: string;
        dueDate?: string;
      }
    >({
      query: ({ listId, boardId: _boardId, ...body }) => ({
        url: `v1/boards/lists/${listId}/cards`,
        method: 'POST',
        body,
      }),
    }),
    moveCard: build.mutation<
      BoardCard,
      { boardId: string; cardId: string; listId: string; position: number }
    >({
      query: ({ cardId, listId, position }) => ({
        url: `v1/boards/cards/${cardId}/move`,
        method: 'POST',
        body: { listId, position },
      }),
    }),

    addChecklistItem: build.mutation<
      ChecklistItem,
      { boardId: string; cardId: string; text: string }
    >({
      query: ({ cardId, text }) => ({
        url: `v1/boards/cards/${cardId}/checklist`,
        method: 'POST',
        body: { text },
      }),
    }),
    toggleChecklistItem: build.mutation<
      ChecklistItem,
      { boardId: string; itemId: string; done: boolean }
    >({
      query: ({ itemId, done }) => ({
        url: `v1/boards/checklist/${itemId}`,
        method: 'PATCH',
        body: { done },
      }),
    }),

    addComment: build.mutation<CardComment, { boardId: string; cardId: string; body: string }>({
      query: ({ cardId, body }) => ({
        url: `v1/boards/cards/${cardId}/comments`,
        method: 'POST',
        body: { body },
      }),
    }),
  }),
});

export const {
  useGetBoardsQuery,
  useGetBoardQuery,
  useCreateBoardMutation,
  useReclassifyBoardMutation,
  useCreateListMutation,
  useCreateCardMutation,
  useMoveCardMutation,
  useAddChecklistItemMutation,
  useToggleChecklistItemMutation,
  useAddCommentMutation,
} = boardsApi;
