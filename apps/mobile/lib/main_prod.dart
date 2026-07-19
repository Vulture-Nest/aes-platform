import 'main_common.dart';
import 'src/config/flavor_config.dart';

/// Prod entrypoint:  flutter run --flavor prod -t lib/main_prod.dart
void main() => bootstrap(FlavorConfig.prod);
