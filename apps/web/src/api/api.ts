import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { Mutex } from './mutex';
import { loggedOut, tokensReceived } from '../features/auth/authSlice';
import type { AuthUser } from '../rbac/roles';
import type { RootState } from '../app/store';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface NotificationRecord {
  id: string;
  template: string;
  payload: unknown;
  severity: 'INFO' | 'WATCH' | 'DANGER';
  subjectTable: string | null;
  subjectId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ExchangeRateRecord {
  id: string;
  dateEffective: string;
  currencyPair: string;
  officialRate: string;
  parallelRate: string | null;
  source: string | null;
}

export interface SiteRecord {
  id: string;
  name: string;
  type: string;
}
export interface RequisitionRecord {
  id: string;
  purpose: string;
  amount: string;
  currency: string;
  requiredByDate: string;
  status: string;
  shortfall: string | null;
  createdAt: string;
}
export interface ApprovalInboxItem {
  id: string;
  step: number;
  approverRole: string;
  chain: {
    id: string;
    module: string;
    subjectTable: string;
    subjectId: string;
    amount: string | null;
    currency: string | null;
    status: string;
  };
}
export interface OrderRecord {
  id: string;
  reference: string;
  valueExVat: string;
  currency: string;
  serviced: boolean;
  closingDate: string | null;
  clientId: string;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

const mutex = new Mutex();

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  await mutex.wait();
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    const refreshToken = (api.getState() as RootState).auth.refreshToken;
    if (!refreshToken) {
      api.dispatch(loggedOut());
      return result;
    }
    if (!mutex.isLocked()) {
      const release = await mutex.acquire();
      try {
        const refresh = await rawBaseQuery(
          { url: 'v1/auth/refresh', method: 'POST', body: { refreshToken } },
          api,
          extraOptions,
        );
        if (refresh.data) {
          api.dispatch(tokensReceived(refresh.data as Tokens));
          result = await rawBaseQuery(args, api, extraOptions);
        } else {
          api.dispatch(loggedOut());
        }
      } finally {
        release();
      }
    } else {
      await mutex.wait();
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }
  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Notifications', 'ExchangeRates', 'Requisitions', 'Approvals', 'Orders'],
  endpoints: (build) => ({
    login: build.mutation<Tokens, { email: string; password: string }>({
      query: (body) => ({ url: 'v1/auth/login', method: 'POST', body }),
    }),
    me: build.query<AuthUser, void>({ query: () => 'v1/auth/me' }),
    logout: build.mutation<void, { refreshToken: string }>({
      query: (body) => ({ url: 'v1/auth/logout', method: 'POST', body }),
    }),

    getNotifications: build.query<NotificationRecord[], void>({
      query: () => 'v1/notifications',
      providesTags: ['Notifications'],
    }),
    unreadCount: build.query<{ count: number }, void>({
      query: () => 'v1/notifications/unread-count',
      providesTags: ['Notifications'],
    }),
    markRead: build.mutation<NotificationRecord, string>({
      query: (id) => ({ url: `v1/notifications/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Notifications'],
    }),
    markAllRead: build.mutation<{ updated: number }, void>({
      query: () => ({ url: 'v1/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notifications'],
    }),

    getExchangeRates: build.query<ExchangeRateRecord[], void>({
      query: () => 'v1/exchange-rates',
      providesTags: ['ExchangeRates'],
    }),

    getSites: build.query<SiteRecord[], void>({ query: () => 'v1/sites' }),

    // Settings catalog (read-only for forms) — options come from here, never hardcoded.
    getLookups: build.query<{ code: string; label: string; active: boolean }[], string>({
      query: (category) => ({ url: 'v1/settings/lookups', params: { category } }),
    }),

    // Requests (cash requisitions)
    getRequisitions: build.query<RequisitionRecord[], void>({
      query: () => 'v1/requisitions',
      providesTags: ['Requisitions'],
    }),
    createRequisition: build.mutation<
      RequisitionRecord,
      { purpose: string; amount: number; currency: string; requiredByDate: string }
    >({
      query: (body) => ({ url: 'v1/requisitions', method: 'POST', body }),
      invalidatesTags: ['Requisitions'],
    }),
    submitRequisition: build.mutation<RequisitionRecord, string>({
      query: (id) => ({ url: `v1/requisitions/${id}/submit`, method: 'POST', body: {} }),
      invalidatesTags: ['Requisitions', 'Approvals'],
    }),

    // Approvals inbox
    getApprovalInbox: build.query<ApprovalInboxItem[], void>({
      query: () => 'v1/approvals/inbox',
      providesTags: ['Approvals'],
    }),
    decideApproval: build.mutation<
      unknown,
      { id: string; decision: 'APPROVED' | 'REJECTED' | 'RETURNED'; comment?: string }
    >({
      query: ({ id, ...body }) => ({ url: `v1/approvals/${id}/decide`, method: 'POST', body }),
      invalidatesTags: ['Approvals', 'Requisitions'],
    }),

    // Orders
    getOrders: build.query<OrderRecord[], void>({
      query: () => 'v1/orders',
      providesTags: ['Orders'],
    }),

    // Command centre (composite)
    getCommandCentre: build.query<Record<string, unknown>, void>({
      query: () => 'v1/command-centre',
    }),
  }),
});

export const {
  useLoginMutation,
  useMeQuery,
  useLogoutMutation,
  useGetNotificationsQuery,
  useUnreadCountQuery,
  useMarkReadMutation,
  useMarkAllReadMutation,
  useGetExchangeRatesQuery,
  useGetSitesQuery,
  useGetLookupsQuery,
  useGetRequisitionsQuery,
  useCreateRequisitionMutation,
  useSubmitRequisitionMutation,
  useGetApprovalInboxQuery,
  useDecideApprovalMutation,
  useGetOrdersQuery,
  useGetCommandCentreQuery,
} = api;
