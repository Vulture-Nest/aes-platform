import { Global, Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { LookupService } from './lookup.service';

/** Global so any module can inject LookupService to validate configurable inputs. */
@Global()
@Module({
  controllers: [SettingsController],
  providers: [LookupService],
  exports: [LookupService],
})
export class SettingsModule {}
