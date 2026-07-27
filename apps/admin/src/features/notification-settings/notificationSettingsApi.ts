import { api } from '../../api/api';

// Per-user notification channel preferences (gap G24). We register the tag scoped
// to this feature via enhanceEndpoints so we never touch the shared api/api.ts —
// the integration agent owns that file.
const enhancedApi = api.enhanceEndpoints({
  addTagTypes: ['NotificationPreferences'],
});

/** The delivery channels the backend fans out to (Prisma NotificationChannel). */
export type NotificationChannel = 'IN_APP' | 'PUSH' | 'EMAIL' | 'TEAMS';

/** Severities a notification can carry (Prisma NotificationSeverity). */
export type NotificationSeverity = 'INFO' | 'WATCH' | 'DANGER';

/** A single stored preference row for the current user. */
export interface NotificationPreferenceRecord {
  id: string;
  userId: string;
  channel: NotificationChannel;
  enabled: boolean;
}

export const notificationSettingsApi = enhancedApi.injectEndpoints({
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
  notificationSettingsApi;
