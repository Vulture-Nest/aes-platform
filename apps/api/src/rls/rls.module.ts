import { Global, Module } from '@nestjs/common';
import { RlsContext } from './rls-context';

/**
 * Global provider for the RLS request context so PrismaService (and the auth layer) can
 * inject it anywhere. The middleware that opens the context is applied in AppModule.
 */
@Global()
@Module({
  providers: [RlsContext],
  exports: [RlsContext],
})
export class RlsModule {}
