import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/order.dart';
import '../../theme/app_theme.dart';
import '../../theme/money.dart';
import '../../widgets/ui_kit.dart';
import 'cubit/orders_cubit.dart';

Color orderColor(OrderStatus s) => switch (s) {
      OrderStatus.paid || OrderStatus.serviced => AppTheme.greenDark,
      OrderStatus.awaiting => Colors.blue,
      OrderStatus.overdue => AppTheme.danger,
      OrderStatus.open => AppTheme.watch,
    };

/// Order health board — orders colour-coded by status, attention first, with a
/// detail sheet and mark-serviced action.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<OrdersCubit>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: gradientAppBar('Order health'),
      body: BlocBuilder<OrdersCubit, OrdersState>(
        builder: (context, state) {
          if (state.loading && state.orders.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.orders.isEmpty) {
            return EmptyState(
              icon: state.error != null ? Icons.cloud_off : Icons.local_shipping_outlined,
              message: state.error ?? 'No orders yet',
              isError: state.error != null,
            );
          }
          final orders = state.sorted;
          return RefreshIndicator(
            onRefresh: () => context.read<OrdersCubit>().load(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
              children: [
                _Summary(orders: state.orders),
                const SectionLabel('Orders', padding: EdgeInsets.fromLTRB(8, 16, 8, 8)),
                for (final o in orders)
                  _OrderCard(
                    order: o,
                    client: state.clientNames[o.clientId],
                    onTap: () => _openDetail(context, o, state.clientNames[o.clientId]),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _openDetail(BuildContext context, Order order, String? client) async {
    final cubit = context.read<OrdersCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final serviced = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: _OrderDetailSheet(order: order, client: client),
      ),
    );
    if (serviced == true) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Order marked serviced')));
    }
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.orders});
  final List<Order> orders;

  @override
  Widget build(BuildContext context) {
    final overdue = orders.where((o) => o.status == OrderStatus.overdue).length;
    final open = orders.where((o) => o.status == OrderStatus.open).length;
    final serviced =
        orders.where((o) => o.status == OrderStatus.serviced || o.status == OrderStatus.paid).length;
    return Row(
      children: [
        _stat('Overdue', overdue, AppTheme.danger),
        _stat('Open', open, AppTheme.watch),
        _stat('Serviced', serviced, AppTheme.greenDark),
      ],
    );
  }

  Widget _stat(String label, int count, Color color) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: Column(
              children: [
                Text('$count', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: color)),
                const SizedBox(height: 2),
                Text(label, style: const TextStyle(fontSize: 12)),
              ],
            ),
          ),
        ),
      );
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.client, required this.onTap});
  final Order order;
  final String? client;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = orderColor(order.status);
    return Card(
      child: ListTile(
        onTap: onTap,
        leading: Container(width: 5, height: 44, color: color),
        contentPadding: const EdgeInsets.only(left: 0, right: 12),
        title: Padding(
          padding: const EdgeInsets.only(left: 12),
          child: Text(order.reference, style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(left: 12, top: 4),
          child: Row(
            children: [
              if (client != null && client!.isNotEmpty)
                Flexible(child: Text(client!, overflow: TextOverflow.ellipsis)),
              if (client != null && client!.isNotEmpty) const SizedBox(width: 8),
              StatusPill(label: order.status.label, color: color),
            ],
          ),
        ),
        trailing: Text(
          Money.format(order.valueExVat, currency: order.currency),
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

class _OrderDetailSheet extends StatefulWidget {
  const _OrderDetailSheet({required this.order, required this.client});
  final Order order;
  final String? client;

  @override
  State<_OrderDetailSheet> createState() => _OrderDetailSheetState();
}

class _OrderDetailSheetState extends State<_OrderDetailSheet> {
  bool _busy = false;

  Future<void> _markServiced() async {
    setState(() => _busy = true);
    final error = await context.read<OrdersCubit>().markServiced(widget.order.id);
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.order;
    final color = orderColor(o.status);
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(o.reference, style: Theme.of(context).textTheme.titleLarge),
              ),
              StatusPill(label: o.status.label, color: color),
            ],
          ),
          if (widget.client != null && widget.client!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(widget.client!, style: Theme.of(context).textTheme.bodyMedium),
          ],
          const SizedBox(height: 16),
          _row('Value (ex VAT)', Money.format(o.valueExVat, currency: o.currency)),
          if (o.receivedTotal != null)
            _row('Received', Money.format(o.receivedTotal, currency: o.currency)),
          _row('Serviced', o.serviced ? 'Yes' : 'No'),
          if (o.closingDate != null)
            _row('Closing date', o.closingDate!.toIso8601String().substring(0, 10)),
          if (!o.serviced) ...[
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: _busy ? null : _markServiced,
              icon: _busy
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.check_circle_outline),
              label: const Text('Mark serviced'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: Theme.of(context).textTheme.bodyMedium),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
      );
}
