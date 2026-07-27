import { api } from '../../api/api';

// This feature relies on a few cross-query tags that are not registered in the
// shared api.ts (owned by the integration agent). We register them here, scoped
// to this feature, via enhanceEndpoints — this does NOT touch api/api.ts.
const enhancedApi = api.enhanceEndpoints({
  addTagTypes: ['SiteKpis', 'SitePerformance', 'Ppe', 'StoresWithdrawals'],
});

// --- Monthly report periods & sections ---
export interface SiteReportSection {
  id: string;
  periodId: string;
  sectionKey: string;
  title: string | null;
  content: Record<string, unknown> | null;
  autoPopulated: boolean;
  completedAt: string | null;
}
export interface SiteReportPeriod {
  id: string;
  siteId: string;
  entityId: string | null;
  contractId: string | null;
  periodMonth: string;
  status: string;
  deadline: string | null;
  narrative: string | null;
  submittedAt: string | null;
  submittedByUserId: string | null;
  createdAt: string;
  sections: SiteReportSection[];
}

// --- Performance / RAG ---
export type Rag = 'GREEN' | 'AMBER' | 'RED';
export interface PerfKpiRow {
  kpiId: string;
  kpiKey: string;
  name: string;
  unit: string | null;
  weight: number;
  direction: string;
  target: number | null;
  tolerance: number | null;
  actual: number | null;
  rag: Rag;
}
export interface SitePerformance {
  siteId: string;
  periodMonth: string;
  kpis: PerfKpiRow[];
  weightedScore: number;
  rag: Rag;
}
export interface CrossSiteRow {
  siteId: string;
  siteName: string;
  weightedScore: number;
  rag: Rag;
}
export interface CrossSiteResult {
  periodMonth: string;
  sites: CrossSiteRow[];
}
export interface SiteKpiRecord {
  id: string;
  kpiKey: string;
  name: string;
  unit: string | null;
  weight: string;
  direction: string;
  siteId: string | null;
  contractId: string | null;
}

// --- PPE ---
export interface PpeComplianceResult {
  siteId: string | null;
  requiredCount: number;
  compliantCount: number;
  compliancePercent: number;
  expiring: Array<{ employeeId: string; itemType: string; replacementDue: string | null }>;
}
export interface PpeIssueRecord {
  id: string;
  employeeId: string;
  itemType: string;
  issueDate: string;
  size: string | null;
  replacementDue: string | null;
  condition: string | null;
}

// --- Stores withdrawals ---
export interface StoresWithdrawalRecord {
  id: string;
  siteId: string;
  itemType: string;
  description: string | null;
  quantity: string;
  unit: string | null;
  value: string;
  currency: string | null;
  vehicleRef: string | null;
  drawnAt: string;
  allocation: string | null;
  variance?: string | null;
  overDrawn?: boolean;
}

export const siteReportsApi = enhancedApi.injectEndpoints({
  endpoints: (build) => ({
    // --- periods ---
    getSiteReportPeriods: build.query<
      SiteReportPeriod[],
      { siteId?: string; periodMonth?: string; status?: string } | void
    >({
      query: (arg) => ({ url: 'v1/site-reports', params: arg ?? undefined }),
      providesTags: ['TimesheetPeriods'],
    }),
    getSiteReportPeriod: build.query<SiteReportPeriod, string>({
      query: (id) => `v1/site-reports/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'TimesheetGrid', id }],
    }),
    openSiteReportPeriod: build.mutation<
      SiteReportPeriod,
      { siteId: string; contractId?: string; periodMonth: string; deadline?: string }
    >({
      query: (body) => ({ url: 'v1/site-reports/open', method: 'POST', body }),
      invalidatesTags: ['TimesheetPeriods'],
    }),
    updateSiteReportSection: build.mutation<
      SiteReportSection,
      {
        id: string;
        key: string;
        content?: Record<string, unknown>;
        completedAt?: string;
        title?: string;
      }
    >({
      query: ({ id, key, ...body }) => ({
        url: `v1/site-reports/${id}/sections/${key}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'TimesheetGrid', id }],
    }),
    submitSiteReport: build.mutation<
      SiteReportPeriod & { late: boolean },
      { id: string; narrative: string }
    >({
      query: ({ id, ...body }) => ({ url: `v1/site-reports/${id}/submit`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'TimesheetGrid', id }, 'TimesheetPeriods'],
    }),

    // --- performance ---
    getSitePerformance: build.query<SitePerformance, { siteId: string; period: string }>({
      query: ({ siteId, period }) => ({
        url: 'v1/site-reports/performance',
        params: { siteId, period },
      }),
      providesTags: ['SitePerformance'],
    }),
    getCrossSite: build.query<CrossSiteResult, string>({
      query: (period) => ({ url: 'v1/site-reports/cross-site', params: { period } }),
      providesTags: ['SitePerformance'],
    }),
    getSiteKpis: build.query<SiteKpiRecord[], { siteId?: string; contractId?: string } | void>({
      query: (arg) => ({ url: 'v1/site-reports/kpis', params: arg ?? undefined }),
      providesTags: ['SiteKpis'],
    }),
    createSiteKpi: build.mutation<SiteKpiRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/site-reports/kpis', method: 'POST', body }),
      invalidatesTags: ['SiteKpis', 'SitePerformance'],
    }),
    upsertKpiTarget: build.mutation<unknown, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({
        url: `v1/site-reports/kpis/${id}/targets`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SitePerformance'],
    }),
    upsertKpiActual: build.mutation<
      unknown,
      { id: string; periodMonth: string; actualValue: number }
    >({
      query: ({ id, ...body }) => ({
        url: `v1/site-reports/kpis/${id}/actuals`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SitePerformance'],
    }),

    // --- PPE ---
    getPpeCompliance: build.query<
      PpeComplianceResult,
      { siteId?: string; expiringWithinDays?: number } | void
    >({
      query: (arg) => ({ url: 'v1/site-reports/ppe/compliance', params: arg ?? undefined }),
      providesTags: ['Ppe'],
    }),
    getPpeIssues: build.query<PpeIssueRecord[], { employeeId?: string } | void>({
      query: (arg) => ({ url: 'v1/site-reports/ppe/issues', params: arg ?? undefined }),
      providesTags: ['Ppe'],
    }),
    createPpeIssue: build.mutation<PpeIssueRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/site-reports/ppe/issues', method: 'POST', body }),
      invalidatesTags: ['Ppe'],
    }),

    // --- stores withdrawals ---
    getStoresWithdrawals: build.query<
      StoresWithdrawalRecord[],
      { siteId?: string; itemType?: string } | void
    >({
      query: (arg) => ({
        url: 'v1/site-reports/stores-withdrawals',
        params: arg ?? undefined,
      }),
      providesTags: ['StoresWithdrawals'],
    }),
    createStoresWithdrawal: build.mutation<StoresWithdrawalRecord, Record<string, unknown>>({
      query: (body) => ({
        url: 'v1/site-reports/stores-withdrawals',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['StoresWithdrawals'],
    }),
  }),
});

export const {
  useGetSiteReportPeriodsQuery,
  useGetSiteReportPeriodQuery,
  useOpenSiteReportPeriodMutation,
  useUpdateSiteReportSectionMutation,
  useSubmitSiteReportMutation,
  useGetSitePerformanceQuery,
  useGetCrossSiteQuery,
  useGetSiteKpisQuery,
  useCreateSiteKpiMutation,
  useUpsertKpiTargetMutation,
  useUpsertKpiActualMutation,
  useGetPpeComplianceQuery,
  useGetPpeIssuesQuery,
  useCreatePpeIssueMutation,
  useGetStoresWithdrawalsQuery,
  useCreateStoresWithdrawalMutation,
} = siteReportsApi;
