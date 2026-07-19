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
  tagTypes: ['Notifications', 'ExchangeRates'],
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
} = api;
