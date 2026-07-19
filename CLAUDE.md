# AES Platform — Project Context (Prompt 0)

> This file is the standing context for every AI coding session on this repository.
> It is **Prompt 0** from [`docs/AES_Agent_Prompts.md`](docs/AES_Agent_Prompts.md). Read it before any task.

## ⚠️ Architecture decisions (override the spec PDF / agent prompts)

Decisions made after the docs were written. **These win over anything in `docs/`.**

1. **Auth is local JWT — NOT Microsoft Entra ID / OIDC.** (2026-07-19) We own the identity:
   `users` table, email + password login (argon2), self-signed JWTs (access + rotating
   refresh), admin-provisioned users with a seeded initial SysAdmin. Ignore every
   Entra/OIDC/MSAL reference in the docs — it is superseded.
2. **RBAC is fully self-managed** — `roles` + `user_site_roles` enforced by our own NestJS
   guards. No third-party authorization provider. (Postgres RLS still applies, added in S3.)
3. **Clients are split, not one Flutter codebase.** (2026-07-19)
   - **`apps/mobile`** — Flutter (iOS/Android only), state via **BLoC + Cubit** (`flutter_bloc`).
     No Riverpod, no Flutter web.
   - **`apps/web`** — separate **React + Redux Toolkit + TypeScript** app (Vite).
4. **Deployment: Docker → GitHub Actions → DigitalOcean droplet + DO Managed PostgreSQL.**
   (2026-07-19) Pipeline in `deploy/`. Server not provisioned yet → **everything must run and
   be tested locally**; deploy secrets/host come later. GH Actions YAML lives in
   `deploy/github-workflows/` until a `workflow`-scoped token can push it to `.github/workflows/`.

```
You are building the AES Operations & Finance Management System for Airflow Environmental
Solutions, a Zimbabwean mining-services contractor. Full spec: docs/AES_System_Design.pdf.
Repository: https://github.com/Vulture-Nest/aes-platform (private). Work on feature
branches (stage/<n>-<name>), open PRs into main; never push directly to main.

Stack: NestJS (TypeScript, REST + WebSocket, OpenAPI); Flutter mobile (BLoC + Cubit) +
React/Redux/TypeScript web (see decisions above); PostgreSQL 16 + Prisma, Redis + BullMQ,
local JWT auth (self-managed, NOT Entra/OIDC), FCM push, Microsoft Graph for
email/Teams/SharePoint file storage, server-side XLSX/PDF/CSV generation.
Monorepo: apps/api (NestJS), apps/mobile (Flutter), apps/web (React), packages/shared.

Non-negotiable principles:
1. Single source of truth: PostgreSQL. Excel is an OUTPUT format only.
2. Approve first, fund second: fund availability NEVER blocks approval; it sets
   Approved-Ready-to-Pay vs Approved-Pending-Funds and drives escalation.
3. Human executes money movement: system prepares/approves/posts; a person performs the
   bank/wallet transfer and captures the reference.
4. Multi-currency native (USD + ZWG): every monetary value is stored as
   (amount, currency, fx_rate_id, rate_type[official|parallel|client_ratio]).
   Never convert destructively. Exchange rates are append-only and effective-dated.
5. Site-first capture with offline tolerance for mine sites (Mimosa, Unki, Zimplats, HQ).
6. Auditability everywhere: append-only audit_log (actor, table, record_id, action,
   before/after JSONB, timestamp) on every insert/update/approval/status change.
7. All statutory values (VAT %, PAYE bands per currency, NSSA/ZIMDEF/NEC/MIPF params,
   ZIMRA interest %) are effective-dated admin configuration, never hardcoded.
8. RBAC per user per site, self-managed and enforced in NestJS guards AND (from S3) Postgres
   row-level security. Roles: Site Clerk, Site Manager, Operations Staff, Finance Officer,
   Finance Director (FD), Operations Director (OD), Managing Director/Directors, System
   Administrator, Auditor (read-only). No user may ever approve their own request.
9. Business logic lives in unit-tested domain services, not report-layer arithmetic.
   Appendix A of the spec is the authoritative rulebook; classic workbook rules must be
   reproduced to $0.01 before any IMPROVE variant activates.
10. Timezone Africa/Harare; all interest accrued by nightly jobs, idempotently.

Conventions: UUID PKs; created_by/created_at/updated_by/updated_at on all tables;
class-validator DTOs; feature modules mirror the spec's module map; every endpoint guarded;
write migration + unit tests + OpenAPI annotations with every feature. Ask before inventing
any business rule not in the spec.
```

## Build sequencing

The full stage map and per-stage acceptance gates live in
[`docs/AES_Build_Flow.md`](docs/AES_Build_Flow.md); the per-stage agent prompts live in
[`docs/AES_Agent_Prompts.md`](docs/AES_Agent_Prompts.md). One prompt per branch/PR:

| Stage | Branch | Deliverable |
|-------|--------|-------------|
| S0 | `stage/1-scaffold` | Monorepo scaffold (**this PR**) |
| S1 | `stage/2-foundations` | Auth, RBAC, audit, reference data, notifications |
| S2 | `stage/3-approval-engine` | Generic approval engine |
| S3 | `stage/4-financial-core` | Financial core + Appendix A domain services |
| S4 | `stage/5-migration` | Excel data migration + parity gate |
| S5 | `stage/6-workflows` | Requisitions, travel, petty cash, budgets, withdrawals |
| S6 | `stage/7-command-centre` | Command Centre + danger engine |
| S7 | `stage/8-clients` | Client apps — Flutter mobile (BLoC) + React/Redux web |
| S8–S11 | … | Timesheets, payroll, BI, CRM, hardening |

> The design PDF referenced as `docs/AES_System_Design.pdf` should be added to the repo.
> Until then, `docs/AES_Build_Flow.pdf` (build & design flow) is the authoritative companion.

## Working agreement

- **Never push directly to `main`.** Branch as `stage/<n>-<name>`, open a PR, require green CI.
- Finish each stage with **passing tests + a clean Prisma migration** before starting the next.
- Re-run the Appendix A golden test suite after every stage — it is the finance-core regression net.
- If a business rule is not covered here or in the spec PDF, **stop and ask** — statutory
  numbers (VAT, PAYE bands, NSSA) are effective-dated config confirmed with a tax practitioner,
  never hardcoded.
