# AES Web (React + Redux + TypeScript)

The **web** client, built with **React 18 + Redux Toolkit + TypeScript** on **Vite**.
(The mobile client is a separate Flutter app in [`apps/mobile`](../mobile).)

## Architecture

```
axios client  →  createAsyncThunk / slice (Redux Toolkit)  →  typed hooks  →  component
```

- **`src/api/client.ts`** — axios instance; base URL from `VITE_API_BASE_URL`.
- **`src/features/<feature>/<feature>Slice.ts`** — state + async thunks (RTK).
- **`src/app/store.ts`** — the store; **`src/app/hooks.ts`** — typed `useAppDispatch` / `useAppSelector`.
- **Components** read state via the typed hooks and dispatch thunks.

## Run

```bash
npm install
npm run dev        # http://localhost:5173  (proxies /api → http://localhost:3000)
npm test           # vitest + Testing Library
npm run lint
npm run build      # type-check + production build to dist/
```

## Config

| Var | Default | Purpose |
|-----|---------|---------|
| `VITE_API_BASE_URL` | `/api` | API base. In dev, `/api` is proxied to the local NestJS API (see `vite.config.ts`). |

## Docker

```bash
docker build -t aes-web --build-arg VITE_API_BASE_URL=/api apps/web
```

Multi-stage build → static files served by nginx, which also proxies `/api/` to the `api`
service. See the root [`docker-compose.yml`](../../docker-compose.yml) for the full local stack.
