import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/petty_cash.dart';
import '../../theme/money.dart';
import 'cubit/petty_cash_cubit.dart';
import 'petty_cash_float_screen.dart';

/// Petty Cash tab of the Requests hub: the site's floats. Tap a float to view
/// its transactions and raise a withdrawal.
class PettyCashTab extends StatelessWidget {
  const PettyCashTab({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<PettyCashCubit, PettyCashState>(
      buildWhen: (a, b) =>
          a.floats != b.floats || a.floatsLoading != b.floatsLoading || a.error != b.error,
      builder: (context, state) {
        if (state.floatsLoading && state.floats.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }
        return RefreshIndicator(
          onRefresh: () => context.read<PettyCashCubit>().loadFloats(),
          child: state.floats.isEmpty
              ? ListView(
                  children: [
                    const SizedBox(height: 120),
                    Icon(state.error != null ? Icons.cloud_off : Icons.savings_outlined, size: 48),
                    const SizedBox(height: 12),
                    Center(child: Text(state.error ?? 'No petty-cash floats for your site')),
                  ],
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: state.floats.length,
                  itemBuilder: (context, i) => _FloatCard(float: state.floats[i]),
                ),
        );
      },
    );
  }
}

class _FloatCard extends StatelessWidget {
  const _FloatCard({required this.float});

  final PettyCashFloat float;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<PettyCashCubit>();
    return Card(
      child: ListTile(
        leading: const CircleAvatar(child: Icon(Icons.savings_outlined)),
        title: Text('${float.currency} float'),
        subtitle: Text(
          'Float ${Money.format(float.floatAmount, currency: float.currency)}'
          '${float.locked ? ' · LOCKED' : ''}',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => BlocProvider.value(
              value: cubit,
              child: PettyCashFloatScreen(float: float),
            ),
          ),
        ),
      ),
    );
  }
}
