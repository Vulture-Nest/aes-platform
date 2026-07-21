/// Build flavor and its environment-specific settings.
///
/// Selected by the entrypoint (`main_dev.dart` / `main_prod.dart`) so the same
/// codebase ships to every environment without conditional imports.
enum Flavor { dev, prod }

class FlavorConfig {
  const FlavorConfig({
    required this.flavor,
    required this.apiBaseUrl,
  });

  final Flavor flavor;
  final String apiBaseUrl;

  bool get isProduction => flavor == Flavor.prod;

  String get name => flavor.name;

  // Override the base URL at launch with --dart-define=API_BASE_URL=...
  // On the Android emulator the host machine's API is reached via 10.0.2.2, e.g.
  //   flutter run --flavor dev -t lib/main_dev.dart --dart-define=API_BASE_URL=http://10.0.2.2:3000
  static const dev = FlavorConfig(
    flavor: Flavor.dev,
    apiBaseUrl: String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000'),
  );

  static const prod = FlavorConfig(
    flavor: Flavor.prod,
    apiBaseUrl: String.fromEnvironment('API_BASE_URL', defaultValue: 'https://api.aes.example'),
  );
}
