# AES App (Flutter)

One codebase for **mobile + web**. Riverpod for state, go_router for navigation, dio for
the API client (generated from the NestJS OpenAPI spec in later stages).

## Flavors

Two entrypoints select the flavor and API base URL at launch:

| Flavor | Entrypoint | API base URL |
|--------|-----------|--------------|
| dev | `lib/main_dev.dart` | `http://localhost:3000` |
| prod | `lib/main_prod.dart` | `https://api.aes.example` (set per environment) |

## Run

```bash
flutter pub get

# Mobile
flutter run --flavor dev -t lib/main_dev.dart

# Web
flutter run -d chrome -t lib/main_dev.dart
```

> Platform folders (`android/`, `ios/`, `web/`) are generated with `flutter create .`
> on first checkout — they are intentionally not committed in the S0 scaffold.

## Structure

```
lib/
├── main_dev.dart / main_prod.dart   # flavor entrypoints
├── main_common.dart                 # shared bootstrap
└── src/
    ├── app.dart                     # root MaterialApp.router
    ├── config/flavor_config.dart    # flavor + base URL
    ├── api/dio_client.dart          # dio instance (correlation-id, base URL)
    ├── router/app_router.dart       # go_router config
    └── features/                    # feature-first screen modules
```
