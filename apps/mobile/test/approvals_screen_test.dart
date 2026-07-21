import 'package:aes_mobile/src/features/approvals/approvals_screen.dart';
import 'package:aes_mobile/src/features/approvals/cubit/approvals_cubit.dart';
import 'package:aes_mobile/src/services/biometric_authenticator.dart';
import 'package:aes_mobile/src/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  Future<void> pump(
    WidgetTester tester,
    FakeApprovalsRepository repo, {
    BiometricAuthenticator? bio,
  }) async {
    final cubit = ApprovalsCubit(
      repository: repo,
      biometric: bio ?? const AlwaysConfirmAuthenticator(),
    );
    addTearDown(cubit.close);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: BlocProvider.value(value: cubit, child: const ApprovalsScreen()),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('renders a money item with amount and biometric hint', (tester) async {
    await pump(tester, FakeApprovalsRepository(items: [moneyApproval(amount: 500)]));

    expect(find.text('Requisition'), findsOneWidget);
    expect(find.text('USD 500.00'), findsOneWidget);
    expect(find.text('Biometric confirm'), findsOneWidget);
  });

  testWidgets('shows an empty state when nothing is pending', (tester) async {
    await pump(tester, FakeApprovalsRepository());
    expect(find.text('No approvals waiting'), findsOneWidget);
  });

  testWidgets('approving a money item through the sheet records the decision', (tester) async {
    final repo = FakeApprovalsRepository(items: [moneyApproval()]);
    await pump(tester, repo);

    await tester.tap(find.byType(ListTile).first);
    await tester.pumpAndSettle(); // open the sheet
    expect(find.text('Approve'), findsOneWidget); // sheet is up

    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle(); // biometric (auto-confirm) + decide + close sheet

    expect(repo.decisions.length, 1);
    expect(find.text('No approvals waiting'), findsOneWidget); // inbox now empty
  });
}
