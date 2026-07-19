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

  static const dev = FlavorConfig(
    flavor: Flavor.dev,
    apiBaseUrl: 'http://localhost:3000',
  );

  static const prod = FlavorConfig(
    flavor: Flavor.prod,
    // Override per deployment (e.g. --dart-define=API_BASE_URL=...).
    apiBaseUrl: 'https://api.aes.example',
  );
}
