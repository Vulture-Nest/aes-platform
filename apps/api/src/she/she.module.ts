import { Module } from '@nestjs/common';
import { SheController } from './she.controller';
import { SheService } from './she.service';

/**
 * SHE — Safety, Health & Environment (G21 / spec §16.10, add-feat §8.3).
 *
 * Captures structured SHE records (INCIDENT | NEAR_MISS | TOOLBOX_TALK | MEDICAL | DRILL |
 * HAZARD) against a site, tracks LTIs + investigations, and exposes a TRIFR-style summary.
 * The `she_records` table + RLS were added in the 20260727190000_tier4_schema migration.
 * PrismaService and AuditService are global.
 */
@Module({
  controllers: [SheController],
  providers: [SheService],
  exports: [SheService],
})
export class SheModule {}
