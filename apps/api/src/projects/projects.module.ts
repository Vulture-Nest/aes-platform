import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { FromTemplateController, TemplatesController } from './templates.controller';

/**
 * Project WBS & Progress (Additional Features — Prompt 27). Site-scoped projects with a
 * work-breakdown-structure tree (phase/task/subtask), weighted roll-up of % complete,
 * schedule health (planned-vs-actual RAG), FS dependencies, per-node progress notes and
 * reusable WBS templates. PrismaService and AuditService are provided globally.
 */
@Module({
  controllers: [ProjectsController, TemplatesController, FromTemplateController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
