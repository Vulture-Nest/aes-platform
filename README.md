# AES Operations & Finance Management System

Monorepo for the **AES Operations & Finance Management System** — the operations and finance
platform for **Airflow Environmental Solutions (AES)**, a Zimbabwean mining-services contractor.

> **Status:** Stage 0 — repository & environment scaffold. No business logic yet.
> See [`docs/AES_Build_Flow.md`](docs/AES_Build_Flow.md) for the full staged plan.

## Architecture decisions

These override the original spec in [`docs/`](docs/):

1. **Auth is local JWT (self-managed)** — own `users` table, email + password (argon2),
   self-signed access + rotating refresh tokens, admin-provisioned users with a seeded
   SysAdmin. **Not** a third-party identity provider.
2. **RBAC is self-managed** — `roles` + `user_site_roles` enforced by NestJS guards
   (Postgres row-level security added from S3).
3. **Clients are split** — `apps/mobile` (Flutter, **BLoC + Cubit**, mobile-only) and
   `apps/web` (**React + Redux Toolkit + TypeScript**). Not one Flutter codebase.
4. **Deployment** — Docker → GitHub Actions → **DigitalOcean droplet + DO Managed
   PostgreSQL**. Local-first until the server is provisioned.

## Stack

| Layer | Technology |
|-------|-----------|
| API | NestJS 10 (TypeScript), REST + WebSocket, OpenAPI |
| Data | PostgreSQL 16 + Prisma |
| Jobs / cache | Redis 7 + BullMQ |
| File store | MinIO (local) behind a `StorageService` interface (SharePoint/Graph in prod) |
| **Mobile** | **Flutter 3 — BLoC + Cubit**, go_router, dio |
| **Web** | **React 18 + Redux Toolkit + TypeScript** (Vite) |
| Auth | **Local JWT (self-managed)** + self-managed RBAC — *not* a third-party IdP |
| Deploy | Docker → GitHub Actions → DigitalOcean droplet + DO Managed PostgreSQL |
| Analytics | Microsoft Fabric / Power BI |
| Notifications | FCM push + Microsoft Graph (email/Teams) |

## Repository layout

```
.
├── apps/
│   ├── api/            # NestJS API (Prisma, config, health, OpenAPI, storage)
│   ├── mobile/         # Flutter mobile client (BLoC + Cubit, dev/prod flavors)
│   └── web/            # React + Redux + TS web client (Vite)
├── packages/
│   └── shared/         # Generated API contract types (OpenAPI → TS)
├── deploy/             # CI/CD workflows + prod compose (DigitalOcean)
├── docs/               # Build flow, agent prompts, system design
├── docker-compose.yml       # full local stack (api + web + infra)
├── docker-compose.dev.yml   # infra only (run api/web from source)
└── .env.example
```

## Getting started

### Prerequisites

- Node.js 20+ and npm 10+
- Docker + Docker Compose
- Flutter 3.19+ (for `apps/mobile`)

### Option A — full stack in Docker (closest to production)

```bash
cp .env.example .env
docker compose up --build
#   web  → http://localhost:8080
#   api  → http://localhost:3000  (docs at /docs, health at /health)
```

### Option B — infra in Docker, apps from source (fast iteration)

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres:16, redis:7, minio

# API
cd apps/api && cp .env.example .env && npm install
npx prisma generate && npx prisma migrate dev
npm run start:dev            # http://localhost:3000

# Web (new terminal)
cd apps/web && npm install && npm run dev   # http://localhost:5173 (proxies /api → :3000)

# Mobile (new terminal)
cd apps/mobile && flutter pub get
flutter run --flavor dev -t lib/main_dev.dart
```

## Deployment

Docker images built by **GitHub Actions**, deployed to a **DigitalOcean droplet** backed by
**DO Managed PostgreSQL**. Pipeline + prod compose live in [`deploy/`](deploy/).

> The server is not provisioned yet — everything above runs and tests **locally** today.
> The GitHub Actions YAML is staged under `deploy/github-workflows/` and must be moved to
> `.github/workflows/` with a **`workflow`-scoped token** to activate (see [`deploy/README.md`](deploy/README.md)).

## Contributing

- **Never push directly to `main`.** Branch as `stage/<n>-<name>`, open a PR, require green CI.
- CI (API + web + mobile) is defined in `deploy/github-workflows/ci.yml`; activate it per above.
- Each stage maps to a numbered prompt in [`docs/AES_Agent_Prompts.md`](docs/AES_Agent_Prompts.md).

## License

Proprietary — © Airflow Environmental Solutions / Vulture-Nest. All rights reserved.
