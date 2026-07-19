# AES Operations & Finance Management System

Monorepo for the **AES Operations & Finance Management System** — the operations and finance
platform for **Airflow Environmental Solutions (AES)**, a Zimbabwean mining-services contractor.

> **Status:** Stage 0 — repository & environment scaffold. No business logic yet.
> See [`docs/AES_Build_Flow.md`](docs/AES_Build_Flow.md) for the full staged plan and
> [`CLAUDE.md`](CLAUDE.md) for the standing project context.

## Stack

| Layer | Technology |
|-------|-----------|
| API | NestJS 10 (TypeScript), REST + WebSocket, OpenAPI |
| Data | PostgreSQL 16 + Prisma |
| Jobs / cache | Redis 7 + BullMQ |
| File store | MinIO (local) behind a `StorageService` interface (SharePoint/Graph in prod) |
| Client | Flutter 3 (mobile + web, one codebase), Riverpod, go_router |
| Auth | Microsoft Entra ID (OIDC) |
| Analytics | Microsoft Fabric / Power BI |
| Notifications | FCM push + Microsoft Graph (email/Teams) |

## Repository layout

```
.
├── apps/
│   ├── api/            # NestJS API (Prisma, config, health, OpenAPI, storage)
│   └── app/            # Flutter client (mobile + web, dev/prod flavors)
├── packages/
│   └── shared/         # Generated API contract types (OpenAPI → TS)
├── docs/               # Build flow, agent prompts, system design
├── docker-compose.dev.yml
└── .env.example
```

> **CI is not yet wired up.** A GitHub Actions workflow (API lint/test/build + Prisma
> migrate check; Flutter analyze/test) is planned at `.github/workflows/ci.yml` and must be
> added with a `workflow`-scoped token before branch protection can require green checks.

## Getting started

### Prerequisites

- Node.js 20+ and npm 10+
- Docker + Docker Compose
- Flutter 3.19+ (for `apps/app`)

### 1. Local infrastructure

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d   # postgres:16, redis:7, minio
```

### 2. API

```bash
cd apps/api
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev          # applies the (empty) baseline schema
npm run start:dev               # http://localhost:3000
```

- Health check: `GET http://localhost:3000/health`
- OpenAPI docs: `http://localhost:3000/docs`

### 3. Flutter client

```bash
cd apps/app
flutter pub get
flutter run --flavor dev -t lib/main_dev.dart          # mobile
flutter run -d chrome --flavor dev -t lib/main_dev.dart # web
```

## Contributing

- **Never push directly to `main`.** Branch as `stage/<n>-<name>`, open a PR, require green CI.
- CI (lint, unit tests, Prisma migrate check, Flutter analyze/test) is planned but not yet
  enabled — see the CI note above. Once added, it must pass before merge.
- Each stage maps to a numbered prompt in [`docs/AES_Agent_Prompts.md`](docs/AES_Agent_Prompts.md).

## License

Proprietary — © Airflow Environmental Solutions / Vulture-Nest. All rights reserved.
