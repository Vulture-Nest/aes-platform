# @aes/shared

Shared **API contract types**, generated from the NestJS OpenAPI document — a single source
of truth for request/response shapes across tooling and the Flutter dio client.

## Generate

The API is the source of truth. Run it, then generate:

```bash
npm run api                 # from repo root — starts NestJS on :3000
npm run shared:generate     # writes packages/shared/generated/schema.ts
```

Or point at an exported spec:

```bash
OPENAPI_URL=./openapi.json npm run generate
```

> `generated/` is git-ignored — it is a build artifact reproduced from the OpenAPI spec.
