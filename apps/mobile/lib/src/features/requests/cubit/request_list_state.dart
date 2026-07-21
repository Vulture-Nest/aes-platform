import 'package:equatable/equatable.dart';

/// Shared list state for the request tabs (requisitions, travel).
class RequestListState<T> extends Equatable {
  const RequestListState({this.loading = false, this.items = const [], this.error});

  final bool loading;
  final List<T> items;
  final String? error;

  RequestListState<T> copyWith({bool? loading, List<T>? items, String? error, bool clearError = false}) {
    return RequestListState<T>(
      loading: loading ?? this.loading,
      items: items ?? this.items,
      error: clearError ? null : (error ?? this.error),
    );
  }

  @override
  List<Object?> get props => [loading, items, error];
}
