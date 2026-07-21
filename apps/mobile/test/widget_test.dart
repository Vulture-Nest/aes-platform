import 'package:aes_mobile/src/data/token_store.dart';
import 'package:aes_mobile/src/features/auth/cubit/auth_cubit.dart';
import 'package:aes_mobile/src/features/auth/login_screen.dart';
import 'package:aes_mobile/src/features/home/cubit/dashboard_cubit.dart';
import 'package:aes_mobile/src/features/home/home_screen.dart';
import 'package:aes_mobile/src/models/token_pair.dart';
import 'package:aes_mobile/src/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  group('LoginScreen', () {
    testWidgets('renders the form and validates the email field', (tester) async {
      final cubit = AuthCubit(
        authRepository: FakeAuthRepository(),
        tokenStore: InMemoryTokenStore(),
      );
      addTearDown(cubit.close);

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: BlocProvider.value(value: cubit, child: const LoginScreen()),
        ),
      );

      expect(find.text('Sign in'), findsOneWidget);
      expect(find.byType(TextFormField), findsNWidgets(2));

      // Tapping sign-in with empty fields surfaces validation, not a login call.
      await tester.tap(find.text('Sign in'));
      await tester.pump();
      expect(find.text('Enter a valid email'), findsOneWidget);
    });

    testWidgets('a valid submission calls login', (tester) async {
      final repo = FakeAuthRepository();
      final cubit = AuthCubit(authRepository: repo, tokenStore: InMemoryTokenStore());
      addTearDown(cubit.close);

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: BlocProvider.value(value: cubit, child: const LoginScreen()),
        ),
      );

      await tester.enterText(find.byType(TextFormField).at(0), 'fd@aes.local');
      await tester.enterText(find.byType(TextFormField).at(1), 'secret');
      await tester.tap(find.text('Sign in'));
      await tester.pump();

      expect(repo.loginCalls, 1);
    });
  });

  group('HomeScreen', () {
    Future<void> pumpHome(
      WidgetTester tester, {
      required AuthCubit auth,
      required DashboardCubit dashboard,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: MultiBlocProvider(
            providers: [
              BlocProvider.value(value: auth),
              BlocProvider.value(value: dashboard),
            ],
            child: const HomeScreen(),
          ),
        ),
      );
    }

    testWidgets('shows role-appropriate tiles and the danger banner', (tester) async {
      final store = InMemoryTokenStore();
      await store.write(const TokenPair(accessToken: 'at', refreshToken: 'rt'));
      final auth = AuthCubit(authRepository: FakeAuthRepository(), tokenStore: store);
      await auth.bootstrap(); // -> Authenticated(financeDirector)
      addTearDown(auth.close);

      final dashboard = DashboardCubit(
        FakeAlertsRepository(alerts: [dangerAlert('Cash runway is negative')]),
      );
      addTearDown(dashboard.close);

      await pumpHome(tester, auth: auth, dashboard: dashboard);
      await tester.pump(); // let the post-frame load() + banner settle

      // A finance director sees the command-centre tile...
      expect(find.text('Command Centre'), findsOneWidget);
      // ...and the danger banner renders the active alert.
      expect(find.text('Cash runway is negative'), findsOneWidget);
    });

    testWidgets('hides finance-only tiles from a site clerk', (tester) async {
      final store = InMemoryTokenStore();
      await store.write(const TokenPair(accessToken: 'at', refreshToken: 'rt'));
      final auth = AuthCubit(
        authRepository: FakeAuthRepository(user: siteClerk),
        tokenStore: store,
      );
      await auth.bootstrap(); // -> Authenticated(siteClerk)
      addTearDown(auth.close);

      final dashboard = DashboardCubit(FakeAlertsRepository());
      addTearDown(dashboard.close);

      await pumpHome(tester, auth: auth, dashboard: dashboard);
      await tester.pump();

      expect(find.text('Requests'), findsOneWidget); // clerks can raise requests
      expect(find.text('Command Centre'), findsNothing); // but not the command centre
    });
  });
}
