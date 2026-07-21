import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { RlsContext } from '../rls/rls-context';

/** Stamp the caller's site scope into transaction-local GUCs that the RLS policies read. */
const SET_SCOPE_SQL =
  "SELECT set_config('app.bypass_rls', $1, true), set_config('app.site_ids', $2, true)";

/** Methods/fields that must stay on the base instance rather than delegate to the extension. */
const PASSTHROUGH = new Set(['onModuleInit', 'onModuleDestroy', 'rlsTx', 'rls', 'logger']);

/**
 * Prisma client wired to the Nest lifecycle, with row-level-security enforcement.
 *
 * A client extension wraps every model operation in a one-shot transaction that first
 * stamps the current request's site scope (from RlsContext) into the `app.bypass_rls` /
 * `app.site_ids` session GUCs. The RLS policies on site-scoped tables read those GUCs, so
 * a scoped user only ever sees/writes rows for their own site(s). System jobs, cron and
 * pre-auth queries run with no request context and default to bypass.
 *
 * The constructor returns a Proxy: lifecycle hooks and `rlsTx` stay on the base client
 * (whose `$transaction` is deliberately un-extended, to avoid nested transactions), while
 * model accessors and other client methods delegate to the extended client.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** Multi-statement unit of work with the site scope stamped once up front (see below). */
  readonly rlsTx: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;

  constructor(private readonly rls: RlsContext) {
    super();
    const self = this;

    const extended = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const { bypass, siteIds } = self.scopeParams();
            const [, result] = await self.$transaction([
              self.$executeRawUnsafe(SET_SCOPE_SQL, bypass, siteIds),
              query(args),
            ]);
            return result as unknown;
          },
        },
      },
    });

    // Uses the base (un-extended) $transaction so the inner ops don't each open a nested
    // transaction; the scope is stamped once, then every op in `fn` shares that connection.
    this.rlsTx = async (fn) => {
      const { bypass, siteIds } = self.scopeParams();
      return self.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(SET_SCOPE_SQL, bypass, siteIds);
        return fn(tx);
      });
    };

    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && PASSTHROUGH.has(prop)) {
          return Reflect.get(target, prop, receiver);
        }
        const value = (extended as Record<string | symbol, unknown>)[prop];
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(extended)
          : value;
      },
    });
  }

  /** Resolve the current request scope into the two GUC string values. */
  private scopeParams(): { bypass: string; siteIds: string } {
    const store = this.rls.get();
    return { bypass: store.bypass ? 'on' : 'off', siteIds: store.siteIds.join(',') };
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
