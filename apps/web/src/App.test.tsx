import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import healthReducer from './features/health/healthSlice';
import { apiClient } from './api/client';

vi.mock('./api/client', () => ({
  apiClient: { get: vi.fn() },
}));

const mockedGet = vi.mocked(apiClient.get);

function renderApp() {
  const store = configureStore({ reducer: { health: healthReducer } });
  return render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('renders the heading and initial health state', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /AES Operations/i })).toBeInTheDocument();
    expect(screen.getByText(/not checked/i)).toBeInTheDocument();
  });

  it('shows "online" after a successful health check', async () => {
    mockedGet.mockResolvedValueOnce({ data: { status: 'ok' } });
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: /check api health/i }));

    expect(await screen.findByText(/online/i)).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/health');
  });
});
