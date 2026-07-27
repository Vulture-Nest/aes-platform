import { App } from 'antd';
import { render, screen, within } from '@testing-library/react';
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

// Mock the RTK Query hooks so the page renders without a store / network.
const setPreference = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const useGetNotificationPreferencesQuery = vi.fn();
const useSetNotificationPreferenceMutation = vi.fn(() => [setPreference, { isLoading: false }]);

vi.mock('./notificationSettingsApi', () => ({
  useGetNotificationPreferencesQuery: () => useGetNotificationPreferencesQuery(),
  useSetNotificationPreferenceMutation: () => useSetNotificationPreferenceMutation(),
}));

import { NotificationSettingsPage } from './NotificationSettingsPage';

const renderPage = () =>
  render(
    <App>
      <NotificationSettingsPage />
    </App>,
  );

describe('NotificationSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGetNotificationPreferencesQuery.mockReturnValue({ data: [], isLoading: false });
    useSetNotificationPreferenceMutation.mockReturnValue([setPreference, { isLoading: false }]);
  });

  it('renders the routing matrix and the preference toggles', () => {
    renderPage();
    expect(screen.getByText('Notification settings')).toBeInTheDocument();
    expect(screen.getByText('Severity → channel routing')).toBeInTheDocument();
    expect(screen.getByText('My channel preferences')).toBeInTheDocument();
    // A toggle exists for each channel (in-app + push + email + teams).
    expect(screen.getByLabelText('Push enabled')).toBeInTheDocument();
    expect(screen.getByLabelText('Email enabled')).toBeInTheDocument();
    expect(screen.getByLabelText('Microsoft Teams enabled')).toBeInTheDocument();
  });

  it('reflects a disabled preference from the server', () => {
    useGetNotificationPreferencesQuery.mockReturnValue({
      data: [{ id: '1', userId: 'u1', channel: 'EMAIL', enabled: false }],
      isLoading: false,
    });
    renderPage();
    expect(screen.getByLabelText('Email enabled')).not.toBeChecked();
    // Unset channels default to enabled.
    expect(screen.getByLabelText('Push enabled')).toBeChecked();
  });

  it('locks the in-app channel (always on, cannot toggle)', () => {
    renderPage();
    const inApp = screen.getByLabelText('In-app enabled');
    expect(inApp).toBeChecked();
    expect(inApp).toBeDisabled();
  });

  it('sends a PUT when a channel is toggled off', async () => {
    renderPage();
    screen.getByLabelText('Push enabled').click();
    expect(setPreference).toHaveBeenCalledWith({ channel: 'PUSH', enabled: false });
  });

  it('shows the severity → channel fan-out in the routing matrix', () => {
    renderPage();
    // Matrix has a "used"/"not used" mark per (channel × severity). Per channelsFor:
    // INFO=1 (in-app), WATCH=3 (in-app/push/email), DANGER=4 (+teams) => 8 used cells;
    // the other 4 (push/email at INFO, teams at INFO+WATCH) are "not used".
    const usedCells = within(document.body).getAllByLabelText('used');
    const notUsedCells = within(document.body).getAllByLabelText('not used');
    expect(usedCells.length).toBe(8);
    expect(notUsedCells.length).toBe(4);
    // Microsoft Teams appears in both the routing matrix and the preferences table.
    expect(screen.getAllByText('Microsoft Teams').length).toBe(2);
  });
});
