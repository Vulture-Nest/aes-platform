import 'package:aes_mobile/src/features/requests/cubit/petty_cash_cubit.dart';
import 'package:aes_mobile/src/features/requests/cubit/requisitions_cubit.dart';
import 'package:aes_mobile/src/features/requests/cubit/travel_cubit.dart';
import 'package:aes_mobile/src/features/requests/requests_screen.dart';
import 'package:aes_mobile/src/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  Future<void> pump(
    WidgetTester tester, {
    FakeRequisitionsRepository? reqRepo,
    FakeTravelRepository? travelRepo,
    FakePettyCashRepository? pettyRepo,
  }) async {
    final requisitions = RequisitionsCubit(
      repository: reqRepo ?? FakeRequisitionsRepository(),
      attachments: FakeAttachmentsRepository(),
    );
    final travel = TravelCubit(travelRepo ?? FakeTravelRepository());
    final pettyCash = PettyCashCubit(
      repository: pettyRepo ?? FakePettyCashRepository(),
      attachments: FakeAttachmentsRepository(),
    );
    addTearDown(requisitions.close);
    addTearDown(travel.close);
    addTearDown(pettyCash.close);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: MultiBlocProvider(
          providers: [
            BlocProvider.value(value: requisitions),
            BlocProvider.value(value: travel),
            BlocProvider.value(value: pettyCash),
          ],
          child: const RequestsScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('shows tabs and a requisition with its status chip', (tester) async {
    await pump(tester, reqRepo: FakeRequisitionsRepository(items: [draftRequisition()]));

    expect(find.text('Requisitions'), findsOneWidget);
    expect(find.text('Travel'), findsOneWidget);
    expect(find.text('Fuel top-up'), findsOneWidget);
    expect(find.text('Draft'), findsWidgets); // status chip
    expect(find.text('New requisition'), findsOneWidget); // FAB label on the first tab
  });

  testWidgets('opening a draft shows the timeline and a submit action', (tester) async {
    final repo = FakeRequisitionsRepository(items: [draftRequisition(id: 'r7')]);
    await pump(tester, reqRepo: repo);

    await tester.tap(find.byType(ListTile).first);
    await tester.pumpAndSettle();

    expect(find.text('Progress'), findsOneWidget);
    expect(find.text('Submit for approval'), findsOneWidget);

    await tester.tap(find.text('Submit for approval'));
    await tester.pumpAndSettle();

    expect(repo.submitted, ['r7']);
  });

  testWidgets('empty state invites raising a request', (tester) async {
    await pump(tester);
    expect(find.textContaining('No requests yet'), findsOneWidget);
  });

  testWidgets('petty cash tab lists floats and hides the hub FAB', (tester) async {
    await pump(tester, pettyRepo: FakePettyCashRepository(floatList: [usdFloat()]));

    await tester.tap(find.text('Petty Cash'));
    await tester.pumpAndSettle();

    expect(find.text('USD float'), findsOneWidget);
    // The create FAB is only for requisitions/travel, not petty cash.
    expect(find.byType(FloatingActionButton), findsNothing);
  });
}
