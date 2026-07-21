import 'package:aes_mobile/src/data/token_store.dart';
import 'package:aes_mobile/src/features/auth/cubit/auth_cubit.dart';
import 'package:aes_mobile/src/models/token_pair.dart';
import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  AuthCubit build({FakeAuthRepository? repo, TokenStore? store}) => AuthCubit(
        authRepository: repo ?? FakeAuthRepository(),
        tokenStore: store ?? InMemoryTokenStore(),
      );

  group('AuthCubit.login', () {
    blocTest<AuthCubit, AuthState>(
      'emits [Authenticating, Authenticated] and stores tokens on success',
      build: build,
      act: (cubit) => cubit.login('fd@aes.local', 'secret'),
      expect: () => [
        const AuthAuthenticating(),
        const AuthAuthenticated(financeDirector),
      ],
    );

    blocTest<AuthCubit, AuthState>(
      'emits [Authenticating, Unauthenticated(error)] on bad credentials',
      build: () => build(repo: FakeAuthRepository(failLogin: true)),
      act: (cubit) => cubit.login('fd@aes.local', 'wrong'),
      expect: () => [
        const AuthAuthenticating(),
        const AuthUnauthenticated(error: 'Invalid email or password'),
      ],
    );
  });

  group('AuthCubit.bootstrap', () {
    blocTest<AuthCubit, AuthState>(
      'goes straight to Unauthenticated when no token is stored',
      build: build,
      act: (cubit) => cubit.bootstrap(),
      expect: () => [const AuthUnauthenticated()],
    );

    blocTest<AuthCubit, AuthState>(
      'restores the session to Authenticated when a token is stored',
      build: () {
        final store = InMemoryTokenStore();
        store.write(const TokenPair(accessToken: 'at', refreshToken: 'rt'));
        return build(store: store);
      },
      act: (cubit) => cubit.bootstrap(),
      expect: () => [const AuthAuthenticated(financeDirector)],
    );
  });

  test('login persists the token pair to the store', () async {
    final store = InMemoryTokenStore();
    final cubit = build(store: store);
    await cubit.login('fd@aes.local', 'secret');
    expect((await store.read())?.accessToken, 'at');
  });
}
