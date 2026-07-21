import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/petty_cash.dart';
import '../../theme/money.dart';
import 'cubit/petty_cash_cubit.dart';
import 'widgets/request_widgets.dart';
import 'withdrawal_form.dart';

/// A float's detail: its transactions, and a FAB to raise a withdrawal.
class PettyCashFloatScreen extends StatefulWidget {
  const PettyCashFloatScreen({super.key, required this.float});

  final PettyCashFloat float;

  @override
  State<PettyCashFloatScreen> createState() => _PettyCashFloatScreenState();
}

class _PettyCashFloatScreenState extends State<PettyCashFloatScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<PettyCashCubit>().loadTxns(widget.float.id);
    });
  }

  Future<void> _newWithdrawal() async {
    final cubit = context.read<PettyCashCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final message = await Navigator.of(context).push<String>(
      MaterialPageRoute(
        builder: (_) => BlocProvider.value(
          value: cubit,
          child: WithdrawalForm(float: widget.float),
        ),
      ),
    );
    if (message != null) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final f = widget.float;
    return Scaffold(
      appBar: AppBar(title: Text('${f.currency} petty cash')),
      floatingActionButton: f.locked
          ? null
          : FloatingActionButton.extended(
              onPressed: _newWithdrawal,
              icon: const Icon(Icons.remove_circle_outline),
              label: const Text('Withdraw'),
            ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Float', style: Theme.of(context).textTheme.titleMedium),
                Text(
                  Money.format(f.floatAmount, currency: f.currency),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
          ),
          if (f.locked)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('This float is locked for reconciliation.'),
              ),
            ),
          const Divider(),
          Expanded(
            child: BlocBuilder<PettyCashCubit, PettyCashState>(
              buildWhen: (a, b) => a.txns != b.txns || a.txnsLoading != b.txnsLoading,
              builder: (context, state) {
                if (state.txnsLoading && state.txns.isEmpty) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (state.txns.isEmpty) {
                  return const Center(child: Text('No transactions yet'));
                }
                return RefreshIndicator(
                  onRefresh: () => context.read<PettyCashCubit>().loadTxns(f.id),
                  child: ListView.builder(
                    itemCount: state.txns.length,
                    itemBuilder: (context, i) => _TxnTile(txn: state.txns[i]),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _TxnTile extends StatelessWidget {
  const _TxnTile({required this.txn});

  final PettyCashTxn txn;

  @override
  Widget build(BuildContext context) {
    final isOut = txn.type == 'WITHDRAWAL' || txn.type == 'CONVERSION_OUT';
    return ListTile(
      leading: Icon(
        isOut ? Icons.arrow_upward : Icons.arrow_downward,
        color: isOut ? Theme.of(context).colorScheme.error : null,
      ),
      title: Text(txn.purpose?.isNotEmpty == true ? txn.purpose! : txn.typeLabel),
      subtitle: Row(
        children: [
          Text(txn.typeLabel),
          const SizedBox(width: 8),
          StatusChip(status: txn.status),
          if (txn.receiptKey != null) ...[
            const SizedBox(width: 8),
            const Icon(Icons.receipt_long, size: 14),
          ],
        ],
      ),
      trailing: Text(
        '${isOut ? '-' : '+'}${Money.format(txn.amount, currency: txn.currency)}',
        style: Theme.of(context).textTheme.titleSmall,
      ),
    );
  }
}
