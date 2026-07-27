import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/board.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui_kit.dart';
import 'board_detail_screen.dart';
import 'cubit/board_detail_cubit.dart';
import 'cubit/boards_list_cubit.dart';
import 'data/boards_repository.dart';

/// Board list — each board with a visibility chip (TEAM vs a red
/// DIRECTOR-CONFIDENTIAL chip). Confidential boards are only present when the
/// API returns them (directors); the app never filters client-side.
class BoardsScreen extends StatefulWidget {
  const BoardsScreen({super.key});

  @override
  State<BoardsScreen> createState() => _BoardsScreenState();
}

class _BoardsScreenState extends State<BoardsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<BoardsListCubit>().load();
    });
  }

  Future<void> _openBoard(Board board) async {
    final repo = context.read<BoardsRepository>();
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => BlocProvider(
          create: (_) => BoardDetailCubit(repo, board.id)..load(),
          child: BoardDetailScreen(boardName: board.name),
        ),
      ),
    );
  }

  Future<void> _createBoard() async {
    final cubit = context.read<BoardsListCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: const _CreateBoardSheet(),
      ),
    );
    if (created == true) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Board created')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: gradientAppBar('Boards'),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createBoard,
        icon: const Icon(Icons.add),
        label: const Text('New board'),
      ),
      body: BlocBuilder<BoardsListCubit, BoardsListState>(
        builder: (context, state) {
          if (state.loading && state.boards.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }
          if (state.boards.isEmpty) {
            return EmptyState(
              icon: state.error != null ? Icons.cloud_off : Icons.dashboard_outlined,
              message: state.error ?? 'No boards yet — tap + to create one',
              isError: state.error != null,
            );
          }
          return RefreshIndicator(
            onRefresh: () => context.read<BoardsListCubit>().load(),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
              children: [
                for (final b in state.boards)
                  _BoardCard(board: b, onTap: () => _openBoard(b)),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _BoardCard extends StatelessWidget {
  const _BoardCard({required this.board, required this.onTap});
  final Board board;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        onTap: onTap,
        leading: const IconBadge(Icons.dashboard_customize_outlined),
        title: Text(
          board.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Align(
            alignment: Alignment.centerLeft,
            child: VisibilityChip(visibility: board.visibility),
          ),
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

/// A chip for board visibility — a neutral "Team" chip, or a prominent red
/// "Director-confidential" chip for confidential boards.
class VisibilityChip extends StatelessWidget {
  const VisibilityChip({super.key, required this.visibility});
  final BoardVisibility visibility;

  @override
  Widget build(BuildContext context) {
    if (visibility.isConfidential) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.lock_outline, size: 14, color: AppTheme.danger),
          const SizedBox(width: 4),
          StatusPill(label: visibility.label.toUpperCase(), color: AppTheme.danger),
        ],
      );
    }
    return StatusPill(label: visibility.label, color: AppTheme.greenDark);
  }
}

/// Bottom sheet to create a board (name + visibility).
class _CreateBoardSheet extends StatefulWidget {
  const _CreateBoardSheet();

  @override
  State<_CreateBoardSheet> createState() => _CreateBoardSheetState();
}

class _CreateBoardSheetState extends State<_CreateBoardSheet> {
  final _controller = TextEditingController();
  BoardVisibility _visibility = BoardVisibility.team;
  bool _busy = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _controller.text.trim();
    if (name.isEmpty) return;
    setState(() => _busy = true);
    final error =
        await context.read<BoardsListCubit>().createBoard(name, _visibility);
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('New board', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Board name'),
            onSubmitted: (_) => _busy ? null : _submit(),
          ),
          const SizedBox(height: 16),
          Text('Visibility', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 8),
          SegmentedButton<BoardVisibility>(
            segments: const [
              ButtonSegment(
                value: BoardVisibility.team,
                label: Text('Team'),
                icon: Icon(Icons.groups_outlined),
              ),
              ButtonSegment(
                value: BoardVisibility.directorConfidential,
                label: Text('Confidential'),
                icon: Icon(Icons.lock_outline),
              ),
            ],
            selected: {_visibility},
            onSelectionChanged: (s) => setState(() => _visibility = s.first),
          ),
          if (_visibility.isConfidential) ...[
            const SizedBox(height: 10),
            Text(
              'Confidential boards are director-only. Only directors can create them.',
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(color: AppTheme.danger),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _busy ? null : _submit,
            icon: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check),
            label: const Text('Create board'),
          ),
        ],
      ),
    );
  }
}
