import { Module } from '@nestjs/common';
import { DelegationController } from './delegation/delegation.controller';
import { DelegationService } from './delegation/delegation.service';
import { ExchangeRatesController } from './exchange-rates/exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates/exchange-rates.service';
import { StatutoryRatesController } from './statutory-rates/statutory-rates.controller';
import { StatutoryRatesService } from './statutory-rates/statutory-rates.service';
import { ThresholdsController } from './thresholds/thresholds.controller';
import { ThresholdsService } from './thresholds/thresholds.service';

/** Effective-dated reference data: FX rates, statutory params, thresholds, delegation. */
@Module({
  controllers: [
    ExchangeRatesController,
    StatutoryRatesController,
    ThresholdsController,
    DelegationController,
  ],
  providers: [ExchangeRatesService, StatutoryRatesService, ThresholdsService, DelegationService],
  exports: [ExchangeRatesService, StatutoryRatesService, ThresholdsService, DelegationService],
})
export class ReferenceModule {}
