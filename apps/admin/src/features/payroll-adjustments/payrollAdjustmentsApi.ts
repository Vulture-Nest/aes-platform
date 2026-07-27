import { api } from '../../api/api';

// --- Back-pay ---
export interface NewRateInput {
  grade?: string;
  necClass?: string;
  hourly?: number;
  basic?: number;
}

export interface BackPayBatchRecord {
  id: string;
  entityId: string | null;
  name: string;
  rateEffectiveFrom: string;
  gazettedAt: string | null;
  currency: string;
  status: string;
  approvalRef: string | null;
  createdAt: string;
}

export interface BackPayLineWorking {
  employeeId: string;
  periodMonth: string;
  payMode: string;
  matchedBy: 'grade' | 'necClass' | null;
  oldHourly: number | null;
  newHourly: number | null;
  oldBasic: number | null;
  newBasic: number | null;
  hoursPaid: number | null;
  oldAmount: number;
  newAmount: number;
  difference: number;
}

export interface BackPayLineRecord {
  id: string;
  batchId: string;
  employeeId: string;
  periodMonth: string;
  oldAmount: string;
  newAmount: string;
  difference: string;
  taxable: boolean;
  pensionable: boolean;
  nssaAble: boolean;
  workings: BackPayLineWorking | null;
}

export interface BackPayBatchDetail extends BackPayBatchRecord {
  lines: BackPayLineRecord[];
}

export interface CreateBackPayBatchBody {
  name: string;
  entityId?: string;
  rateEffectiveFrom: string;
  gazettedAt?: string;
  currency?: string;
  newRates: NewRateInput[];
  affectedPeriods: string[];
  taxable?: boolean;
  pensionable?: boolean;
  nssaAble?: boolean;
}

// --- Acting allowances ---
export type ActingBasisValue = 'FIXED' | 'PERCENT';

export interface ActingAssignmentRecord {
  id: string;
  entityId: string | null;
  employeeId: string;
  actingPosition: string;
  actingGrade: string | null;
  dateFrom: string;
  dateTo: string;
  basis: ActingBasisValue;
  fixedAmount: string | null;
  currency: string | null;
  percent: string | null;
  minQualifyingDays: number | null;
  status: string;
  approvalRef: string | null;
}

export interface ActingRegisterRow {
  id: string;
  employeeId: string;
  actingPosition: string;
  actingGrade: string | null;
  basis: ActingBasisValue;
  dateFrom: string;
  dateTo: string;
  days: number;
  status: string;
  fixedAmount: number | null;
  percent: number | null;
  currency: string | null;
}

export interface CreateActingAssignmentBody {
  employeeId: string;
  entityId?: string;
  actingPosition: string;
  actingGrade?: string;
  dateFrom: string;
  dateTo: string;
  basis: ActingBasisValue;
  fixedAmount?: number;
  currency?: string;
  percent?: number;
  minQualifyingDays?: number;
}

const enhancedApi = api.enhanceEndpoints({
  addTagTypes: ['BackPayBatches', 'BackPayBatch', 'ActingAssignments'],
});

export const payrollAdjustmentsApi = enhancedApi.injectEndpoints({
  endpoints: (build) => ({
    // --- back-pay ---
    getBackPayBatches: build.query<BackPayBatchRecord[], { entityId?: string } | void>({
      query: (arg) => ({
        url: 'v1/payroll-adjustments/back-pay',
        params: arg && arg.entityId ? { entityId: arg.entityId } : undefined,
      }),
      providesTags: ['BackPayBatches'],
    }),
    getBackPayBatch: build.query<BackPayBatchDetail, string>({
      query: (id) => `v1/payroll-adjustments/back-pay/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'BackPayBatch', id }],
    }),
    createBackPayBatch: build.mutation<BackPayBatchDetail, CreateBackPayBatchBody>({
      query: (body) => ({ url: 'v1/payroll-adjustments/back-pay', method: 'POST', body }),
      invalidatesTags: ['BackPayBatches'],
    }),
    submitBackPayBatch: build.mutation<BackPayBatchDetail, string>({
      query: (id) => ({ url: `v1/payroll-adjustments/back-pay/${id}/submit`, method: 'POST', body: {} }),
      invalidatesTags: (_r, _e, id) => ['BackPayBatches', { type: 'BackPayBatch', id }],
    }),
    approveBackPayBatch: build.mutation<unknown, { id: string; approvalRef?: string }>({
      query: ({ id, approvalRef }) => ({
        url: `v1/payroll-adjustments/back-pay/${id}/approve`,
        method: 'POST',
        body: { approvalRef },
      }),
      invalidatesTags: (_r, _e, { id }) => ['BackPayBatches', { type: 'BackPayBatch', id }],
    }),

    // --- acting allowances ---
    getActingRegister: build.query<
      ActingRegisterRow[],
      { from?: string; to?: string; employeeId?: string } | void
    >({
      query: (arg) => {
        const params: Record<string, string> = {};
        if (arg && arg.from) params.from = arg.from;
        if (arg && arg.to) params.to = arg.to;
        if (arg && arg.employeeId) params.employeeId = arg.employeeId;
        return { url: 'v1/payroll-adjustments/acting', params: Object.keys(params).length ? params : undefined };
      },
      providesTags: ['ActingAssignments'],
    }),
    createActingAssignment: build.mutation<ActingAssignmentRecord, CreateActingAssignmentBody>({
      query: (body) => ({ url: 'v1/payroll-adjustments/acting', method: 'POST', body }),
      invalidatesTags: ['ActingAssignments'],
    }),
    submitActingAssignment: build.mutation<ActingAssignmentRecord, string>({
      query: (id) => ({ url: `v1/payroll-adjustments/acting/${id}/submit`, method: 'POST', body: {} }),
      invalidatesTags: ['ActingAssignments'],
    }),
    approveActingAssignment: build.mutation<
      ActingAssignmentRecord,
      { id: string; approvalRef?: string }
    >({
      query: ({ id, approvalRef }) => ({
        url: `v1/payroll-adjustments/acting/${id}/approve`,
        method: 'POST',
        body: { approvalRef },
      }),
      invalidatesTags: ['ActingAssignments'],
    }),
  }),
});

export const {
  useGetBackPayBatchesQuery,
  useGetBackPayBatchQuery,
  useCreateBackPayBatchMutation,
  useSubmitBackPayBatchMutation,
  useApproveBackPayBatchMutation,
  useGetActingRegisterQuery,
  useCreateActingAssignmentMutation,
  useSubmitActingAssignmentMutation,
  useApproveActingAssignmentMutation,
} = payrollAdjustmentsApi;
