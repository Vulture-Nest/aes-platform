import axios from 'axios';

/**
 * Shared axios instance. Base URL comes from VITE_API_BASE_URL (defaults to the
 * dev proxy prefix `/api`). Auth interceptors (JWT bearer) attach here in S1.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 20000,
  headers: { Accept: 'application/json' },
});
