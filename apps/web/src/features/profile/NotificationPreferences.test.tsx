import { App } from 'antd';
import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// antd's responsive observer needs matchMedia, which jsdom doesn't provide; the shared
// setupTests.ts is owned elsewhere, so polyfill it locally for this suite.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

// Mock the RTK Query hooks so the section renders without a store / network.
const setPreference = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const useGetNotificationPreferencesQuery = vi.fn();
const useSetNotificationPreferenceMutation = vi.fn(() => [setPreference, { isLoading: false }]);

vi.mock('./notificationPrefsApi', () => ({
  useGetNotificationPreferencesQuery: () => useGetNotificationPreferencesQuery(),
  useSetNotificationPreferenceMutation: () => useSetNotificationPreferenceMutation(),
}));

import { NotificationPreferences } from './NotificationPreferences';

const renderSection = () =>
  render(
    <App>
      <NotificationPreferences />
    </App>,
  );

describe('NotificationPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGetNotificationPreferencesQuery.mockReturnValue({ data: [], isLoading: false });
    useSetNotificationPreferenceMutation.mockReturnValue([setPreference, { isLoading: false }]);
  });

  it('renders push, email and a locked in-app toggle', () => {
    renderSection();
    expect(screen.getByText('Notification preferences')).toBeInTheDocument();
    const inApp = screen.getByLabelText('In-app notifications');
    expect(inApp).toBeChecked();
    expect(inApp).toBeDisabled();
    expect(screen.getByLabelText('Push notifications')).toBeChecked();
    expect(screen.getByLabelText('Email notifications')).toBeChecked();
  });

  it('reflects a disabled channel from the server', () => {
    useGetNotificationPreferencesQuery.mockReturnValue({
      data: [{ id: '1', userId: 'u1', channel: 'PUSH', enabled: false }],
      isLoading: false,
    });
    renderSection();
    expect(screen.getByLabelText('Push notifications')).not.toBeChecked();
  });

  it('sends a PUT when email is toggled off', () => {
    renderSection();
    screen.getByLabelText('Email notifications').click();
    expect(setPreference).toHaveBeenCalledWith({ channel: 'EMAIL', enabled: false });
  });
});
