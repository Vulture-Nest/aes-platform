import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/board_detail.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui_kit.dart';
import 'boards_screen.dart' show VisibilityChip;
import 'card_detail_sheet.dart';
import 'cubit/board_detail_cubit.dart';

/// A board's lists rendered as horizontally-scrollable columns, each with its
/// cards. Supports creating lists, creating cards, and opening a card's detail.
class BoardDetailScreen extends StatelessWidget {
  const BoardDetailScreen({super.key, required this.boardName});

  final String boardName;

  Future<void> _createList(BuildContext context) async {
    final cubit = context.read<BoardDetailCubit>();
    final name = await _promptText(
      context,
      title: 'New list',
      label: 'List name',
      action: 'Add list',
    );
    if (name == null) return;
    final error = await cubit.createList(name);
    if (error != null && context.mounted) _snack(context, error);
  }

  Future<void> _createCard(BuildContext context, String listId) async {
    final cubit = context.read<BoardDetailCubit>();
    final title = await _promptText(
      context,
      title: 'New card',
      label: 'Card title',
      action: 'Add card',
    );
    if (title == null) return;
    final error = await cubit.createCard(listId, title);
    if (error != null && context.mounted) _snack(context, error);
  }

  void _openCard(BuildContext context, BoardCard card) {
    final cubit = context.read<BoardDetailCubit>();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: CardDetailSheet(cardId: card.id),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: gradientAppBar(
        boardName,
        actions: [
          IconButton(
            tooltip: 'Add list',
            onPressed: () => _createList(context),
            icon: const Icon(Icons.playlist_add),
          ),
        ],
      ),
      body: BlocBuilder<BoardDetailCubit, BoardDetailState>(
        builder: (context, state) {
          final board = state.board;
          if (state.loading && board == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (board == null) {
            return EmptyState(
              icon: state.error != null ? Icons.cloud_off : Icons.dashboard_outlined,
              message: state.error ?? 'Board unavailable',
              isError: state.error != null,
            );
          }
          return RefreshIndicator(
            onRefresh: () => context.read<BoardDetailCubit>().load(),
            child: ListView(
              // A single scrollable child so pull-to-refresh works; the columns
              // scroll horizontally within it.
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: VisibilityChip(visibility: board.visibility),
                ),
                SizedBox(
                  height: MediaQuery.of(context).size.height * 0.68,
                  child: board.lists.isEmpty
                      ? _EmptyBoard(onAddList: () => _createList(context))
                      : ListView(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                          children: [
                            for (final list in board.lists)
                              _ListColumn(
                                list: list,
                                onAddCard: () => _createCard(context, list.id),
                                onOpenCard: (c) => _openCard(context, c),
                              ),
                          ],
                        ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _EmptyBoard extends StatelessWidget {
  const _EmptyBoard({required this.onAddList});
  final VoidCallback onAddList;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.view_column_outlined,
            size: 52,
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.45),
          ),
          const SizedBox(height: 14),
          const Text('No lists yet'),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: onAddList,
            icon: const Icon(Icons.playlist_add),
            label: const Text('Add a list'),
          ),
        ],
      ),
    );
  }
}

class _ListColumn extends StatelessWidget {
  const _ListColumn({
    required this.list,
    required this.onAddCard,
    required this.onOpenCard,
  });

  final BoardList list;
  final VoidCallback onAddCard;
  final void Function(BoardCard card) onOpenCard;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 280,
      margin: const EdgeInsets.only(right: 12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.08),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    list.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(
                  '${list.cards.length}',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55),
                      ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              children: [
                for (final card in list.cards)
                  _CardTile(card: card, onTap: () => onOpenCard(card)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 8, 10),
            child: TextButton.icon(
              onPressed: onAddCard,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add card'),
            ),
          ),
        ],
      ),
    );
  }
}

class _CardTile extends StatelessWidget {
  const _CardTile({required this.card, required this.onTap});
  final BoardCard card;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final subtle = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55);
    final hasMeta = card.dueLabel != null ||
        card.assigneeId != null ||
        card.checklistItems.isNotEmpty ||
        card.comments.isNotEmpty;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(card.title, style: const TextStyle(fontWeight: FontWeight.w600)),
              if (hasMeta) ...[
                const SizedBox(height: 8),
                Wrap(
                  spacing: 10,
                  runSpacing: 4,
                  children: [
                    if (card.dueLabel != null)
                      _MetaChip(
                        icon: Icons.event_outlined,
                        label: card.dueLabel!,
                        color: card.dueDate!.isBefore(DateTime.now())
                            ? AppTheme.danger
                            : subtle,
                      ),
                    if (card.assigneeId != null)
                      _MetaChip(icon: Icons.person_outline, label: 'Assigned', color: subtle),
                    if (card.checklistItems.isNotEmpty)
                      _MetaChip(
                        icon: Icons.check_box_outlined,
                        label: '${card.doneCount}/${card.checklistItems.length}',
                        color: subtle,
                      ),
                    if (card.comments.isNotEmpty)
                      _MetaChip(
                        icon: Icons.chat_bubble_outline,
                        label: '${card.comments.length}',
                        color: subtle,
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label, required this.color});
  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 3),
        Text(label, style: TextStyle(fontSize: 12, color: color)),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// A small single-field prompt dialog; returns the trimmed text or null.
Future<String?> _promptText(
  BuildContext context, {
  required String title,
  required String label,
  required String action,
}) {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
        autofocus: true,
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(labelText: label),
        onSubmitted: (v) {
          if (v.trim().isNotEmpty) Navigator.of(ctx).pop(v.trim());
        },
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            final v = controller.text.trim();
            if (v.isNotEmpty) Navigator.of(ctx).pop(v);
          },
          child: Text(action),
        ),
      ],
    ),
  );
}
