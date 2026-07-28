import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { Mutex } from './mutex';
import { loggedOut, tokensReceived } from '../features/auth/authSlice';
import type { AuthUser, SiteRole } from '../rbac/roles';
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
  type: string;
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
export interface LookupRecord {
  id: string;
  category: string;
  code: string;
  label: string;
  sortOrder: number;
  active: boolean;
  metadata: Record<string, unknown> | null;
}
export interface ClientRecord {
  id: string;
  name: string;
  contactEmail: string | null;
  active: boolean;
  createdAt?: string;
}
export interface ContractRecord {
  id: string;
  clientId: string;
  reference: string;
  valueExVat: string;
  currency: string;
  startDate: string;
  endDate: string;
  status: string;
}
export interface OrderRecord {
  id: string;
  reference: string;
  valueExVat: string;
  currency: string;
  serviced: boolean;
  closingDate: string | null;
  clientId: string;
  contractId: string | null;
  assignedUserId: string | null;
}
export interface OrderReceiptRecord {
  id: string;
  amount: string;
  currency: string;
  receivedDate: string;
  reference: string | null;
}
export interface OrderExpenseRecord {
  id: string;
  amount: string;
  currency: string;
  vatClaimable: boolean;
  description: string | null;
}
export interface OrderDetail extends OrderRecord {
  receipts?: OrderReceiptRecord[];
  expenses?: OrderExpenseRecord[];
}
export interface GeneralExpenseRecord {
  id: string;
  amount: string;
  currency: string;
  vatClaimable: boolean;
  category: string | null;
  expenseDate: string;
}
export interface OverheadRecord {
  id: string;
  amount: string;
  currency: string;
  category: string | null;
  periodMonth: string | null;
}
export interface ContractClaimRecord {
  id: string;
  contractId: string;
  amountExVat: string;
  currency: string;
  claimDate: string;
}
export interface PayrollRunRecord {
  id: string;
  siteId: string;
  month: string;
  status: string;
}
export interface PayrollLineRecord {
  id: string;
  employeeId: string;
  gross: string;
  paye: string;
  aidsLevy: string;
  nssaEe: string;
  otherDeductions: string;
  netUsd: string;
  netZwg: string;
  employee: {
    id: string;
    worksNo: string;
    firstName: string;
    lastName: string;
    bankName: string | null;
    accountNo: string | null;
  } | null;
}
export interface PayrollRunDetail extends PayrollRunRecord {
  fxRateId: string | null;
  preparedByUserId: string | null;
  approvedByUserId: string | null;
  createdAt: string;
  lines: PayrollLineRecord[];
}
export interface ComplianceObligationRecord {
  id: string;
  head: string;
  label: string;
  periodMonth: string;
  siteId: string | null;
  amount: string;
  currency: string;
  dueDate: string;
  status: string;
  sourceTable: string | null;
  sourceId: string | null;
  remittanceReference: string | null;
  remittedByUserId: string | null;
  remittedAt: string | null;
  createdAt: string;
}
export interface TimesheetPeriodRecord {
  id: string;
  siteId: string;
  month: string;
  status: string;
  lockedAt: string | null;
  createdAt: string;
}
export interface TimesheetEntryRecord {
  id: string;
  employeeId: string;
  date: string;
  hoursNormal: string;
  hoursOt15: string;
  hoursOt20: string;
  ugShift: string;
  nightHours: string;
  remarks: string | null;
  anomalyFlag: boolean;
}
export interface TimesheetGrid extends TimesheetPeriodRecord {
  entries: TimesheetEntryRecord[];
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

// --- workflows: approvals inbox ---
export interface ApprovalChainInfo {
  id: string;
  module: string;
  subjectTable: string;
  subjectId: string;
  amount: string | null;
  currency: string | null;
  requesterId: string;
  status: string;
  currentStep: number;
}
export interface ApprovalInboxItem {
  id: string;
  chainId: string;
  step: number;
  approverRole: string;
  mode: string;
  decision: string | null;
  createdAt: string;
  chain: ApprovalChainInfo;
}

// --- workflows: requisitions ---
export interface RequisitionRecord {
  id: string;
  purpose: string;
  amount: string;
  currency: string;
  requiredByDate: string;
  siteId: string | null;
  requesterId: string;
  status: string;
  shortfall: string | null;
  disbursementReference: string | null;
}

// --- workflows: travel ---
export interface TravelRecord {
  id: string;
  destination: string;
  dateFrom: string;
  dateTo: string;
  days: number;
  perDiem: string;
  advanceAmount: string;
  currency: string;
  siteId: string | null;
  requesterId: string;
  status: string;
  shortfall: string | null;
  refundDue: string | null;
  refundOwed: string | null;
}

// --- workflows: budgets ---
export interface BudgetLineRecord {
  id: string;
  category: string;
  description: string | null;
  amount: string;
  currency: string;
}
export interface BudgetRecord {
  id: string;
  name: string;
  periodMonth: string | null;
  siteId: string | null;
  currency: string;
  status: string;
  version: number;
}
export interface BudgetActualRow {
  category: string;
  budget: number;
  actual: number;
  variance: number;
}
export interface BudgetDetail extends BudgetRecord {
  lines: BudgetLineRecord[];
  actuals?: BudgetActualRow[];
}

// --- workflows: director withdrawals ---
export interface DirectorWithdrawalRecord {
  id: string;
  amount: string;
  currency: string;
  destinationAccount: string;
  reason: string;
  status: string;
  transferReference: string | null;
}

// --- workflows: petty cash ---
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
export interface PerformanceResult {
  currency: string;
  bookedOrderValue: number;
  servicedOrderIncome: number;
  claimsIncome: number;
  income: number;
  expenses: number;
  expenseBreakdown: { order: number; general: number; overheads: number; loanInterest: number };
  operatingProfit: number;
  margin: number | null;
  orderCount: number;
  servicedOrderCount: number;
}

// --- command centre: cash position + danger alerts ---
export interface CashAccountBalance {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
}
export interface CashPositionPanel {
  panel: string;
  asOf: string;
  accounts: CashAccountBalance[];
  totals: Record<string, number>;
  usdEquivalent: number;
}
export interface AlertRecord {
  id: string;
  ruleKey: string;
  severity: string;
  subjectTable: string | null;
  subjectId: string | null;
  message: string;
  raisedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

// --- CRM (Business Development) ---
export interface CrmOrganisation {
  id: string;
  name: string;
  clientId: string | null;
  industry: string | null;
  source: string | null;
  ownerUserId: string | null;
  notes: string | null;
}
export interface CrmContact {
  id: string;
  organisationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  ownerUserId: string | null;
}
export interface CrmInteraction {
  id: string;
  organisationId: string | null;
  contactId: string | null;
  type: string;
  occurredAt: string;
  outcome: string | null;
  notes: string | null;
}
export interface CrmOpportunity {
  id: string;
  title: string;
  organisationId: string | null;
  contactId: string | null;
  stage: string;
  estimatedValue: string | null;
  currency: string | null;
  ownerUserId: string | null;
  expectedCloseDate: string | null;
  lostReason: string | null;
  convertedOrderId: string | null;
  convertedContractId: string | null;
}
export type CrmBoard = Record<string, CrmOpportunity[]>;
export interface CrmConversionMetrics {
  ownerUserId: string | null;
  organisations: number;
  contacts: number;
  opportunities: number;
  won: number;
  lost: number;
  valueWon: number;
  conversionRate: number;
}
export interface CrmConversionAnalytics {
  overall: CrmConversionMetrics;
  owners: CrmConversionMetrics[];
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
    'Lookups',
    'Clients',
    'Contracts',
    'Orders',
    'CrmOrgs',
    'CrmContacts',
    'CrmInteractions',
    'CrmOpps',
    'GeneralExpenses',
    'Overheads',
    'ContractClaims',
    'PayrollRuns',
    'PayrollRun',
    'TimesheetPeriods',
    'TimesheetGrid',
    'Approvals',
    'Requisitions',
    'Travel',
    'Budgets',
    'Budget',
    'DirectorWithdrawals',
    'PettyCashFloats',
    'PettyCashTxns',
    'ComplianceObligations',
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
      { email: string; password: string; roles?: { siteId?: string; role: string }[] }
    >({
      query: (body) => ({ url: 'v1/users', method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),
    assignRole: build.mutation<UserRecord, { id: string; siteId?: string; role: string }>({
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

    // --- clients ---
    getClients: build.query<ClientRecord[], void>({
      query: () => 'v1/clients',
      providesTags: ['Clients'],
    }),
    createClient: build.mutation<ClientRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/clients', method: 'POST', body }),
      invalidatesTags: ['Clients'],
    }),
    updateClient: build.mutation<ClientRecord, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `v1/clients/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Clients'],
    }),

    // --- contracts ---
    getContracts: build.query<ContractRecord[], void>({
      query: () => 'v1/contracts',
      providesTags: ['Contracts'],
    }),
    createContract: build.mutation<ContractRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/contracts', method: 'POST', body }),
      invalidatesTags: ['Contracts'],
    }),
    updateContract: build.mutation<ContractRecord, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `v1/contracts/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Contracts'],
    }),

    // --- orders ---
    getOrders: build.query<OrderRecord[], void>({
      query: () => 'v1/orders',
      providesTags: ['Orders'],
    }),
    getOrder: build.query<OrderDetail, string>({
      query: (id) => `v1/orders/${id}`,
      providesTags: ['Orders'],
    }),
    createOrder: build.mutation<OrderRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/orders', method: 'POST', body }),
      invalidatesTags: ['Orders'],
    }),
    recordReceipt: build.mutation<unknown, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `v1/orders/${id}/receipts`, method: 'POST', body }),
      invalidatesTags: ['Orders'],
    }),
    markServiced: build.mutation<unknown, string>({
      query: (id) => ({ url: `v1/orders/${id}/mark-serviced`, method: 'POST', body: {} }),
      invalidatesTags: ['Orders'],
    }),
    addOrderExpense: build.mutation<OrderExpenseRecord, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `v1/orders/${id}/expenses`, method: 'POST', body }),
      invalidatesTags: ['Orders'],
    }),

    // --- general expenses & overheads ---
    getGeneralExpenses: build.query<GeneralExpenseRecord[], void>({
      query: () => 'v1/general-expenses',
      providesTags: ['GeneralExpenses'],
    }),
    createGeneralExpense: build.mutation<GeneralExpenseRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/general-expenses', method: 'POST', body }),
      invalidatesTags: ['GeneralExpenses'],
    }),
    getOverheads: build.query<OverheadRecord[], void>({
      query: () => 'v1/overheads',
      providesTags: ['Overheads'],
    }),
    createOverhead: build.mutation<OverheadRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/overheads', method: 'POST', body }),
      invalidatesTags: ['Overheads'],
    }),

    // --- contract claims ---
    getContractClaims: build.query<ContractClaimRecord[], string>({
      query: (id) => `v1/contracts/${id}/claims`,
      providesTags: ['ContractClaims'],
    }),
    addContractClaim: build.mutation<ContractClaimRecord, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `v1/contracts/${id}/claims`, method: 'POST', body }),
      invalidatesTags: ['ContractClaims'],
    }),

    // --- payroll runs ---
    getPayrollRuns: build.query<PayrollRunRecord[], { siteId?: string; month?: string } | void>({
      query: (arg) => {
        const qs = new URLSearchParams();
        if (arg && arg.siteId) qs.set('siteId', arg.siteId);
        if (arg && arg.month) qs.set('month', arg.month);
        const q = qs.toString();
        return `v1/payroll-runs${q ? `?${q}` : ''}`;
      },
      providesTags: ['PayrollRuns'],
    }),
    getPayrollRun: build.query<PayrollRunDetail, string>({
      query: (id) => `v1/payroll-runs/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'PayrollRun', id }],
    }),
    createPayrollRun: build.mutation<PayrollRunRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/payroll-runs', method: 'POST', body }),
      invalidatesTags: ['PayrollRuns'],
    }),
    computePayrollRun: build.mutation<unknown, string>({
      query: (id) => ({ url: `v1/payroll-runs/${id}/compute`, method: 'POST', body: {} }),
      invalidatesTags: (_r, _e, id) => ['PayrollRuns', { type: 'PayrollRun', id }],
    }),
    submitPayrollRun: build.mutation<unknown, string>({
      query: (id) => ({ url: `v1/payroll-runs/${id}/submit`, method: 'POST', body: {} }),
      invalidatesTags: (_r, _e, id) => ['PayrollRuns', { type: 'PayrollRun', id }],
    }),

    // --- statutory compliance calendar ---
    getComplianceObligations: build.query<ComplianceObligationRecord[], { status?: string } | void>({
      query: (arg) => {
        const q = arg && arg.status ? `?status=${arg.status}` : '';
        return `v1/compliance-obligations${q}`;
      },
      providesTags: ['ComplianceObligations'],
    }),
    generateComplianceFromRun: build.mutation<
      { generated: number; obligations: ComplianceObligationRecord[] },
      string
    >({
      query: (runId) => ({ url: `v1/compliance-obligations/from-run/${runId}`, method: 'POST', body: {} }),
      invalidatesTags: ['ComplianceObligations'],
    }),
    remitComplianceObligation: build.mutation<
      ComplianceObligationRecord,
      { id: string; reference: string }
    >({
      query: ({ id, reference }) => ({
        url: `v1/compliance-obligations/${id}/remit`,
        method: 'POST',
        body: { reference },
      }),
      invalidatesTags: ['ComplianceObligations'],
    }),

    // --- timesheet periods ---
    getTimesheetPeriods: build.query<
      TimesheetPeriodRecord[],
      { siteId?: string; month?: string } | void
    >({
      query: (arg) => {
        const qs = new URLSearchParams();
        if (arg && arg.siteId) qs.set('siteId', arg.siteId);
        if (arg && arg.month) qs.set('month', arg.month);
        const q = qs.toString();
        return `v1/timesheet-periods${q ? `?${q}` : ''}`;
      },
      providesTags: ['TimesheetPeriods'],
    }),
    getTimesheetGrid: build.query<TimesheetGrid, string>({
      query: (id) => `v1/timesheet-periods/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'TimesheetGrid', id }],
    }),
    getManhours: build.query<ManhoursResult, string>({
      query: (id) => `v1/timesheet-periods/${id}/manhours`,
      providesTags: (_r, _e, id) => [{ type: 'TimesheetGrid', id }],
    }),
    createTimesheetPeriod: build.mutation<TimesheetPeriodRecord, Record<string, unknown>>({
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
      invalidatesTags: (_r, _e, id) => ['TimesheetPeriods', { type: 'TimesheetGrid', id }],
    }),
    lockTimesheetPeriod: build.mutation<unknown, string>({
      query: (id) => ({ url: `v1/timesheet-periods/${id}/lock`, method: 'POST', body: {} }),
      invalidatesTags: (_r, _e, id) => ['TimesheetPeriods', { type: 'TimesheetGrid', id }],
    }),
    requestReopenTimesheet: build.mutation<unknown, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `v1/timesheet-periods/${id}/reopen-request`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'TimesheetGrid', id }],
    }),

    // --- workflows: approvals inbox ---
    getApprovalInbox: build.query<ApprovalInboxItem[], void>({
      query: () => 'v1/approvals/inbox',
      providesTags: ['Approvals'],
    }),
    decideApproval: build.mutation<unknown, { id: string; decision: string; comment?: string }>({
      query: ({ id, ...body }) => ({ url: `v1/approvals/${id}/decide`, method: 'POST', body }),
      invalidatesTags: [
        'Approvals',
        'Requisitions',
        'Travel',
        'Budgets',
        'DirectorWithdrawals',
        'PettyCashTxns',
      ],
    }),

    // --- workflows: requisitions ---
    getRequisitions: build.query<RequisitionRecord[], { status?: string } | void>({
      query: (arg) => {
        const q = arg && arg.status ? `?status=${arg.status}` : '';
        return `v1/requisitions${q}`;
      },
      providesTags: ['Requisitions'],
    }),
    createRequisition: build.mutation<RequisitionRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/requisitions', method: 'POST', body }),
      invalidatesTags: ['Requisitions'],
    }),
    submitRequisition: build.mutation<unknown, string>({
      query: (id) => ({ url: `v1/requisitions/${id}/submit`, method: 'POST', body: {} }),
      invalidatesTags: ['Requisitions', 'Approvals'],
    }),
    disburseRequisition: build.mutation<unknown, { id: string; accountId: string; reference: string }>({
      query: ({ id, ...body }) => ({ url: `v1/requisitions/${id}/disburse`, method: 'POST', body }),
      invalidatesTags: ['Requisitions'],
    }),
    reCheckRequisitionFunds: build.mutation<
      { checked: number; promoted: string[]; escalated: string[] },
      void
    >({
      query: () => ({ url: 'v1/requisitions/re-check-funds', method: 'POST', body: {} }),
      invalidatesTags: ['Requisitions'],
    }),

    // --- workflows: travel ---
    getTravelRequests: build.query<TravelRecord[], { status?: string } | void>({
      query: (arg) => {
        const q = arg && arg.status ? `?status=${arg.status}` : '';
        return `v1/travel${q}`;
      },
      providesTags: ['Travel'],
    }),
    createTravel: build.mutation<TravelRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/travel', method: 'POST', body }),
      invalidatesTags: ['Travel'],
    }),
    submitTravel: build.mutation<unknown, string>({
      query: (id) => ({ url: `v1/travel/${id}/submit`, method: 'POST', body: {} }),
      invalidatesTags: ['Travel', 'Approvals'],
    }),
    disburseTravel: build.mutation<unknown, { id: string; accountId: string; reference: string }>({
      query: ({ id, ...body }) => ({ url: `v1/travel/${id}/disburse`, method: 'POST', body }),
      invalidatesTags: ['Travel'],
    }),
    retireTravel: build.mutation<unknown, { id: string; receiptsKey: string; unspent: number }>({
      query: ({ id, ...body }) => ({ url: `v1/travel/${id}/retire`, method: 'POST', body }),
      invalidatesTags: ['Travel'],
    }),
    reCheckTravelFunds: build.mutation<
      { checked: number; promoted: string[]; escalated: string[] },
      void
    >({
      query: () => ({ url: 'v1/travel/re-check-funds', method: 'POST', body: {} }),
      invalidatesTags: ['Travel'],
    }),

    // --- workflows: budgets ---
    getBudgets: build.query<BudgetRecord[], { status?: string } | void>({
      query: (arg) => {
        const q = arg && arg.status ? `?status=${arg.status}` : '';
        return `v1/budgets${q}`;
      },
      providesTags: ['Budgets'],
    }),
    getBudget: build.query<BudgetDetail, string>({
      query: (id) => `v1/budgets/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Budget', id }],
    }),
    createBudget: build.mutation<BudgetRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/budgets', method: 'POST', body }),
      invalidatesTags: ['Budgets'],
    }),
    submitBudget: build.mutation<unknown, string>({
      query: (id) => ({ url: `v1/budgets/${id}/submit`, method: 'POST', body: {} }),
      invalidatesTags: ['Budgets', 'Approvals'],
    }),

    // --- workflows: director withdrawals ---
    getDirectorWithdrawals: build.query<DirectorWithdrawalRecord[], { status?: string } | void>({
      query: (arg) => {
        const q = arg && arg.status ? `?status=${arg.status}` : '';
        return `v1/director-withdrawals${q}`;
      },
      providesTags: ['DirectorWithdrawals'],
    }),
    createDirectorWithdrawal: build.mutation<DirectorWithdrawalRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/director-withdrawals', method: 'POST', body }),
      invalidatesTags: ['DirectorWithdrawals'],
    }),
    submitDirectorWithdrawal: build.mutation<unknown, string>({
      query: (id) => ({ url: `v1/director-withdrawals/${id}/submit`, method: 'POST', body: {} }),
      invalidatesTags: ['DirectorWithdrawals', 'Approvals'],
    }),
    completeDirectorWithdrawal: build.mutation<
      unknown,
      { id: string; transferMethod: string; transferReference: string }
    >({
      query: ({ id, ...body }) => ({
        url: `v1/director-withdrawals/${id}/complete`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['DirectorWithdrawals'],
    }),

    // --- workflows: petty cash ---
    getPettyCashFloats: build.query<PettyCashFloatRecord[], { siteId?: string } | void>({
      query: (arg) => {
        const q = arg && arg.siteId ? `?siteId=${arg.siteId}` : '';
        return `v1/petty-cash/floats${q}`;
      },
      providesTags: ['PettyCashFloats'],
    }),
    getPettyCashTxns: build.query<PettyCashTxnRecord[], string>({
      query: (floatId) => `v1/petty-cash/floats/${floatId}/txns`,
      providesTags: ['PettyCashTxns'],
    }),
    createFloat: build.mutation<PettyCashFloatRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/petty-cash/floats', method: 'POST', body }),
      invalidatesTags: ['PettyCashFloats'],
    }),
    createWithdrawal: build.mutation<PettyCashTxnRecord, { id: string } & Record<string, unknown>>({
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
    recordCashCount: build.mutation<unknown, { id: string; countedAmount: number }>({
      query: ({ id, countedAmount }) => ({
        url: `v1/petty-cash/floats/${id}/count`,
        method: 'POST',
        body: { countedAmount },
      }),
      invalidatesTags: ['PettyCashFloats', 'PettyCashTxns'],
    }),
    topUpFloat: build.mutation<PettyCashTxnRecord, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({
        url: `v1/petty-cash/floats/${id}/top-up`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['PettyCashTxns', 'Approvals'],
    }),
    unlockFloat: build.mutation<unknown, string>({
      query: (id) => ({ url: `v1/petty-cash/floats/${id}/unlock`, method: 'POST', body: {} }),
      invalidatesTags: ['PettyCashFloats'],
    }),

    // --- command centre: performance (revenue & profit) ---
    getPerformance: build.query<PerformanceResult, void>({
      query: () => 'v1/command-centre/performance',
    }),
    // --- command centre: cash position + active danger alerts (finance roles) ---
    getCashPosition: build.query<CashPositionPanel, void>({
      query: () => 'v1/command-centre/cash-position',
    }),
    getActiveAlerts: build.query<AlertRecord[], void>({
      query: () => 'v1/alerts?activeOnly=true',
    }),

    // --- CRM: organisations ---
    getOrganisations: build.query<CrmOrganisation[], void>({
      query: () => 'v1/crm/organisations',
      providesTags: ['CrmOrgs'],
    }),
    createOrganisation: build.mutation<CrmOrganisation, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/crm/organisations', method: 'POST', body }),
      invalidatesTags: ['CrmOrgs'],
    }),
    updateOrganisation: build.mutation<CrmOrganisation, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `v1/crm/organisations/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['CrmOrgs'],
    }),

    // --- CRM: contacts ---
    getContacts: build.query<CrmContact[], string | void>({
      query: (organisationId) => ({
        url: 'v1/crm/contacts',
        params: organisationId ? { organisationId } : undefined,
      }),
      providesTags: ['CrmContacts'],
    }),
    createContact: build.mutation<CrmContact, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/crm/contacts', method: 'POST', body }),
      invalidatesTags: ['CrmContacts'],
    }),
    updateContact: build.mutation<CrmContact, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `v1/crm/contacts/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['CrmContacts'],
    }),

    // --- CRM: interactions ---
    getInteractions: build.query<CrmInteraction[], Record<string, string> | void>({
      query: (params) => ({ url: 'v1/crm/interactions', params: params ?? undefined }),
      providesTags: ['CrmInteractions'],
    }),
    createInteraction: build.mutation<CrmInteraction, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/crm/interactions', method: 'POST', body }),
      invalidatesTags: ['CrmInteractions'],
    }),

    // --- CRM: opportunities (pipeline) ---
    getOpportunityBoard: build.query<CrmBoard, void>({
      query: () => 'v1/crm/opportunities/board',
      providesTags: ['CrmOpps'],
    }),
    createOpportunity: build.mutation<CrmOpportunity, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/crm/opportunities', method: 'POST', body }),
      invalidatesTags: ['CrmOpps'],
    }),
    updateOpportunity: build.mutation<CrmOpportunity, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `v1/crm/opportunities/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['CrmOpps'],
    }),
    moveOpportunity: build.mutation<
      CrmOpportunity,
      { id: string; stage: string; lostReason?: string }
    >({
      query: ({ id, ...body }) => ({ url: `v1/crm/opportunities/${id}/move`, method: 'POST', body }),
      invalidatesTags: ['CrmOpps'],
    }),
    convertOpportunity: build.mutation<unknown, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({
        url: `v1/crm/opportunities/${id}/convert`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['CrmOpps', 'Orders', 'Contracts'],
    }),
    getCrmAnalytics: build.query<CrmConversionAnalytics, void>({
      query: () => 'v1/crm/analytics/conversion',
    }),

    // --- approval matrix ---
    getApprovalMatrix: build.query<ApprovalMatrixRecord[], void>({
      query: () => 'v1/approval-matrix',
      providesTags: ['ApprovalMatrix'],
    }),
    getApprovalOptions: build.query<
      { modes: { value: string; label: string }[]; modules: { value: string; label: string }[] },
      void
    >({
      query: () => 'v1/approval-matrix/options',
    }),
    createApprovalRule: build.mutation<ApprovalMatrixRecord, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/approval-matrix', method: 'POST', body }),
      invalidatesTags: ['ApprovalMatrix'],
    }),
    updateApprovalRule: build.mutation<ApprovalMatrixRecord, { id: string; active?: boolean }>({
      query: ({ id, ...body }) => ({ url: `v1/approval-matrix/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['ApprovalMatrix'],
    }),
    deleteApprovalRule: build.mutation<void, string>({
      query: (id) => ({ url: `v1/approval-matrix/${id}`, method: 'DELETE' }),
      invalidatesTags: ['ApprovalMatrix'],
    }),

    // --- danger rules ---
    getDangerRules: build.query<DangerRuleRecord[], void>({
      query: () => 'v1/danger-rules',
      providesTags: ['DangerRules'],
    }),
    updateDangerRule: build.mutation<
      DangerRuleRecord,
      { id: string; enabled?: boolean; severity?: string; params?: Record<string, unknown> }
    >({
      query: ({ id, ...body }) => ({ url: `v1/danger-rules/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['DangerRules'],
    }),

    // --- settings / lookups ---
    getLookups: build.query<LookupRecord[], string | void>({
      query: (category) => ({ url: 'v1/settings/lookups', params: category ? { category } : undefined }),
      providesTags: ['Lookups'],
    }),
    createLookup: build.mutation<LookupRecord, Partial<LookupRecord>>({
      query: (body) => ({ url: 'v1/settings/lookups', method: 'POST', body }),
      invalidatesTags: ['Lookups'],
    }),
    updateLookup: build.mutation<LookupRecord, { id: string; active?: boolean; label?: string }>({
      query: ({ id, ...body }) => ({ url: `v1/settings/lookups/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Lookups'],
    }),
    deleteLookup: build.mutation<void, string>({
      query: (id) => ({ url: `v1/settings/lookups/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Lookups'],
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
  useGetClientsQuery,
  useCreateClientMutation,
  useUpdateClientMutation,
  useGetContractsQuery,
  useCreateContractMutation,
  useUpdateContractMutation,
  useGetOrdersQuery,
  useGetOrderQuery,
  useCreateOrderMutation,
  useRecordReceiptMutation,
  useMarkServicedMutation,
  useAddOrderExpenseMutation,
  useGetGeneralExpensesQuery,
  useCreateGeneralExpenseMutation,
  useGetOverheadsQuery,
  useCreateOverheadMutation,
  useGetContractClaimsQuery,
  useAddContractClaimMutation,
  useGetPayrollRunsQuery,
  useGetPayrollRunQuery,
  useCreatePayrollRunMutation,
  useComputePayrollRunMutation,
  useSubmitPayrollRunMutation,
  useGetComplianceObligationsQuery,
  useGenerateComplianceFromRunMutation,
  useRemitComplianceObligationMutation,
  useGetTimesheetPeriodsQuery,
  useGetTimesheetGridQuery,
  useGetManhoursQuery,
  useCreateTimesheetPeriodMutation,
  useUpsertTimesheetEntriesMutation,
  useSubmitTimesheetPeriodMutation,
  useLockTimesheetPeriodMutation,
  useRequestReopenTimesheetMutation,
  useGetApprovalInboxQuery,
  useDecideApprovalMutation,
  useGetRequisitionsQuery,
  useCreateRequisitionMutation,
  useSubmitRequisitionMutation,
  useDisburseRequisitionMutation,
  useReCheckRequisitionFundsMutation,
  useGetTravelRequestsQuery,
  useCreateTravelMutation,
  useSubmitTravelMutation,
  useDisburseTravelMutation,
  useRetireTravelMutation,
  useReCheckTravelFundsMutation,
  useGetBudgetsQuery,
  useGetBudgetQuery,
  useCreateBudgetMutation,
  useSubmitBudgetMutation,
  useGetDirectorWithdrawalsQuery,
  useCreateDirectorWithdrawalMutation,
  useSubmitDirectorWithdrawalMutation,
  useCompleteDirectorWithdrawalMutation,
  useGetPettyCashFloatsQuery,
  useGetPettyCashTxnsQuery,
  useCreateFloatMutation,
  useCreateWithdrawalMutation,
  useConfirmWithdrawalMutation,
  useRecordCashCountMutation,
  useTopUpFloatMutation,
  useUnlockFloatMutation,
  useGetPerformanceQuery,
  useGetCashPositionQuery,
  useGetActiveAlertsQuery,
  useGetOrganisationsQuery,
  useCreateOrganisationMutation,
  useUpdateOrganisationMutation,
  useGetContactsQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
  useGetInteractionsQuery,
  useCreateInteractionMutation,
  useGetOpportunityBoardQuery,
  useCreateOpportunityMutation,
  useUpdateOpportunityMutation,
  useMoveOpportunityMutation,
  useConvertOpportunityMutation,
  useGetCrmAnalyticsQuery,
  useGetApprovalMatrixQuery,
  useGetApprovalOptionsQuery,
  useCreateApprovalRuleMutation,
  useUpdateApprovalRuleMutation,
  useDeleteApprovalRuleMutation,
  useGetDangerRulesQuery,
  useUpdateDangerRuleMutation,
  useGetLookupsQuery,
  useCreateLookupMutation,
  useUpdateLookupMutation,
  useDeleteLookupMutation,
} = api;
