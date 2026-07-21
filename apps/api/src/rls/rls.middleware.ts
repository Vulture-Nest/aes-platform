import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RlsContext } from './rls-context';

/**
 * Opens the RLS AsyncLocalStorage context for the whole request. Running `next()` inside
 * `rls.run(...)` means every downstream stage — auth guard, handler, services, Prisma —
 * shares the same store. The store starts in bypass mode; the JWT strategy narrows it to
 * the user's site scope once the token is validated (guards run after middleware).
 */
@Injectable()
export class RlsMiddleware implements NestMiddleware {
  constructor(private readonly rls: RlsContext) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    this.rls.run(() => next());
  }
}
