import 'package:equatable/equatable.dart';

import '../../../models/project_portfolio_item.dart';

/// List state for the projects portfolio (loading / loaded / error).
class PortfolioState extends Equatable {
  const PortfolioState({this.loading = false, this.items = const [], this.error});

  final bool loading;
  final List<ProjectPortfolioItem> items;
  final String? error;

  PortfolioState copyWith({
    bool? loading,
    List<ProjectPortfolioItem>? items,
    String? error,
    bool clearError = false,
  }) {
    return PortfolioState(
      loading: loading ?? this.loading,
      items: items ?? this.items,
      error: clearError ? null : (error ?? this.error),
    );
  }

  @override
  List<Object?> get props => [loading, items, error];
}
