# Deployment & CI/CD

Target: **images built & pushed by GitHub Actions → pulled onto a DigitalOcean droplet → DO Managed PostgreSQL.**
One droplet dedicated to AES; the database is a **dedicated `aes` database on the shared managed cluster** (the same cluster other projects use — separate database + user, so the data is isolated).

> **Continuous deployment.** `deploy.yml` and `release-mobile.yml` both run
> automatically now — see [Current state](#current-state) below. CI
> (lint/test/build) has always been independent and safe to run anytime.

## Current state

| Pipeline | File | Trigger | Status |
|---|---|---|---|
| **CI** | `.github/workflows/ci.yml` | every push/PR to `main` | ✅ Active |
| **Deploy** (api, admin, web) | `.github/workflows/deploy.yml` | every push to `main`, or manual dispatch | ✅ Active |
| **Release Mobile** (AES Operations app) | `.github/workflows/release-mobile.yml` | every push to `main` touching `apps/mobile/` → `internal` Play track; a `mobile-v*` tag or manual dispatch → any track | ✅ Active |

Merging to `main` therefore ships automatically. The `deploy.yml` `guard` job
still fails fast unless the repository variable `DEPLOY_ENABLED == "true"` —
that's the kill-switch if you need to pause backend/web auto-deploys without
touching the workflow file. Mobile has no separate switch; see
[Pausing deploys](#pausing-deploys).

## Files

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Lint/test/build for **api, admin, web, mobile** on every PR/push. |
| `.github/workflows/deploy.yml` | Build+push api/admin/web images, roll out on the droplet, migrate. |
| `.github/workflows/release-mobile.yml` | Build a signed AAB and publish to Google Play. |
| `deploy/compose.prod.yml` | Runs the prebuilt images on the droplet (api, admin, web, redis, nginx). Postgres is external/managed. |
| `deploy/nginx/` | Reverse proxy: host routing (`api.` / `admin.` / `app.` + IP fallback), rate limits, TLS mounts. |
| `deploy/server-setup.sh` | One-time droplet bootstrap (deploy user, Docker, UFW/fail2ban, swap, SSH hardening). |
| `deploy/.env.production.example` | Template for the droplet-local `/opt/aes/.env` (DB URL, JWT, storage). |

## GitHub secrets & variables (Settings → Secrets and variables → Actions)

**Secrets (deploy.yml):**

| Secret | Notes |
|--------|-------|
| `REGISTRY` | Full image prefix, e.g. `ghcr.io/vulture-nest` (GHCR, free) or `registry.digitalocean.com/aes`. |
| `REGISTRY_USERNAME` / `REGISTRY_TOKEN` | Registry login. GHCR: your GitHub username + a PAT with `write:packages`. |
| `DO_HOST` | Droplet public IP / hostname. |
| `DO_USER` | SSH user (`deploy`). |
| `DO_SSH_KEY` | Private half of the CI deploy key (public half in the droplet's `authorized_keys`). |

**Secrets (release-mobile.yml):**

| Secret | Notes |
|--------|-------|
| `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | Upload keystore for signing the release AAB. |
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Play service-account key (Play Developer API access). |

**Variable:**

| Variable | Value |
|----------|-------|
| `DEPLOY_ENABLED` | `true` to allow `deploy.yml` to actually reach the droplet. Absent/anything-else fails the `guard` job fast — no secret is read and no host is contacted. |

> DB URL, JWT secret and storage keys are **not** GitHub secrets — they live in the
> droplet's `/opt/aes/.env` (see `deploy/.env.production.example`), so production secrets
> never leave the host.

## One-time infra setup

1. **Managed Postgres** — on the shared cluster, create database `aes` and a user (`aes` owner + the `aes_app` RLS role is created by migrations). Prefer the cluster's **connection pool** host. Add the droplet IP to **Trusted Sources**.
2. **Droplet** — create an Ubuntu 24.04 droplet, then:
   ```bash
   ssh root@<DROPLET_IP> 'bash -s' < deploy/server-setup.sh
   ```
3. **Droplet env** — create `/opt/aes/.env` from `deploy/.env.production.example` (real `DATABASE_URL`, `JWT_SECRET`, storage, `REGISTRY`).
4. **DNS** — point `api.`, `admin.`, `app.` (and apex) at the droplet IP; replace `aes.example.com` in `deploy/nginx/conf.d/default.conf`. (Before DNS, the IP serves web at `/` and the API at `/api/`.)

## Mobile releases

`release-mobile.yml` publishes `org.vulturenest.aes` (flavor `prod`,
`lib/main_prod.dart`):

- **Push to `main` touching `apps/mobile/`** — version name from
  `apps/mobile/pubspec.yaml`, versionCode from `github.run_number` (monotonic
  — Play never rejects it), always `internal` track (no review, invisible to
  real users).
- **Push a `mobile-v1.2.0` tag**, or **manual dispatch** picking
  `version`/`track` — the way to promote a proven internal build to
  `alpha`/`beta`/`production`.

New apps need a closed test with 12+ opted-in testers before Play allows
applying for production access — a Google policy gate independent of this
pipeline. `internal` has no such requirement.

## Pausing deploys

- **Backend/web**: set `DEPLOY_ENABLED` to anything other than `true` (or
  delete it).
- **Mobile**: remove the `branches: [main]` entry under `on.push` in
  `release-mobile.yml` if you need to stop auto-publishing while keeping
  tag/manual releases available.

## Local testing (no server needed)

```bash
docker compose up --build          # full stack locally: web + admin + api + infra
```
