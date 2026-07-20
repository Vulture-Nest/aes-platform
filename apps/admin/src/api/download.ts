import { store } from '../app/store';
import { loggedOut, tokensReceived } from '../features/auth/authSlice';
import type { Tokens } from './api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

/**
 * Authenticated file download. RTK Query is awkward for binary blobs + filename
 * handling, so report exports go through this helper instead: it attaches the
 * access token, transparently refreshes once on 401, and saves the returned blob
 * using the filename from the Content-Disposition header (falling back to `fallback`).
 */
export async function downloadFile(path: string, fallback: string): Promise<void> {
  const doFetch = (token: string | null) =>
    fetch(`${API_BASE}/${path.replace(/^\//, '')}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  let token = store.getState().auth.accessToken;
  let res = await doFetch(token);

  if (res.status === 401) {
    const refreshToken = store.getState().auth.refreshToken;
    if (refreshToken) {
      const refresh = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refresh.ok) {
        const tokens = (await refresh.json()) as Tokens;
        store.dispatch(tokensReceived(tokens));
        token = tokens.accessToken;
        res = await doFetch(token);
      } else {
        store.dispatch(loggedOut());
      }
    }
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.message ?? '';
    } catch {
      // non-JSON error body — ignore
    }
    throw new Error(detail || `Download failed (${res.status})`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : fallback;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
