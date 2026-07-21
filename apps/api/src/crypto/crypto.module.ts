import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';

/** Global so any feature (HR, payroll) can inject CryptoService for at-rest encryption. */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
