import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';

/**
 * Confidential Boards engine (Additional Features — Prompt 27). Trello-style
 * boards/lists/cards/checklist/comments with a HARD director-confidential
 * visibility mode enforced in the service query layer (not just route guards):
 * a DIRECTOR_CONFIDENTIAL board and all its contents are completely invisible to
 * non-directors (absent from lists; 404 on direct get to avoid leaking existence).
 * PrismaService and AuditService are provided globally.
 */
@Module({
  controllers: [BoardsController],
  providers: [BoardsService],
  exports: [BoardsService],
})
export class BoardsModule {}
