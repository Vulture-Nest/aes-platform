import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';

/**
 * The site scope for the current request, propagated into Postgres session GUCs
 * (`app.bypass_rls`, `app.site_ids`) that the row-level-security policies read.
 *
 * - `bypass: true`  → see/act on every row (system jobs, cron, pre-auth queries, and
 *   users holding a global role — a role assignment with `siteId = null`).
 * - `bypass: false` → restricted to `siteIds` (plus rows whose `site_id` is NULL, which
 *   are shared/global records such as the chart of accounts or the global approval matrix).
 */
export interface RlsStore {
  bypass: boolean;
  siteIds: string[];
}

const OPEN: RlsStore = { bypass: true, siteIds: [] };

/**
 * Derive the RLS scope from an authenticated user's role assignments. A user with any
 * global (siteId = null) role sees everything; otherwise they are scoped to the distinct
 * sites their roles are assigned to.
 */
export function scopeFromUser(user: AuthenticatedUser): RlsStore {
  const hasGlobalRole = user.roles.some((r) => r.siteId === null);
  if (hasGlobalRole) {
    return { bypass: true, siteIds: [] };
  }
  const siteIds = [...new Set(user.roles.map((r) => r.siteId).filter((s): s is string => !!s))];
  return { bypass: false, siteIds };
}

/**
 * Request-scoped holder for the RLS site scope, backed by AsyncLocalStorage so it
 * survives across the async call chain (guard → handler → services → Prisma) without
 * threading it through every signature. The store object is created once per request by
 * RlsMiddleware and mutated in place by the auth layer once the user is known.
 */
@Injectable()
export class RlsContext {
  private readonly als = new AsyncLocalStorage<RlsStore>();

  /** Establish a fresh (default = bypass) scope for a request and run the rest within it. */
  run<T>(fn: () => T): T {
    return this.als.run({ bypass: true, siteIds: [] }, fn);
  }

  /** Narrow the current request's scope once the authenticated user is resolved. */
  set(store: RlsStore): void {
    const current = this.als.getStore();
    if (current) {
      current.bypass = store.bypass;
      current.siteIds = store.siteIds;
    }
  }

  /** The current scope, or an open (bypass) scope outside any request (jobs, bootstrap). */
  get(): RlsStore {
    return this.als.getStore() ?? OPEN;
  }
}
