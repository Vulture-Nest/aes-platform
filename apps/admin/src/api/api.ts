import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { Mutex } from './mutex';
import { loggedOut, tokensReceived } from '../features/auth/authSlice';
import type { AuthUser, Role, SiteRole } from '../rbac/roles';
import type { RootState } from '../app/store';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserRecord extends AuthUser {
  mfaRequired: boolean;
  siteRoles: (SiteRole & { id: string })[];
  createdAt: string;
}
export interface SiteRecord {
  id: string;
  name: string;
  type: 'MINE_SITE' | 'HEAD_OFFICE';
  clientId: string | null;
  active: boolean;
}
export interface ExchangeRateRecord {
  id: string;
  dateEffective: string;
  currencyPair: string;
  officialRate: string;
  parallelRate: string | null;
  source: string | null;
}
export interface StatutoryRateRecord {
  id: string;
  key: string;
  currency: string | null;
  value: string | null;
  params: unknown;
  dateEffective: string;
}
export interface ThresholdRecord {
  id: string;
  key: string;
  currency: string | null;
  value: string | null;
  params: unknown;
  dateEffective: string;
}
export interface DelegationRecord {
  id: string;
  approverUserId: string;
  delegateUserId: string;
  dateFrom: string;
  dateTo: string;
  active: boolean;
}
export interface AuditRecord {
  id: string;
  actorUserId: string | null;
  action: string;
  tableName: string;
  recordId: string | null;
  createdAt: string;
}
export interface AccountRecord {
  id: string;
  name: string;
  type: string;
  currency: string;
  siteId: string | null;
}
export interface EmployeeRecord {
  id: string;
  worksNo: string;
  firstName: string;
  lastName: string;
  siteId: string;
  employmentType: string;
  payMode: string;
  accountNo: string | null;
  accountCurrency: string | null;
}
export interface ApprovalMatrixRecord {
  id: string;
  module: string;
  minAmount: string | null;
  maxAmount: string | null;
  currency: string | null;
  stepOrder: number;
  approverRole: string;
  mode: string;
  active: boolean;
}
export interface DangerRuleRecord {
  id: string;
  ruleKey: string;
  severity: string;
  enabled: boolean;
  params: unknown;
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

/** fetchBaseQuery + transparent access-token refresh on 401 (single-flight via mutex). */
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
    'Users',
    'Sites',
    'ExchangeRates',
    'StatutoryRates',
    'Thresholds',
    'Delegations',
    'Audit',
    'Accounts',
    'Employees',
    'ApprovalMatrix',
    'DangerRules',
  ],
  endpoints: (build) => ({
    // --- auth ---
    login: build.mutation<Tokens, { email: string; password: string }>({
      query: (body) => ({ url: 'v1/auth/login', method: 'POST', body }),
    }),
    me: build.query<AuthUser, void>({ query: () => 'v1/auth/me' }),
    logout: build.mutation<void, { refreshToken: string }>({
      query: (body) => ({ url: 'v1/auth/logout', method: 'POST', body }),
    }),

    // --- users ---
    getUsers: build.query<UserRecord[], void>({ query: () => 'v1/users', providesTags: ['Users'] }),
    createUser: build.mutation<
      UserRecord,
      { email: string; password: string; roles?: { siteId?: string; role: Role }[] }
    >({
      query: (body) => ({ url: 'v1/users', method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),
    assignRole: build.mutation<UserRecord, { id: string; siteId?: string; role: Role }>({
      query: ({ id, ...body }) => ({ url: `v1/users/${id}/roles`, method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),

    // --- sites ---
    getSites: build.query<SiteRecord[], void>({ query: () => 'v1/sites', providesTags: ['Sites'] }),
    createSite: build.mutation<SiteRecord, Partial<SiteRecord>>({
      query: (body) => ({ url: 'v1/sites', method: 'POST', body }),
      invalidatesTags: ['Sites'],
    }),
    updateSite: build.mutation<SiteRecord, { id: string } & Partial<SiteRecord>>({
      query: ({ id, ...body }) => ({ url: `v1/sites/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Sites'],
    }),

    // --- exchange rates ---
    getExchangeRates: build.query<ExchangeRateRecord[], void>({
      query: () => 'v1/exchange-rates',
      providesTags: ['ExchangeRates'],
    }),
    createExchangeRate: build.mutation<ExchangeRateRecord, Partial<ExchangeRateRecord>>({
      query: (body) => ({ url: 'v1/exchange-rates', method: 'POST', body }),
      invalidatesTags: ['ExchangeRates'],
    }),

    // --- statutory rates ---
    getStatutoryRates: build.query<StatutoryRateRecord[], void>({
      query: () => 'v1/statutory-rates',
      providesTags: ['StatutoryRates'],
    }),
    createStatutoryRate: build.mutation<StatutoryRateRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/statutory-rates', method: 'POST', body }),
      invalidatesTags: ['StatutoryRates'],
    }),

    // --- thresholds ---
    getThresholds: build.query<ThresholdRecord[], void>({
      query: () => 'v1/thresholds',
      providesTags: ['Thresholds'],
    }),
    createThreshold: build.mutation<ThresholdRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/thresholds', method: 'POST', body }),
      invalidatesTags: ['Thresholds'],
    }),

    // --- delegation ---
    getDelegations: build.query<DelegationRecord[], void>({
      query: () => 'v1/delegation-rules',
      providesTags: ['Delegations'],
    }),
    createDelegation: build.mutation<DelegationRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/delegation-rules', method: 'POST', body }),
      invalidatesTags: ['Delegations'],
    }),

    // --- audit ---
    getAudit: build.query<{ total: number; items: AuditRecord[] }, { take?: number } | void>({
      query: (arg) => ({ url: 'v1/audit', params: arg ?? undefined }),
      providesTags: ['Audit'],
    }),

    // --- accounts (ledger) ---
    getAccounts: build.query<AccountRecord[], void>({
      query: () => 'v1/accounts',
      providesTags: ['Accounts'],
    }),
    createAccount: build.mutation<AccountRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/accounts', method: 'POST', body }),
      invalidatesTags: ['Accounts'],
    }),

    // --- employees (HR-lite) ---
    getEmployees: build.query<EmployeeRecord[], void>({
      query: () => 'v1/employees',
      providesTags: ['Employees'],
    }),
    createEmployee: build.mutation<EmployeeRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/employees', method: 'POST', body }),
      invalidatesTags: ['Employees'],
    }),

    // --- approval matrix ---
    getApprovalMatrix: build.query<ApprovalMatrixRecord[], void>({
      query: () => 'v1/approval-matrix',
      providesTags: ['ApprovalMatrix'],
    }),
    createApprovalRule: build.mutation<ApprovalMatrixRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/approval-matrix', method: 'POST', body }),
      invalidatesTags: ['ApprovalMatrix'],
    }),

    // --- danger rules ---
    getDangerRules: build.query<DangerRuleRecord[], void>({
      query: () => 'v1/danger-rules',
      providesTags: ['DangerRules'],
    }),
    updateDangerRule: build.mutation<DangerRuleRecord, { id: string; enabled?: boolean; severity?: string }>({
      query: ({ id, ...body }) => ({ url: `v1/danger-rules/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['DangerRules'],
    }),
  }),
});

export const {
  useLoginMutation,
  useMeQuery,
  useLogoutMutation,
  useGetUsersQuery,
  useCreateUserMutation,
  useAssignRoleMutation,
  useGetSitesQuery,
  useCreateSiteMutation,
  useUpdateSiteMutation,
  useGetExchangeRatesQuery,
  useCreateExchangeRateMutation,
  useGetStatutoryRatesQuery,
  useCreateStatutoryRateMutation,
  useGetThresholdsQuery,
  useCreateThresholdMutation,
  useGetDelegationsQuery,
  useCreateDelegationMutation,
  useGetAuditQuery,
  useGetAccountsQuery,
  useCreateAccountMutation,
  useGetEmployeesQuery,
  useCreateEmployeeMutation,
  useGetApprovalMatrixQuery,
  useCreateApprovalRuleMutation,
  useGetDangerRulesQuery,
  useUpdateDangerRuleMutation,
} = api;
