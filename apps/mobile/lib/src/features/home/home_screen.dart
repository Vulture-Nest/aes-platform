import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../config/flavor_config.dart';
import 'cubit/health_cubit.dart';

/// Placeholder home for the scaffold. The role dashboard + danger banner
/// (spec §15.1) replace this in the S7 stage. Shown here to exercise the
/// BLoC + Cubit wiring end to end against the API `/health` endpoint.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.flavor});

  final FlavorConfig flavor;

  @override
  Widget build(BuildContext context) {
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
            const SizedBox(height: 24),
            BlocBuilder<HealthCubit, HealthState>(
              builder: (context, state) {
                final label = switch (state) {
                  HealthInitial() => 'API health: not checked',
                  HealthLoading() => 'API health: checking…',
                  HealthOnline() => 'API health: online',
                  HealthOffline(:final message) => 'API health: offline ($message)',
                };
                return Column(
                  children: [
                    Text(label),
                    const SizedBox(height: 8),
                    FilledButton(
                      onPressed: state is HealthLoading
                          ? null
                          : () => context.read<HealthCubit>().check(),
                      child: const Text('Check API health'),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
