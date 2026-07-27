import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../models/project_detail.dart';
import '../../models/project_node.dart';
import '../../widgets/ui_kit.dart';
import 'cubit/project_detail_cubit.dart';
import 'cubit/project_detail_state.dart';
import 'update_progress_sheet.dart';
import 'widgets/project_widgets.dart';

/// A project's WBS tree — phases › tasks › subtasks, each with a % and title.
/// Tap a node to open the light progress-update sheet.
class ProjectDetailScreen extends StatelessWidget {
  const ProjectDetailScreen({super.key, required this.projectName});

  final String projectName;

  Future<void> _openUpdate(BuildContext context, ProjectNode node) async {
    final cubit = context.read<ProjectDetailCubit>();
    final messenger = ScaffoldMessenger.of(context);
    final updated = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => BlocProvider.value(
        value: cubit,
        child: UpdateProgressSheet(node: node),
      ),
    );
    if (updated == true) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Progress updated')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: gradientAppBar(projectName),
      body: BlocBuilder<ProjectDetailCubit, ProjectDetailState>(
        builder: (context, state) {
          final project = state.project;
          if (state.loading && project == null) {
            return const Center(child: CircularProgressIndicator());
          }
          if (project == null) {
            return EmptyState(
              icon: Icons.cloud_off,
              message: state.error ?? 'Could not load this project',
              isError: true,
            );
          }
          return RefreshIndicator(
            onRefresh: () => context.read<ProjectDetailCubit>().load(),
            child: _WbsList(
              project: project,
              onTapNode: (node) => _openUpdate(context, node),
            ),
          );
        },
      ),
    );
  }
}

/// Flattens the WBS tree into an indented, tappable list.
class _WbsList extends StatelessWidget {
  const _WbsList({required this.project, required this.onTapNode});

  final ProjectDetail project;
  final void Function(ProjectNode node) onTapNode;

  /// Depth-first flatten so parents precede their children, carrying indent depth.
  List<(ProjectNode, int)> _flatten() {
    final out = <(ProjectNode, int)>[];
    void walk(ProjectNode node, int depth) {
      out.add((node, depth));
      for (final child in project.childrenOf(node.id)) {
        walk(child, depth + 1);
      }
    }

    for (final root in project.roots) {
      walk(root, 0);
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final rows = _flatten();
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
      children: [
        _ProjectHeader(project: project),
        const SizedBox(height: 8),
        if (rows.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 40),
            child: Center(
              child: Text(
                'No work breakdown yet',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          )
        else
          for (final (node, depth) in rows)
            _NodeTile(node: node, depth: depth, onTap: () => onTapNode(node)),
      ],
    );
  }
}

class _ProjectHeader extends StatelessWidget {
  const _ProjectHeader({required this.project});

  final ProjectDetail project;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Overall progress', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: ProgressBar(percent: project.percentComplete)),
                const SizedBox(width: 12),
                Text(
                  '${project.percentComplete.round()}%',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// A single WBS node row: type tag, title, its % and a slim bar; indented by depth.
class _NodeTile extends StatelessWidget {
  const _NodeTile({required this.node, required this.depth, required this.onTap});

  final ProjectNode node;
  final int depth;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Padding(
      padding: EdgeInsets.only(left: depth * 16.0, bottom: 8),
      child: Card(
        margin: EdgeInsets.zero,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                if (node.isComplete)
                  const Padding(
                    padding: EdgeInsets.only(right: 8),
                    child: Icon(Icons.check_circle, color: Colors.green, size: 20),
                  ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        node.type.label.toUpperCase(),
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: onSurface.withValues(alpha: 0.5),
                              letterSpacing: 0.6,
                            ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        node.title,
                        style: Theme.of(context).textTheme.titleSmall,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 8),
                      ProgressBar(percent: node.percentComplete),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Text('${node.percentComplete.round()}%', style: Theme.of(context).textTheme.titleSmall),
                Icon(Icons.chevron_right, color: onSurface.withValues(alpha: 0.4)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
