# AES Mobile (Flutter)

**Mobile** client (iOS + Android). State management is **BLoC + Cubit** (`flutter_bloc`),
go_router for navigation, dio for the API client. The **web** experience is a separate React
app in [`apps/web`](../web).

## Architecture — BLoC + Cubit

```
Repository (dio)  →  Cubit (business/state logic)  →  BlocBuilder (UI)
```

- **Repositories** (`lib/src/data/`) wrap dio and expose plain Futures — no state.
- **Cubits** (`lib/src/features/<feature>/cubit/`) hold state as `sealed` `Equatable` classes
  and are unit-tested with fake repositories (see `test/auth_cubit_test.dart`).
- **Widgets** consume state via `BlocBuilder`/`context.read<T>()`.

## Auth — local JWT

Sign-in is **email + password against the local-JWT API** (not a third-party IdP — mirrors the
admin/web apps). `AuthCubit` drives the whole session:

- `POST /v1/auth/login` → an access + refresh token pair, kept in the platform keychain via
  `flutter_secure_storage` (`SecureTokenStore`).
- `AuthInterceptor` attaches the bearer token and, on a `401`, transparently refreshes it once
  (single-flight) and retries; a failed refresh clears the session and routes back to `/login`.
- User + roles are always loaded fresh from `GET /v1/auth/me`, so RBAC is never stale. The
  router guard and dashboard tiles hide anything the API would forbid (`lib/src/rbac/roles.dart`).

## Flavors

Two entrypoints select the flavor and API base URL at launch:

| Flavor | Entrypoint | API base URL |
|--------|-----------|--------------|
| dev | `lib/main_dev.dart` | `http://localhost:3000` |
| prod | `lib/main_prod.dart` | `https://api.aes.example` (set per environment) |

## Run

```bash
flutter pub get

flutter run --flavor dev  -t lib/main_dev.dart    # dev
flutter run --flavor prod -t lib/main_prod.dart   # prod

flutter test        # unit + widget tests
flutter analyze
```

> Platform folders (`android/`, `ios/`) are generated with `flutter create .` on first
> checkout — they are intentionally not committed. Web is **not** a Flutter target here.

## Structure

```
lib/
├── main_dev.dart / main_prod.dart      # flavor entrypoints
├── main_common.dart                    # shared bootstrap
└── src/
    ├── app.dart                        # providers + router + MaterialApp.router
    ├── config/flavor_config.dart       # flavor + base URL
    ├── api/
    │   ├── dio_client.dart             # dio instance + auth interceptor wiring
    │   ├── auth_interceptor.dart       # bearer attach + refresh-on-401
    │   └── api_exception.dart          # friendly error mapping
    ├── data/                           # repositories (dio → Futures) + token store
    ├── models/                         # AuthUser, SiteRole, TokenPair, Alert
    ├── rbac/roles.dart                 # role groups mirroring API RBAC
    ├── theme/                          # Material 3 theme + USD/ZWG money format
    ├── router/app_router.dart          # go_router + auth-guard redirect
    └── features/
        ├── auth/                       # AuthCubit + login screen
        └── home/                       # dashboard tiles + danger banner
```

## Status

Shipped so far:
- **Foundation** — local-JWT auth (login, session restore, refresh, sign-out), role-aware
  router guard, home dashboard (role tiles + persistent danger banner), theming.
- **Approvals inbox** — approve/reject/return, biometric confirm on money items.
- **Requests** — raise & track requisitions, travel and **petty-cash** (float withdrawals):
  create → submit → status timeline, with camera/gallery **receipt capture** uploaded via
  the attachments API.
- **Command Centre** — health-verdict banner + summary panels (cash, money in/out, coverage,
  obligations, performance, receivables, tax) and the active **alert feed with acknowledge**.

Still to come: orders board, director actions, and offline-first draft capture (Drift/SQLite
outbound queue) + FCM push.
