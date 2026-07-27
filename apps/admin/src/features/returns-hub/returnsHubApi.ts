import { api } from '../../api/api';

// ---------------------------------------------------------------------------
// Types (local to this feature; mirror backend response shapes)
// ---------------------------------------------------------------------------

export type ReturnStatus = 'DUE' | 'OVERDUE' | 'PAID' | 'PARTIAL';

export interface StatutoryReturnRow {
  id: string;
  entityId: string | null;
  taxType: string;
  periodMonth: string;
  currency: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  status: ReturnStatus;
  daysToDeadline: number | null;
  filingDeadline: string | null;
  source: string;
  sourceRef: string | null;
}

export interface RemitBody {
  paidAt: string;
  amount: number;
  currency: string;
  reference?: string;
  proofAttachmentKey?: string;
}

export interface PostFromPayrollBody {
  period: string;
  siteId?: string;
}

export interface PostVatBody {
  period: string;
}

export interface SummaryResponse {
  year: string;
  anchorPeriod: string;
  ytd: { due: number; paid: number; balance: number };
  ytdByTaxType: Record<string, { due: number; paid: number; balance: number }>;
  perPeriod: Record<
    string,
    { taxType: string; currency: string; due: number; paid: number; balance: number; status: string }[]
  >;
}

export interface WhtRate {
  id: string;
  country: string;
  category: string;
  rate: number | string;
  thresholdAmount: number | string | null;
  effectiveFrom: string;
}

export interface CreateWhtRateBody {
  country?: string;
  category: string;
  rate: number;
  thresholdAmount?: number;
  effectiveFrom: string;
}

export interface WhtPayableBody {
  counterparty: string;
  taxBase: number;
  category: string;
  supplierTaxClearanceHeld: boolean;
  currency: string;
  relatedPaymentRef?: string;
  country?: string;
  paymentDate?: string;
  entityId?: string;
}

export interface WhtPayableResult {
  transaction: {
    id: string;
    counterparty: string;
    taxBase: number;
    rate: number;
    amount: number;
    currency: string;
    taxPeriod: string;
    status: string;
  };
  withheld: boolean;
  statutoryReturn: unknown;
}

export interface WhtSufferedBody {
  counterparty: string;
  amount: number;
  currency: string;
  certificateRef?: string;
  taxPeriod: string;
  certificateReceived?: boolean;
  entityId?: string;
}

export interface WhtCreditsResponse {
  byCurrency: Record<
    string,
    {
      totalCredit: number;
      certificatedCredit: number;
      pendingCertificateCredit: number;
      count: number;
    }
  >;
  transactions: {
    id: string;
    counterparty: string;
    amount: number;
    currency: string;
    certificateRef: string | null;
    certificateReceived: boolean;
    taxPeriod: string;
  }[];
}

// These tag strings are not registered in the shared api tagTypes (we must not
// edit api.ts). Cast to the accepted type so RTK Query still wires up
// provide/invalidate cache coherence within this feature.
type AnyTag = Parameters<typeof api.util.invalidateTags>[0][number];
const RETURNS_TAG = 'Returns' as unknown as AnyTag;
const WHT_RATES_TAG = 'WhtRates' as unknown as AnyTag;
const WHT_CREDITS_TAG = 'WhtCredits' as unknown as AnyTag;

export const returnsHubApi = api.injectEndpoints({
  endpoints: (build) => ({
    getReturnsHub: build.query<StatutoryReturnRow[], { period: string; entityId?: string }>({
      query: ({ period, entityId }) => ({
        url: '/v1/returns',
        params: { period, ...(entityId ? { entityId } : {}) },
      }),
      providesTags: [RETURNS_TAG],
    }),

    getReturnsSummary: build.query<SummaryResponse, { period: string; entityId?: string }>({
      query: ({ period, entityId }) => ({
        url: '/v1/returns/summary',
        params: { period, ...(entityId ? { entityId } : {}) },
      }),
      providesTags: [RETURNS_TAG],
    }),

    postFromPayroll: build.mutation<unknown, PostFromPayrollBody>({
      query: (body) => ({ url: '/v1/returns/post-from-payroll', method: 'POST', body }),
      invalidatesTags: [RETURNS_TAG],
    }),

    postVat: build.mutation<unknown, PostVatBody>({
      query: (body) => ({ url: '/v1/returns/post-vat', method: 'POST', body }),
      invalidatesTags: [RETURNS_TAG],
    }),

    remitReturn: build.mutation<unknown, { id: string; body: RemitBody }>({
      query: ({ id, body }) => ({ url: `/v1/returns/${id}/remit`, method: 'POST', body }),
      invalidatesTags: [RETURNS_TAG],
    }),

    // ----- WHT -----

    listWhtRates: build.query<WhtRate[], { country?: string; category?: string } | void>({
      query: (params) => ({ url: '/v1/returns/wht/rates', params: params || undefined }),
      providesTags: [WHT_RATES_TAG],
    }),

    createWhtRate: build.mutation<WhtRate, CreateWhtRateBody>({
      query: (body) => ({ url: '/v1/returns/wht/rates', method: 'POST', body }),
      invalidatesTags: [WHT_RATES_TAG],
    }),

    whtPayable: build.mutation<WhtPayableResult, WhtPayableBody>({
      query: (body) => ({ url: '/v1/returns/wht/payable', method: 'POST', body }),
      invalidatesTags: [RETURNS_TAG],
    }),

    whtSuffered: build.mutation<unknown, WhtSufferedBody>({
      query: (body) => ({ url: '/v1/returns/wht/suffered', method: 'POST', body }),
      invalidatesTags: [WHT_CREDITS_TAG],
    }),

    getWhtCredits: build.query<
      WhtCreditsResponse,
      { taxPeriod?: string; pendingCertificateOnly?: string } | void
    >({
      query: (params) => ({ url: '/v1/returns/wht/credits', params: params || undefined }),
      providesTags: [WHT_CREDITS_TAG],
    }),
  }),
});

export const {
  useGetReturnsHubQuery,
  useGetReturnsSummaryQuery,
  usePostFromPayrollMutation,
  usePostVatMutation,
  useRemitReturnMutation,
  useListWhtRatesQuery,
  useCreateWhtRateMutation,
  useWhtPayableMutation,
  useWhtSufferedMutation,
  useGetWhtCreditsQuery,
} = returnsHubApi;
