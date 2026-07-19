import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';
import 'src/config/flavor_config.dart';
import 'src/features/home/home_screen.dart';

/// Shared bootstrap invoked by both flavor entrypoints. Seeds the flavor into the
/// provider container so the whole tree reads the same config.
void bootstrap(FlavorConfig config) {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ProviderScope(
      overrides: [flavorProvider.overrideWithValue(config)],
      child: const AesApp(),
    ),
  );
}
