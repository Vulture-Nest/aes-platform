import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aes_app/src/app.dart';
import 'package:aes_app/src/config/flavor_config.dart';
import 'package:aes_app/src/features/home/home_screen.dart';

void main() {
  testWidgets('renders the home scaffold with the active flavor', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [flavorProvider.overrideWithValue(FlavorConfig.dev)],
        child: const AesApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('AES Platform'), findsOneWidget);
    expect(find.textContaining('flavor: dev'), findsOneWidget);
  });
}
