import { configureStore } from '@reduxjs/toolkit';
import healthReducer from '../features/health/healthSlice';

export const store = configureStore({
  reducer: {
    health: healthReducer,
    // S1+ feature slices (auth, sites, …) register here.
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
