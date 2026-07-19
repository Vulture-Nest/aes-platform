import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/flavor_config.dart';

/// Provides the active flavor to the widget tree. Overridden at bootstrap in
/// main_common.dart with the flavor chosen by the entrypoint.
final flavorProvider = Provider<FlavorConfig>((ref) {
  throw UnimplementedError('flavorProvider must be overridden at bootstrap');
});

/// Placeholder home for the S0 scaffold. The role dashboard + danger banner
/// (spec §15.1) replace this in the S7 Flutter stage.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final flavor = ref.watch(flavorProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('AES Platform')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.dashboard_customize_outlined, size: 64),
            const SizedBox(height: 16),
            const Text(
              'AES Operations & Finance',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Text('Scaffold · flavor: ${flavor.name}'),
            Text('API: ${flavor.apiBaseUrl}'),
          ],
        ),
      ),
    );
  }
}
