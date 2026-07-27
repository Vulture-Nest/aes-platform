import { api } from '../../api/api';

export interface EntityRecord {
  id: string;
  name: string;
  country: string;
  baseCurrency: string;
  chartOfAccountsRef: string | null;
  timezone: string;
  locale: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EntitySummary {
  entity: EntityRecord;
  counts: { sites: number; employees: number; orders: number };
}

export interface HolidayRecord {
  id: string;
  entityId: string;
  date: string;
  name: string;
}

export interface CreateEntityBody {
  name: string;
  country: string;
  baseCurrency: string;
  chartOfAccountsRef?: string;
  timezone?: string;
  locale?: string;
  active?: boolean;
}

export interface CreateHolidayBody {
  date: string;
  name: string;
}

// Register feature-local tag types without editing the shared api.ts.
const entitiesBaseApi = api.enhanceEndpoints({
  addTagTypes: ['Entities', 'EntityHolidays'],
});

export const entitiesApi = entitiesBaseApi.injectEndpoints({
  endpoints: (build) => ({
    getEntities: build.query<EntityRecord[], void>({
      query: () => 'v1/entities',
      providesTags: ['Entities'],
    }),
    getEntitySummary: build.query<EntitySummary, string>({
      query: (id) => `v1/entities/${id}/summary`,
      providesTags: (_r, _e, id) => [{ type: 'Entities', id }],
    }),
    createEntity: build.mutation<EntityRecord, CreateEntityBody>({
      query: (body) => ({ url: 'v1/entities', method: 'POST', body }),
      invalidatesTags: ['Entities'],
    }),
    getEntityHolidays: build.query<HolidayRecord[], string>({
      query: (id) => `v1/entities/${id}/holidays`,
      providesTags: (_r, _e, id) => [{ type: 'EntityHolidays', id }],
    }),
    createEntityHoliday: build.mutation<
      HolidayRecord,
      { id: string; body: CreateHolidayBody }
    >({
      query: ({ id, body }) => ({
        url: `v1/entities/${id}/holidays`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'EntityHolidays', id }],
    }),
    deleteEntityHoliday: build.mutation<
      { deleted: boolean },
      { id: string; holidayId: string }
    >({
      query: ({ id, holidayId }) => ({
        url: `v1/entities/${id}/holidays/${holidayId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'EntityHolidays', id }],
    }),
  }),
});

export const {
  useGetEntitiesQuery,
  useGetEntitySummaryQuery,
  useCreateEntityMutation,
  useGetEntityHolidaysQuery,
  useCreateEntityHolidayMutation,
  useDeleteEntityHolidayMutation,
} = entitiesApi;
