import 'package:bloc/bloc.dart';

import '../../../api/api_exception.dart';
import '../data/projects_repository.dart';
import 'portfolio_state.dart';

/// Loads the projects portfolio (roll-up per project). Pull-to-refresh re-loads.
class PortfolioCubit extends Cubit<PortfolioState> {
  PortfolioCubit(this._repo) : super(const PortfolioState());

  final ProjectsRepository _repo;

  Future<void> load() async {
    emit(state.copyWith(loading: true, clearError: true));
    try {
      emit(PortfolioState(items: await _repo.portfolio()));
    } on ApiException catch (e) {
      emit(state.copyWith(loading: false, error: e.message));
    }
  }
}
