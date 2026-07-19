# AES Admin Console

The **configuration hub** for the AES platform — **React 18 + Redux Toolkit (RTK Query) +
TypeScript + Ant Design** (Vite). All admin/config happens here; the end-user experience is a
separate app in [`apps/web`](../web).

## What it configures

| Section | Roles | Backs onto |
|---------|-------|-----------|
| Users & Roles | SYS_ADMIN | `/v1/users` (+ role assignment) |
| Sites | SYS_ADMIN | `/v1/sites` |
| Exchange Rates | FD / FO / SYS_ADMIN | `/v1/exchange-rates` (append-only, effective-dated) |
| Statutory Rates | FD / SYS_ADMIN | `/v1/statutory-rates` |
| Thresholds & Tunables | FD / SYS_ADMIN | `/v1/thresholds` |
| Delegation | FD / OD / SYS_ADMIN | `/v1/delegation-rules` |
| Audit Log | SYS_ADMIN / AUDITOR | `/v1/audit` |

New config sections drop in by adding an endpoint to `src/api/api.ts` + a page — the app is
built to grow (approval matrix, danger rules, etc. as backend lands).

## RBAC

The API enforces RBAC server-side; the console mirrors it: nav items and routes are gated by
the signed-in user's roles (from `/v1/auth/me`). See `src/rbac/roles.ts`,
`src/components/ProtectedRoute.tsx`, and the role filters in `src/components/AppLayout.tsx`.

## Auth

Local JWT: login stores the **access token in Redux** (memory) and the **refresh token in
`localStorage`**. The RTK Query base query transparently refreshes on `401` (single-flight via
a mutex) and rehydrates the session on load.

## Run

```bash
npm install
npm run dev        # http://localhost:5174  (proxies /api → http://localhost:3000)
npm test           # vitest
npm run build      # type-check + production build
```

Sign in with the seeded SysAdmin (`admin@aes.local` / `ChangeMe!123` by default).
