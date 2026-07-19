import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '../../rbac/roles';

const REFRESH_KEY = 'aes.admin.refreshToken';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  /** True until the initial session-rehydrate attempt completes. */
  initializing: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  refreshToken: localStorage.getItem(REFRESH_KEY),
  user: null,
  initializing: true,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    tokensReceived(state, action: PayloadAction<{ accessToken: string; refreshToken: string }>) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      localStorage.setItem(REFRESH_KEY, action.payload.refreshToken);
    },
    userLoaded(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
    },
    initialized(state) {
      state.initializing = false;
    },
    loggedOut(state) {
      state.accessToken = null;
      state.refreshToken = null;
      state.user = null;
      localStorage.removeItem(REFRESH_KEY);
    },
  },
});

export const { tokensReceived, userLoaded, initialized, loggedOut } = authSlice.actions;
export default authSlice.reducer;
