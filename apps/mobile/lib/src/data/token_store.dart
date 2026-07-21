import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/token_pair.dart';

/// Persists the auth token pair. Abstracted so cubits/interceptors depend on the
/// interface (the widget/unit tests substitute an in-memory implementation).
abstract class TokenStore {
  Future<TokenPair?> read();
  Future<void> write(TokenPair tokens);
  Future<void> clear();
}

/// Production store backed by the platform keychain / keystore. Tokens are
/// sensitive credentials and never touch shared preferences or logs.
class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _kAccess = 'aes.access_token';
  static const _kRefresh = 'aes.refresh_token';

  @override
  Future<TokenPair?> read() async {
    final access = await _storage.read(key: _kAccess);
    final refresh = await _storage.read(key: _kRefresh);
    if (access == null || refresh == null) {
      return null;
    }
    return TokenPair(accessToken: access, refreshToken: refresh);
  }

  @override
  Future<void> write(TokenPair tokens) async {
    await _storage.write(key: _kAccess, value: tokens.accessToken);
    await _storage.write(key: _kRefresh, value: tokens.refreshToken);
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
  }
}

/// In-memory store for tests and (optionally) ephemeral sessions.
class InMemoryTokenStore implements TokenStore {
  TokenPair? _tokens;

  @override
  Future<TokenPair?> read() async => _tokens;

  @override
  Future<void> write(TokenPair tokens) async => _tokens = tokens;

  @override
  Future<void> clear() async => _tokens = null;
}
