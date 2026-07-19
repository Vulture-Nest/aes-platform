import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient } from '../../api/client';

export type HealthStatus = 'idle' | 'loading' | 'online' | 'offline';

export interface HealthState {
  status: HealthStatus;
  error: string | null;
}

const initialState: HealthState = {
  status: 'idle',
  error: null,
};

/** Probes the API `/health` endpoint; resolves true when it reports `status: ok`. */
export const checkHealth = createAsyncThunk('health/check', async () => {
  const response = await apiClient.get<{ status: string }>('/health');
  return response.data.status === 'ok';
});

const healthSlice = createSlice({
  name: 'health',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(checkHealth.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(checkHealth.fulfilled, (state, action) => {
        state.status = action.payload ? 'online' : 'offline';
        state.error = action.payload ? null : 'API reported unhealthy';
      })
      .addCase(checkHealth.rejected, (state, action) => {
        state.status = 'offline';
        state.error = action.error.message ?? 'Request failed';
      });
  },
});

export default healthSlice.reducer;
