import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../api/api_exception.dart';
import '../../../data/orders_repository.dart';
import '../../../models/order.dart';

class OrdersState extends Equatable {
  const OrdersState({
    this.loading = false,
    this.orders = const [],
    this.clientNames = const {},
    this.error,
    this.busyId,
  });

  final bool loading;
  final List<Order> orders;
  final Map<String, String> clientNames;
  final String? error;
  final String? busyId;

  OrdersState copyWith({
    bool? loading,
    List<Order>? orders,
    Map<String, String>? clientNames,
    String? error,
    String? busyId,
    bool clearError = false,
    bool clearBusy = false,
  }) {
    return OrdersState(
      loading: loading ?? this.loading,
      orders: orders ?? this.orders,
      clientNames: clientNames ?? this.clientNames,
      error: clearError ? null : (error ?? this.error),
      busyId: clearBusy ? null : (busyId ?? this.busyId),
    );
  }

  /// Orders grouped for the board, in board order (attention first).
  List<Order> get sorted {
    const rank = {
      OrderStatus.overdue: 0,
      OrderStatus.awaiting: 1,
      OrderStatus.open: 2,
      OrderStatus.serviced: 3,
      OrderStatus.paid: 4,
    };
    final copy = [...orders];
    copy.sort((a, b) => (rank[a.status] ?? 9).compareTo(rank[b.status] ?? 9));
    return copy;
  }

  @override
  List<Object?> get props => [loading, orders, clientNames, error, busyId];
}

/// Loads the order board (with client names) and marks orders serviced.
class OrdersCubit extends Cubit<OrdersState> {
  OrdersCubit(this._repo) : super(const OrdersState());

  final OrdersRepository _repo;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      final orders = await _repo.list();
      final names = await _repo.clientNames();
      emit(OrdersState(orders: orders, clientNames: names));
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }

  Future<String?> markServiced(String id) async {
    emit(state.copyWith(busyId: id, clearError: true));
    try {
      await _repo.markServiced(id);
      final updated = await _repo.findOne(id);
      emit(
        state.copyWith(
          orders: state.orders.map((o) => o.id == id ? updated : o).toList(),
          clearBusy: true,
        ),
      );
      return null;
    } on ApiException catch (e) {
      emit(state.copyWith(error: e.message, clearBusy: true));
      return e.message;
    }
  }
}
