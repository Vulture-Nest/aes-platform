import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';

import '../../../api/api_exception.dart';
import '../../../data/auth_repository.dart';
import '../../../data/token_store.dart';
import '../../../models/auth_user.dart';

/// Session state for the whole app. The router redirects on these.
sealed class AuthState extends Equatable {
  const AuthState();

  @override
  List<Object?> get props => [];
}

/// Startup: we don't yet know whether a stored session is valid.
class AuthUnknown extends AuthState {
  const AuthUnknown();
}

/// A login/refresh attempt is in flight.
class AuthAuthenticating extends AuthState {
  const AuthAuthenticating();
}

class AuthAuthenticated extends AuthState {
  const AuthAuthenticated(this.user);

  final AuthUser user;

  @override
  List<Object?> get props => [user];
}

class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated({this.error});

  final String? error;

  @override
  List<Object?> get props => [error];
}

/// Drives sign-in, session restore and sign-out. Tokens live in [TokenStore];
/// user + roles are always fetched fresh from the API so RBAC is never stale.
class AuthCubit extends Cubit<AuthState> {
  AuthCubit({required AuthRepository authRepository, required TokenStore tokenStore})
      : _auth = authRepository,
        _tokens = tokenStore,
        super(const AuthUnknown());

  final AuthRepository _auth;
  final TokenStore _tokens;

  /// On launch: if a token pair is stored, validate it by loading the user;
  /// otherwise go straight to the login screen.
  Future<void> bootstrap() async {
    final stored = await _tokens.read();
    if (stored == null) {
      emit(const AuthUnauthenticated());
      return;
    }
    try {
      final user = await _auth.me();
      emit(AuthAuthenticated(user));
    } on ApiException {
      // Expired/invalid stored session (the interceptor already tried to refresh).
      await _tokens.clear();
      emit(const AuthUnauthenticated());
    }
  }

  Future<void> login(String email, String password) async {
    emit(const AuthAuthenticating());
    try {
      final pair = await _auth.login(email.trim(), password);
      await _tokens.write(pair);
      final user = await _auth.me();
      emit(AuthAuthenticated(user));
    } on ApiException catch (error) {
      await _tokens.clear();
      emit(AuthUnauthenticated(error: error.message));
    }
  }

  Future<void> logout() async {
    final stored = await _tokens.read();
    if (stored != null) {
      await _auth.logout(stored.refreshToken);
    }
    await _tokens.clear();
    emit(const AuthUnauthenticated());
  }

  /// Called by the API client when a token refresh ultimately fails mid-session.
  void sessionExpired() {
    if (state is! AuthUnauthenticated) {
      emit(const AuthUnauthenticated(error: 'Your session has expired. Please sign in again.'));
    }
  }
}
