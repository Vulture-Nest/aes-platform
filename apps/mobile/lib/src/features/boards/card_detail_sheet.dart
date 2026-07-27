import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/board_detail.dart';
import '../../theme/app_theme.dart';
import 'cubit/board_detail_cubit.dart';

/// Card detail bottom sheet — description, checklist (with toggle + add) and
/// comments (list + add). Reads the live card from [BoardDetailCubit] so it
/// reflects mutations immediately after the board reloads.
class CardDetailSheet extends StatelessWidget {
  const CardDetailSheet({super.key, required this.cardId});

  final String cardId;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BoardDetailCubit, BoardDetailState>(
      builder: (context, state) {
        final card = state.cardById(cardId);
        if (card == null) {
          // Card was deleted or is no longer visible.
          return const Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: Text('Card unavailable')),
          );
        }
        return _CardBody(card: card);
      },
    );
  }
}

class _CardBody extends StatefulWidget {
  const _CardBody({required this.card});
  final BoardCard card;

  @override
  State<_CardBody> createState() => _CardBodyState();
}

class _CardBodyState extends State<_CardBody> {
  final _checklistController = TextEditingController();
  final _commentController = TextEditingController();
  bool _addingChecklist = false;
  bool _addingComment = false;

  @override
  void dispose() {
    _checklistController.dispose();
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _toggle(ChecklistItem item) async {
    final error =
        await context.read<BoardDetailCubit>().toggleChecklistItem(item.id, !item.done);
    if (error != null && mounted) _snack(error);
  }

  Future<void> _addChecklist() async {
    final text = _checklistController.text.trim();
    if (text.isEmpty) return;
    setState(() => _addingChecklist = true);
    final error =
        await context.read<BoardDetailCubit>().addChecklistItem(widget.card.id, text);
    if (!mounted) return;
    setState(() => _addingChecklist = false);
    if (error == null) {
      _checklistController.clear();
    } else {
      _snack(error);
    }
  }

  Future<void> _addComment() async {
    final body = _commentController.text.trim();
    if (body.isEmpty) return;
    setState(() => _addingComment = true);
    final error =
        await context.read<BoardDetailCubit>().addComment(widget.card.id, body);
    if (!mounted) return;
    setState(() => _addingComment = false);
    if (error == null) {
      _commentController.clear();
    } else {
      _snack(error);
    }
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final card = widget.card;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(card.title, style: text.titleLarge),
            const SizedBox(height: 10),
            Wrap(
              spacing: 16,
              runSpacing: 4,
              children: [
                if (card.dueLabel != null)
                  _meta(
                    Icons.event_outlined,
                    'Due ${card.dueLabel}',
                    overdue: card.dueDate!.isBefore(DateTime.now()),
                  ),
                if (card.assigneeId != null)
                  _meta(Icons.person_outline, 'Assigned'),
              ],
            ),
            if (card.description != null && card.description!.trim().isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('Description', style: text.titleSmall),
              const SizedBox(height: 4),
              Text(card.description!, style: text.bodyMedium),
            ],

            // ---- Checklist ----
            const Divider(height: 32),
            Row(
              children: [
                Text('Checklist', style: text.titleMedium),
                const Spacer(),
                if (card.checklistItems.isNotEmpty)
                  Text(
                    '${card.doneCount}/${card.checklistItems.length}',
                    style: text.labelMedium,
                  ),
              ],
            ),
            const SizedBox(height: 4),
            if (card.checklistItems.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text('No items yet', style: text.bodySmall),
              ),
            for (final item in card.checklistItems)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                controlAffinity: ListTileControlAffinity.leading,
                value: item.done,
                onChanged: (_) => _toggle(item),
                title: Text(
                  item.text,
                  style: item.done
                      ? text.bodyMedium?.copyWith(
                          decoration: TextDecoration.lineThrough,
                          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
                        )
                      : text.bodyMedium,
                ),
              ),
            _AddRow(
              controller: _checklistController,
              hint: 'Add a checklist item',
              busy: _addingChecklist,
              onSubmit: _addChecklist,
            ),

            // ---- Comments ----
            const Divider(height: 32),
            Text('Comments', style: text.titleMedium),
            const SizedBox(height: 8),
            if (card.comments.isEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text('No comments yet', style: text.bodySmall),
              ),
            for (final comment in card.comments)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.chat_bubble_outline, size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(comment.body, style: text.bodyMedium),
                          if (comment.createdAt != null)
                            Text(
                              comment.createdAt!.toIso8601String().substring(0, 16).replaceFirst('T', ' '),
                              style: text.bodySmall?.copyWith(
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurface
                                    .withValues(alpha: 0.5),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            _AddRow(
              controller: _commentController,
              hint: 'Add a comment',
              busy: _addingComment,
              onSubmit: _addComment,
            ),
          ],
        ),
      ),
    );
  }

  Widget _meta(IconData icon, String label, {bool overdue = false}) {
    final color = overdue
        ? AppTheme.danger
        : Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(color: color, fontSize: 13)),
      ],
    );
  }
}

/// A text field + send button used to add a checklist item or comment.
class _AddRow extends StatelessWidget {
  const _AddRow({
    required this.controller,
    required this.hint,
    required this.busy,
    required this.onSubmit,
  });

  final TextEditingController controller;
  final String hint;
  final bool busy;
  final Future<void> Function() onSubmit;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: hint,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              ),
              onSubmitted: (_) => busy ? null : onSubmit(),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: busy ? null : onSubmit,
            icon: busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send, size: 18),
          ),
        ],
      ),
    );
  }
}
