# Deployment & CI/CD

Target: **Docker images built by GitHub Actions → DigitalOcean droplet → DO Managed PostgreSQL.**

> **Server not provisioned yet.** These files are ready but parameterised entirely by
> secrets. Fill in the droplet/registry/DB details and add the repo secrets once the
> infrastructure exists.

## ⚠️ Activating the workflows

The GitHub Actions YAML lives here under `deploy/github-workflows/` because the PAT used to
push this repo **lacks the `workflow` scope** (GitHub blocks pushing `.github/workflows/*`
without it). To activate CI/CD:

```bash
mkdir -p .github/workflows
git mv deploy/github-workflows/ci.yml     .github/workflows/ci.yml
git mv deploy/github-workflows/deploy.yml .github/workflows/deploy.yml
# commit & push with a token that has the `workflow` scope (or via the GitHub web UI)
```

## Files

| File | Purpose |
|------|---------|
| `github-workflows/ci.yml` | Lint/test/build for API, web, and mobile on every PR/push. |
| `github-workflows/deploy.yml` | Build & push images, roll out on the droplet, run migrations. |
| `compose.prod.yml` | Runs prebuilt images on the droplet; Postgres is the external managed cluster. |

## Required repo secrets (Settings → Secrets → Actions)

| Secret | Example / notes |
|--------|-----------------|
| `REGISTRY` | `registry.digitalocean.com/aes` or `ghcr.io/vulture-nest` |
| `REGISTRY_USERNAME` / `REGISTRY_TOKEN` | Registry login (DO API token works for DOCR). |
| `DO_HOST` | Droplet public IP / hostname. |
| `DO_USER` | SSH user (e.g. `deploy`). |
| `DO_SSH_KEY` | Private SSH key for the droplet. |
| `DATABASE_URL` | DO Managed Postgres URI, `...?sslmode=require`. |
| `JWT_SECRET` | Production JWT signing secret (see local-JWT auth). |

## One-time droplet setup

```bash
# On the droplet:
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
sudo mkdir -p /opt/aes && sudo chown $USER /opt/aes
```

The deploy workflow copies `compose.prod.yml` to `/opt/aes/` and runs `docker compose pull && up -d`.
The API container applies `prisma migrate deploy` against the managed DB on start.

## Local testing (works today, no server needed)

```bash
# Full stack in Docker (build api + web images locally):
docker compose up --build          # web http://localhost:8080 · api http://localhost:3000

# Or infra-only + run api/web from source:
docker compose -f docker-compose.dev.yml up -d
( cd apps/api && npm run start:dev )
( cd apps/web && npm run dev )
```
