import { api } from '../../api/api';

export const SHE_TYPES = [
  'INCIDENT',
  'NEAR_MISS',
  'TOOLBOX_TALK',
  'MEDICAL',
  'DRILL',
  'HAZARD',
] as const;
export type SheType = (typeof SHE_TYPES)[number];

export const SHE_STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED'] as const;
export type SheStatus = (typeof SHE_STATUSES)[number];

export interface SheRecord {
  id: string;
  entityId: string | null;
  siteId: string;
  type: SheType;
  title: string;
  description: string | null;
  severity: string | null;
  occurredAt: string;
  investigation: string | null;
  lti: boolean;
  status: SheStatus;
  reportedByUserId: string | null;
  createdAt: string;
}

export interface SheStats {
  siteId: string | null;
  total: number;
  byType: Record<SheType, number>;
  incidentCount: number;
  ltiCount: number;
  openInvestigations: number;
}

export interface CreateSheRecordArgs {
  type: SheType;
  siteId: string;
  title: string;
  description?: string;
  severity?: string;
  occurredAt: string;
  investigation?: string;
  lti?: boolean;
}

export interface UpdateSheRecordArgs {
  id: string;
  status?: SheStatus;
  investigation?: string;
  lti?: boolean;
}

// Reuse an existing declared cache tag (the base API's `tagTypes` cannot be edited here).
// SHE is a compliance-domain feature, so its records ride the compliance tag — SHE mutations
// refresh the SHE list/stats (and, harmlessly, compliance-tagged reads).
const SHE_TAG = 'ComplianceObligations' as const;

export const sheApi = api.injectEndpoints({
  endpoints: (build) => ({
    getSheRecords: build.query<
      SheRecord[],
      { siteId?: string; type?: SheType; status?: SheStatus } | void
    >({
      query: (arg) => ({ url: 'v1/she', params: arg ?? undefined }),
      providesTags: [SHE_TAG],
    }),
    getSheStats: build.query<SheStats, { siteId?: string } | void>({
      query: (arg) => ({ url: 'v1/she/stats', params: arg ?? undefined }),
      providesTags: [SHE_TAG],
    }),
    createSheRecord: build.mutation<SheRecord, CreateSheRecordArgs>({
      query: (body) => ({ url: 'v1/she', method: 'POST', body }),
      invalidatesTags: [SHE_TAG],
    }),
    updateSheRecord: build.mutation<SheRecord, UpdateSheRecordArgs>({
      query: ({ id, ...body }) => ({ url: `v1/she/${id}`, method: 'PATCH', body }),
      invalidatesTags: [SHE_TAG],
    }),
  }),
});

export const {
  useGetSheRecordsQuery,
  useGetSheStatsQuery,
  useCreateSheRecordMutation,
  useUpdateSheRecordMutation,
} = sheApi;
