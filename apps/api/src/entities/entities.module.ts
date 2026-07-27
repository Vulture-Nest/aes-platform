import { Module } from '@nestjs/common';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';

/**
 * Entity / multinational dimension (Additional Features — Prompt 27). A legal
 * operating entity per country (with public holidays for localisation) and the
 * seam (EntitiesService) that payroll / returns country-pack logic calls to
 * resolve country/currency/timezone/locale. PrismaService/AuditService are global.
 */
@Module({
  controllers: [EntitiesController],
  providers: [EntitiesService],
  exports: [EntitiesService],
})
export class EntitiesModule {}
