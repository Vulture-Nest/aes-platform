import 'package:flutter/widgets.dart';

import 'src/app.dart';
import 'src/config/flavor_config.dart';

/// Shared bootstrap invoked by both flavor entrypoints. Passes the selected flavor
/// into the app, which wires the repositories and BLoC providers.
void bootstrap(FlavorConfig config) {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(AesApp(config: config));
}
