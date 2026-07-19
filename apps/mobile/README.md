# AES Mobile (Flutter)

**Mobile** client (iOS + Android). State management is **BLoC + Cubit** (`flutter_bloc`),
go_router for navigation, dio for the API client (generated from the NestJS OpenAPI spec in
later stages). The **web** experience is a separate React app in [`apps/web`](../web).

## Architecture — BLoC + Cubit

```
Repository (dio)  →  Cubit (business/state logic)  →  BlocBuilder (UI)
```

- **Repositories** (`lib/src/data/`) wrap dio and expose plain Futures — no state.
- **Cubits** (`lib/src/features/<feature>/cubit/`) hold state as `sealed` `Equatable` classes
  and are unit-tested with fake repositories (see `test/health_cubit_test.dart`).
- **Widgets** consume state via `BlocBuilder`/`context.read<T>()`.

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
    ├── app.dart                        # MultiBlocProvider + MaterialApp.router
    ├── config/flavor_config.dart       # flavor + base URL
    ├── api/dio_client.dart             # dio instance (base URL, interceptors)
    ├── data/health_repository.dart     # repositories (dio → Futures)
    ├── router/app_router.dart          # go_router config
    └── features/
        └── home/
            ├── cubit/health_cubit.dart # Cubit + sealed states
            └── home_screen.dart        # BlocBuilder UI
```
