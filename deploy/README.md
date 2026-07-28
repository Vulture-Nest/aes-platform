# Deployment & CI/CD

Target: **images built & pushed by GitHub Actions → pulled onto a DigitalOcean droplet → DO Managed PostgreSQL.**
One droplet dedicated to AES; the database is a **dedicated `aes` database on the shared managed cluster** (the same cluster other projects use — separate database + user, so the data is isolated).

> **Dormant by design.** No droplet exists yet, so the deploy pipeline ships OFF:
> it is manual-only (`workflow_dispatch`) and a `guard` job fails fast unless the
> repo **variable** `DEPLOY_ENABLED == "true"`. CI (lint/test/build) is independent
> and safe to run anytime.

## Files

| File | Purpose |
|------|---------|
| `github-workflows/ci.yml` | Lint/test/build for **api, admin, web, mobile** on every PR/push. |
| `github-workflows/deploy.yml` | Dormant. Build+push api/admin/web images, roll out on the droplet, migrate. |
| `compose.prod.yml` | Runs the prebuilt images on the droplet (api, admin, web, redis, nginx). Postgres is external/managed. |
| `nginx/` | Reverse proxy: host routing (`api.` / `admin.` / `app.` + IP fallback), rate limits, TLS mounts. |
| `server-setup.sh` | One-time droplet bootstrap (deploy user, Docker, UFW/fail2ban, swap, SSH hardening). |
| `.env.production.example` | Template for the droplet-local `/opt/aes/.env` (DB URL, JWT, storage). |

## Activating the workflows

The YAML lives here (not `.github/workflows/`) because the push token **lacks the `workflow` scope**. To turn CI/CD on:

```bash
mkdir -p .github/workflows
git mv deploy/github-workflows/ci.yml     .github/workflows/ci.yml
git mv deploy/github-workflows/deploy.yml .github/workflows/deploy.yml
# commit & push with a workflow-scoped token (or add via the GitHub web UI)
```

CI runs immediately. **Deploy stays dormant** until you set `DEPLOY_ENABLED=true` (below).

## GitHub secrets & variables (Settings → Secrets and variables → Actions)

**Secrets:**

| Secret | Notes |
|--------|-------|
| `REGISTRY` | Full image prefix, e.g. `ghcr.io/vulture-nest` (GHCR, free) or `registry.digitalocean.com/aes`. |
| `REGISTRY_USERNAME` / `REGISTRY_TOKEN` | Registry login. GHCR: your GitHub username + a PAT with `write:packages`. |
| `DO_HOST` | Droplet public IP / hostname. |
| `DO_USER` | SSH user (`deploy`). |
| `DO_SSH_KEY` | Private half of the CI deploy key (public half in the droplet's `authorized_keys`). |

**Variable:**

| Variable | Value |
|----------|-------|
| `DEPLOY_ENABLED` | `true` to arm deploys. Absent/anything-else keeps the pipeline dormant. |

> DB URL, JWT secret and storage keys are **not** GitHub secrets — they live in the
> droplet's `/opt/aes/.env` (see `.env.production.example`), so production secrets
> never leave the host.

## One-time infra setup

1. **Managed Postgres** — on the shared cluster, create database `aes` and a user (`aes` owner + the `aes_app` RLS role is created by migrations). Prefer the cluster's **connection pool** host. Add the droplet IP to **Trusted Sources**.
2. **Droplet** — create an Ubuntu 24.04 droplet, then:
   ```bash
   ssh root@<DROPLET_IP> 'bash -s' < deploy/server-setup.sh
   ```
3. **Droplet env** — create `/opt/aes/.env` from `.env.production.example` (real `DATABASE_URL`, `JWT_SECRET`, storage, `REGISTRY`).
4. **DNS** — point `api.`, `admin.`, `app.` (and apex) at the droplet IP; replace `aes.example.com` in `nginx/conf.d/default.conf`. (Before DNS, the IP serves web at `/` and the API at `/api/`.)

## Deploy

Set `DEPLOY_ENABLED=true`, then **Actions → Deploy → Run workflow**. It builds/pushes the three images, ships compose + nginx, `docker compose pull && up -d`, and the api container migrates the managed DB on start.

## Local testing (no server needed)

```bash
docker compose up --build          # full stack locally: web + admin + api + infra
```
