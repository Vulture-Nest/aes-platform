import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/attachments_repository.dart';
import '../../models/project_portfolio_item.dart';
import '../../widgets/ui_kit.dart';
import 'cubit/portfolio_cubit.dart';
import 'cubit/portfolio_state.dart';
import 'cubit/project_detail_cubit.dart';
import 'data/projects_repository.dart';
import 'project_detail_screen.dart';
import 'widgets/project_widgets.dart';

/// Projects portfolio: every project with its % complete, schedule health and
/// RAG flag. Tap a project to open its WBS tree and update task progress.
class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<PortfolioCubit>().load();
    });
  }

  Future<void> _open(ProjectPortfolioItem item) async {
    // The detail screen owns its own cubit, reading the shared repositories that
    // the app wires as RepositoryProviders (same pattern requests uses).
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (ctx) => BlocProvider(
          create: (_) => ProjectDetailCubit(
            projectId: item.projectId,
            repository: ctx.read<ProjectsRepository>(),
            attachments: ctx.read<AttachmentsRepository>(),
          )..load(),
          child: ProjectDetailScreen(projectName: item.name),
        ),
      ),
    );
    // A progress update rolls up to the portfolio %, so refresh on return.
    if (mounted) context.read<PortfolioCubit>().load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: gradientAppBar('Projects'),
      body: BlocBuilder<PortfolioCubit, PortfolioState>(
        builder: (context, state) {
          if (state.loading && state.items.isEmpty) {
            return const Center(child: CircularProgressIndicator());
          }
          return RefreshIndicator(
            onRefresh: () => context.read<PortfolioCubit>().load(),
            child: state.items.isEmpty
                ? EmptyState(
                    icon: state.error != null ? Icons.cloud_off : Icons.account_tree_outlined,
                    message: state.error ?? 'No projects yet',
                    isError: state.error != null,
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: state.items.length,
                    itemBuilder: (context, i) => _ProjectCard(
                      item: state.items[i],
                      onTap: () => _open(state.items[i]),
                    ),
                  ),
          );
        },
      ),
    );
  }
}

class _ProjectCard extends StatelessWidget {
  const _ProjectCard({required this.item, required this.onTap});

  final ProjectPortfolioItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final pct = item.percentComplete;
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      item.name,
                      style: Theme.of(context).textTheme.titleMedium,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  RagChip(rag: item.health.rag),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: ProgressBar(percent: pct, color: ragColor(item.health.rag))),
                  const SizedBox(width: 12),
                  Text('${pct.round()}%', style: Theme.of(context).textTheme.titleSmall),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    item.health.isAhead ? Icons.trending_up : Icons.trending_down,
                    size: 16,
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    scheduleLabel(item.health),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const Spacer(),
                  Text(
                    item.status,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
                        ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
