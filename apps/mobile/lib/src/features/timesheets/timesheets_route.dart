import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'cubit/timesheet_periods_cubit.dart';
import 'data/timesheet_draft_store.dart';
import 'data/timesheet_sync_service.dart';
import 'data/timesheets_repository.dart';
import 'timesheets_screen.dart';

/// Convenience builder for the `/timesheets` GoRoute so the router only needs a
/// [TimesheetsRepository] (constructed from the shared authed Dio, alongside the
/// other repositories in app.dart). It owns the offline draft store + sync service
/// for the whole feature so nothing else has to be wired into the DI tree.
///
/// Wiring (integration agent):
///   in app.dart — build `TimesheetsRepository(dio)` and provide it via
///   `RepositoryProvider<TimesheetsRepository>`;
///   in app_router.dart — add
///     `GoRoute(path: '/timesheets', name: 'timesheets',
///        builder: (context, _) =>
///          buildTimesheetsRoute(context.read<TimesheetsRepository>()))`.
class TimesheetsRoute extends StatefulWidget {
  const TimesheetsRoute({super.key, required this.repository});

  final TimesheetsRepository repository;

  @override
  State<TimesheetsRoute> createState() => _TimesheetsRouteState();
}

class _TimesheetsRouteState extends State<TimesheetsRoute> {
  late final TimesheetDraftStore _drafts = SqfliteTimesheetDraftStore();
  late final TimesheetSyncService _sync = TimesheetSyncService(
    store: _drafts,
    repository: widget.repository,
  )..start();

  @override
  void dispose() {
    _sync.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => TimesheetPeriodsCubit(widget.repository),
      child: TimesheetsScreen(
        repository: widget.repository,
        draftStore: _drafts,
        syncService: _sync,
      ),
    );
  }
}

/// Shorthand the router can call directly.
Widget buildTimesheetsRoute(TimesheetsRepository repository) =>
    TimesheetsRoute(repository: repository);
