import { api as baseApi } from '../../api/api';

// Register marketing-specific cache tags without editing the shared api.ts.
// enhanceEndpoints returns a new api handle whose tag-type union includes ours,
// so injectEndpoints below is fully type-checked.
const api = baseApi.enhanceEndpoints({
  addTagTypes: [
    'MktCampaigns',
    'MktChannels',
    'MktMetrics',
    'MktResponses',
    'MktAnalytics',
    'MktUsers',
    'MktOrgs',
  ] as const,
});

// ---- Types (local to the marketing feature) --------------------------------

export type ResponseStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'DEAD';
export const RESPONSE_STATUSES: ResponseStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'DEAD'];

// Minimal shapes for the reference lists the forms need. The shared web api.ts
// does not expose users / organisations, so this feature injects its own
// read-only endpoints against the same backend.
export interface UserOption {
  id: string;
  email: string;
}

export interface OrgOption {
  id: string;
  name: string;
}

export interface Campaign {
  id: string;
  name: string;
  entityId?: string | null;
  objective?: string | null;
  audience?: string | null;
  budget?: string | number | null;
  currency?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  ownerUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CampaignChannel {
  id: string;
  campaignId: string;
  channelType: string;
  cost?: string | number | null;
  currency?: string | null;
  trackingLink?: string | null;
  flierCode?: string | null;
  printRunQty?: number | null;
  createdAt?: string;
}

export interface ChannelMetric {
  id: string;
  channelId: string;
  weekOf: string;
  impressions?: number | null;
  engagements?: number | null;
  clicks?: number | null;
  spend?: string | number | null;
}

export interface CampaignResponse {
  id: string;
  campaignId?: string | null;
  channelId?: string | null;
  personName?: string | null;
  orgName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  receivedAt?: string | null;
  howHeard: string;
  status: ResponseStatus;
  ownerUserId?: string | null;
  createdAt?: string;
}

export interface CampaignFunnel {
  campaignId: string;
  name: string;
  byStatus: Record<ResponseStatus, number>;
  totalResponses: number;
}

export interface LeaderboardEntry {
  campaignId: string;
  name: string;
  totalChannelCost: number;
  totalResponses: number;
  costPerLead: number | null;
  valueWon: number;
}

export interface ChannelComparisonEntry {
  channelType: string;
  totalCost: number;
  responses: number;
  costPerResponse: number | null;
}

export interface MarketingAnalytics {
  funnel: CampaignFunnel[];
  leaderboard: LeaderboardEntry[];
  channelComparison: ChannelComparisonEntry[];
}

// ---- Request payloads ------------------------------------------------------

export interface CreateCampaignBody {
  name: string;
  entityId?: string;
  objective?: string;
  audience?: string;
  budget?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  ownerUserId?: string;
}

export interface CreateChannelBody {
  channelType: string;
  cost?: number;
  currency?: string;
  trackingLink?: string;
  flierCode?: string;
  printRunQty?: number;
}

export interface CreateMetricBody {
  weekOf: string;
  impressions?: number;
  engagements?: number;
  clicks?: number;
  spend?: number;
}

export interface CreateResponseBody {
  campaignId?: string;
  channelId?: string;
  personName?: string;
  orgName?: string;
  contactEmail?: string;
  contactPhone?: string;
  receivedAt?: string;
  howHeard: string;
  ownerUserId?: string;
}

export interface ConvertResponseBody {
  title: string;
  organisationId?: string;
  contactId?: string;
  estimatedValue?: number;
  currency?: string;
  ownerUserId?: string;
}

// ---- Endpoints -------------------------------------------------------------

export const marketingApi = api.injectEndpoints({
  endpoints: (build) => ({
    // Reference lists (users / organisations) needed by the forms.
    getMktUsers: build.query<UserOption[], void>({
      query: () => 'v1/users',
      providesTags: ['MktUsers'],
    }),
    getMktOrganisations: build.query<OrgOption[], void>({
      query: () => 'v1/crm/organisations',
      providesTags: ['MktOrgs'],
    }),

    // Campaigns
    getCampaigns: build.query<Campaign[], { status?: string } | void>({
      query: (args) => ({
        url: 'v1/marketing/campaigns',
        params: args && args.status ? { status: args.status } : undefined,
      }),
      providesTags: ['MktCampaigns'],
    }),
    createCampaign: build.mutation<Campaign, CreateCampaignBody>({
      query: (body) => ({ url: 'v1/marketing/campaigns', method: 'POST', body }),
      invalidatesTags: ['MktCampaigns'],
    }),
    updateCampaign: build.mutation<Campaign, { id: string } & Partial<CreateCampaignBody>>({
      query: ({ id, ...body }) => ({ url: `v1/marketing/campaigns/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['MktCampaigns'],
    }),

    // Channels
    getChannels: build.query<CampaignChannel[], string>({
      query: (campaignId) => `v1/marketing/campaigns/${campaignId}/channels`,
      providesTags: (_r, _e, campaignId) => [{ type: 'MktChannels', id: campaignId }],
    }),
    createChannel: build.mutation<CampaignChannel, { campaignId: string } & CreateChannelBody>({
      query: ({ campaignId, ...body }) => ({
        url: `v1/marketing/campaigns/${campaignId}/channels`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { campaignId }) => [
        { type: 'MktChannels', id: campaignId },
        'MktAnalytics',
      ],
    }),

    // Metrics (nested under channel)
    getMetrics: build.query<ChannelMetric[], string>({
      query: (channelId) => `v1/marketing/campaigns/channels/${channelId}/metrics`,
      providesTags: (_r, _e, channelId) => [{ type: 'MktMetrics', id: channelId }],
    }),
    createMetric: build.mutation<ChannelMetric, { channelId: string } & CreateMetricBody>({
      query: ({ channelId, ...body }) => ({
        url: `v1/marketing/campaigns/channels/${channelId}/metrics`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { channelId }) => [{ type: 'MktMetrics', id: channelId }],
    }),

    // Responses / leads
    getResponses: build.query<
      CampaignResponse[],
      { status?: ResponseStatus; campaignId?: string } | void
    >({
      query: (args) => ({
        url: 'v1/marketing/responses',
        params: args
          ? {
              ...(args.status ? { status: args.status } : {}),
              ...(args.campaignId ? { campaignId: args.campaignId } : {}),
            }
          : undefined,
      }),
      providesTags: ['MktResponses'],
    }),
    createResponse: build.mutation<CampaignResponse, CreateResponseBody>({
      query: (body) => ({ url: 'v1/marketing/responses', method: 'POST', body }),
      invalidatesTags: ['MktResponses', 'MktAnalytics'],
    }),
    updateResponseStatus: build.mutation<
      CampaignResponse,
      { id: string; status: ResponseStatus }
    >({
      query: ({ id, status }) => ({
        url: `v1/marketing/responses/${id}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: ['MktResponses'],
    }),
    convertResponse: build.mutation<unknown, { id: string } & ConvertResponseBody>({
      query: ({ id, ...body }) => ({
        url: `v1/marketing/responses/${id}/convert`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MktResponses', 'MktAnalytics'],
    }),

    // Analytics
    getMarketingAnalytics: build.query<MarketingAnalytics, void>({
      query: () => 'v1/marketing/analytics',
      providesTags: ['MktAnalytics'],
    }),
  }),
});

export const {
  useGetMktUsersQuery,
  useGetMktOrganisationsQuery,
  useGetCampaignsQuery,
  useCreateCampaignMutation,
  useUpdateCampaignMutation,
  useGetChannelsQuery,
  useCreateChannelMutation,
  useGetMetricsQuery,
  useCreateMetricMutation,
  useGetResponsesQuery,
  useCreateResponseMutation,
  useUpdateResponseStatusMutation,
  useConvertResponseMutation,
  useGetMarketingAnalyticsQuery,
} = marketingApi;
