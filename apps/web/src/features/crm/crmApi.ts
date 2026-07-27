import { api } from '../../api/api';

// --- CRM (Business Development) types ---
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

// Reference lists needed by the forms (owner / billed-client selects).
export interface CrmUserOption {
  id: string;
  email: string;
}
export interface CrmClientOption {
  id: string;
  name: string;
}

// NOTE: this feature does not register its own tagTypes (api.ts is owned by the
// integration agent). Each mutation returns the refreshed resource and the page
// re-fetches the relevant list queries via `refetch()`, so no cross-query tag
// wiring is required.
export const crmApi = api.injectEndpoints({
  endpoints: (build) => ({
    // Reference lists
    getCrmUsers: build.query<CrmUserOption[], void>({
      query: () => 'v1/users',
    }),
    getCrmClients: build.query<CrmClientOption[], void>({
      query: () => 'v1/clients',
    }),

    // Organisations
    getCrmOrganisations: build.query<CrmOrganisation[], void>({
      query: () => 'v1/crm/organisations',
    }),
    createCrmOrganisation: build.mutation<CrmOrganisation, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/crm/organisations', method: 'POST', body }),
    }),
    updateCrmOrganisation: build.mutation<
      CrmOrganisation,
      { id: string } & Record<string, unknown>
    >({
      query: ({ id, ...body }) => ({ url: `v1/crm/organisations/${id}`, method: 'PATCH', body }),
    }),

    // Contacts
    getCrmContacts: build.query<CrmContact[], string | void>({
      query: (organisationId) => ({
        url: 'v1/crm/contacts',
        params: organisationId ? { organisationId } : undefined,
      }),
    }),
    createCrmContact: build.mutation<CrmContact, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/crm/contacts', method: 'POST', body }),
    }),
    updateCrmContact: build.mutation<CrmContact, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `v1/crm/contacts/${id}`, method: 'PATCH', body }),
    }),

    // Interactions
    getCrmInteractions: build.query<CrmInteraction[], Record<string, string> | void>({
      query: (params) => ({ url: 'v1/crm/interactions', params: params ?? undefined }),
    }),
    createCrmInteraction: build.mutation<CrmInteraction, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/crm/interactions', method: 'POST', body }),
    }),

    // Opportunities (pipeline)
    getCrmOpportunityBoard: build.query<CrmBoard, void>({
      query: () => 'v1/crm/opportunities/board',
    }),
    createCrmOpportunity: build.mutation<CrmOpportunity, Record<string, unknown>>({
      query: (body) => ({ url: 'v1/crm/opportunities', method: 'POST', body }),
    }),
    moveCrmOpportunity: build.mutation<
      CrmOpportunity,
      { id: string; stage: string; lostReason?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `v1/crm/opportunities/${id}/move`,
        method: 'POST',
        body,
      }),
    }),
    convertCrmOpportunity: build.mutation<unknown, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({
        url: `v1/crm/opportunities/${id}/convert`,
        method: 'POST',
        body,
      }),
    }),

    // Analytics
    getCrmAnalytics: build.query<CrmConversionAnalytics, void>({
      query: () => 'v1/crm/analytics/conversion',
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetCrmUsersQuery,
  useGetCrmClientsQuery,
  useGetCrmOrganisationsQuery,
  useCreateCrmOrganisationMutation,
  useUpdateCrmOrganisationMutation,
  useGetCrmContactsQuery,
  useCreateCrmContactMutation,
  useUpdateCrmContactMutation,
  useGetCrmInteractionsQuery,
  useCreateCrmInteractionMutation,
  useGetCrmOpportunityBoardQuery,
  useCreateCrmOpportunityMutation,
  useMoveCrmOpportunityMutation,
  useConvertCrmOpportunityMutation,
  useGetCrmAnalyticsQuery,
} = crmApi;
