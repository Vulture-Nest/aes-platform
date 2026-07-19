import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../data/health_repository.dart';

/// State for the API health probe on the home screen.
sealed class HealthState extends Equatable {
  const HealthState();

  @override
  List<Object?> get props => [];
}

class HealthInitial extends HealthState {
  const HealthInitial();
}

class HealthLoading extends HealthState {
  const HealthLoading();
}

class HealthOnline extends HealthState {
  const HealthOnline();
}

class HealthOffline extends HealthState {
  const HealthOffline(this.message);

  final String message;

  @override
  List<Object?> get props => [message];
}

/// Cubit driving the home screen's API-health indicator. Demonstrates the
/// repository → cubit → BlocBuilder pattern used across the app.
class HealthCubit extends Cubit<HealthState> {
  HealthCubit(this._repository) : super(const HealthInitial());

  final HealthRepository _repository;

  Future<void> check() async {
    emit(const HealthLoading());
    try {
      final ok = await _repository.isHealthy();
      emit(ok ? const HealthOnline() : const HealthOffline('API reported unhealthy'));
    } catch (error) {
      emit(HealthOffline(error.toString()));
    }
  }
}
