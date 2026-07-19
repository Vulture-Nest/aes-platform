import 'package:flutter/material.dart';

import 'router/app_router.dart';

/// Root widget. USD/ZWG formatting and Africa/Harare localisation are wired in the
/// S7 Flutter stage; here we establish the router + theme shell.
class AesApp extends StatelessWidget {
  const AesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'AES Platform',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0B6E4F)),
        useMaterial3: true,
      ),
      routerConfig: appRouter,
    );
  }
}
