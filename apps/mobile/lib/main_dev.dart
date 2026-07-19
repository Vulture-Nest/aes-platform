import 'main_common.dart';
import 'src/config/flavor_config.dart';

/// Dev entrypoint:  flutter run --flavor dev -t lib/main_dev.dart
void main() => bootstrap(FlavorConfig.dev);
