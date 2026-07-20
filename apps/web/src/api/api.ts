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
  assignedUserId: string | null;
}
export interface OrderReceiptRecord {
  id: string;
  amount: string;
  currency: string;
  receivedDate: string;
  reference: string | null;
}
export interface OrderDetail extends OrderRecord {
  receipts?: OrderReceiptRecord[];
}
export interface EmployeeRecord {
  id: string;
  worksNo: string;
  firstName: string;
  lastName: string;
  siteId: string;
}
export interface TravelRecord {
  id: string;
  destination: string;
  dateFrom: string;
  dateTo: string;
  days: number;
  advanceAmount: string;
  currency: string;
  status: string;
  shortfall: string | null;
}
export interface TimesheetPeriodRecord {
  id: string;
  siteId: string;
  month: string;
  status: string;
}
export interface ManhoursRow {
  employeeId: string;
  worksNo: string;
  employeeName: string;
  hoursNormal: number;
  hoursOt15: number;
  hoursOt20: number;
  ugShift: number;
  nightHours: number;
  totalHours: number;
}
export interface ManhoursResult {
  periodId: string;
  siteId: string;
  month: string;
  status: string;
  rows: ManhoursRow[];
}
export interface PettyCashFloatRecord {
  id: string;
  siteId: string;
  currency: string;
  custodianUserId: string;
  floatAmount: string;
  locked: boolean;
}
export interface PettyCashTxnRecord {
  id: string;
  floatId: string;
  type: string;
  amount: string;
  currency: string;
  purpose: string | null;
  status: string;
  createdAt: string;
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
  tagTypes: [
    'Notifications',
    'ExchangeRates',
    'Requisitions',
    'Approvals',
    'Orders',
    'Travel',
    'TimesheetPeriods',
    'TimesheetGrid',
    'PettyCashFloats',
    'PettyCashTxns',
  ],
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

    // Employees (roster for timesheet capture; GET needs site-manager+ on the API)
    getEmployees: build.query<EmployeeRecord[], void>({ query: () => 'v1/employees' }),

    // Travel & allowances — raise & submit (Finance disburses/retires in the admin app)
    getTravelRequests: build.query<TravelRecord[], void>({
      query: () => 'v1/travel',
      providesTags: ['Travel'],
    }),
    createTravel: build.mutation<
      TravelRecord,
      {
        destination: string;
        dateFrom: string;
        dateTo: string;
        days: number;
        currency: string;
        siteId?: string;
      }
    >({
      query: (body) => ({ url: 'v1/travel', method: 'POST', body }),
      invalidatesTags: ['Travel'],
    }),
    submitTravel: build.mutation<TravelRecord, string>({
      query: (id) => ({ url: `v1/travel/${id}/submit`, method: 'POST', body: {} }),
      invalidatesTags: ['Travel', 'Approvals'],
    }),

    // Timesheets — capture & submit (Finance/Site-Manager locks in the admin app)
    getTimesheetPeriods: build.query<TimesheetPeriodRecord[], void>({
      query: () => 'v1/timesheet-periods',
      providesTags: ['TimesheetPeriods'],
    }),
    getManhours: build.query<ManhoursResult, string>({
      query: (id) => `v1/timesheet-periods/${id}/manhours`,
      providesTags: (_r, _e, id) => [{ type: 'TimesheetGrid', id }],
    }),
    createTimesheetPeriod: build.mutation<
      TimesheetPeriodRecord,
      { siteId: string; month: string }
    >({
      query: (body) => ({ url: 'v1/timesheet-periods', method: 'POST', body }),
      invalidatesTags: ['TimesheetPeriods'],
    }),
    upsertTimesheetEntries: build.mutation<
      unknown,
      { id: string; rows: Record<string, unknown>[] }
    >({
      query: ({ id, rows }) => ({
        url: `v1/timesheet-periods/${id}/entries`,
        method: 'POST',
        body: { rows },
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'TimesheetGrid', id }],
    }),
    submitTimesheetPeriod: build.mutation<unknown, string>({
      query: (id) => ({ url: `v1/timesheet-periods/${id}/submit`, method: 'POST', body: {} }),
      invalidatesTags: ['TimesheetPeriods'],
    }),

    // Petty cash — raise withdrawals & confirm (Finance opens/tops-up/unlocks in admin)
    getPettyCashFloats: build.query<PettyCashFloatRecord[], void>({
      query: () => 'v1/petty-cash/floats',
      providesTags: ['PettyCashFloats'],
    }),
    getPettyCashTxns: build.query<PettyCashTxnRecord[], string>({
      query: (floatId) => `v1/petty-cash/floats/${floatId}/txns`,
      providesTags: ['PettyCashTxns'],
    }),
    createWithdrawal: build.mutation<
      PettyCashTxnRecord,
      { id: string; amount: number; purpose: string }
    >({
      query: ({ id, ...body }) => ({
        url: `v1/petty-cash/floats/${id}/withdrawals`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['PettyCashTxns', 'Approvals'],
    }),
    confirmWithdrawal: build.mutation<unknown, string>({
      query: (txnId) => ({
        url: `v1/petty-cash/withdrawals/${txnId}/confirm`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: ['PettyCashTxns'],
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

    // My Orders (orders assigned to the current user)
    getAssignedOrders: build.query<OrderRecord[], void>({
      query: () => 'v1/orders/assigned',
      providesTags: ['Orders'],
    }),
    getOrder: build.query<OrderDetail, string>({
      query: (id) => `v1/orders/${id}`,
      providesTags: ['Orders'],
    }),
    recordReceipt: build.mutation<unknown, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `v1/orders/${id}/receipts`, method: 'POST', body }),
      invalidatesTags: ['Orders'],
    }),
    markServiced: build.mutation<unknown, string>({
      query: (id) => ({ url: `v1/orders/${id}/mark-serviced`, method: 'POST', body: {} }),
      invalidatesTags: ['Orders'],
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
  useGetEmployeesQuery,
  useGetTravelRequestsQuery,
  useCreateTravelMutation,
  useSubmitTravelMutation,
  useGetTimesheetPeriodsQuery,
  useGetManhoursQuery,
  useCreateTimesheetPeriodMutation,
  useUpsertTimesheetEntriesMutation,
  useSubmitTimesheetPeriodMutation,
  useGetPettyCashFloatsQuery,
  useGetPettyCashTxnsQuery,
  useCreateWithdrawalMutation,
  useConfirmWithdrawalMutation,
  useGetApprovalInboxQuery,
  useDecideApprovalMutation,
  useGetAssignedOrdersQuery,
  useGetOrderQuery,
  useRecordReceiptMutation,
  useMarkServicedMutation,
  useGetCommandCentreQuery,
} = api;
