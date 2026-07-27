import { api } from '../../api/api';

// Per-user notification channel preferences (gap G24). The tag is registered scoped
// to this feature via enhanceEndpoints so the shared api/api.ts (owned by the
// integration agent) is left untouched.
const enhancedApi = api.enhanceEndpoints({
  addTagTypes: ['NotificationPreferences'],
});

/** Delivery channels the backend supports (Prisma NotificationChannel). */
export type NotificationChannel = 'IN_APP' | 'PUSH' | 'EMAIL' | 'TEAMS';

/** A single stored preference row for the current user. */
export interface NotificationPreferenceRecord {
  id: string;
  userId: string;
  channel: NotificationChannel;
  enabled: boolean;
}

export const notificationPrefsApi = enhancedApi.injectEndpoints({
  endpoints: (build) => ({
    getNotificationPreferences: build.query<NotificationPreferenceRecord[], void>({
      query: () => 'v1/notifications/preferences',
      providesTags: ['NotificationPreferences'],
    }),
    setNotificationPreference: build.mutation<
      NotificationPreferenceRecord,
      { channel: NotificationChannel; enabled: boolean }
    >({
      query: (body) => ({ url: 'v1/notifications/preferences', method: 'PUT', body }),
      invalidatesTags: ['NotificationPreferences'],
    }),
  }),
});

export const { useGetNotificationPreferencesQuery, useSetNotificationPreferenceMutation } =
  notificationPrefsApi;
