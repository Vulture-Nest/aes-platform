import { Injectable, Logger } from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';

/** Callback other modules register to react to an approval chain reaching a terminal status. */
export type StatusTransitionCallback = (
  subjectId: string,
  status: ApprovalStatus,
) => Promise<void> | void;

/**
 * Simple in-memory registry keyed by subject table. Modules (S5+) register a callback
 * so the engine can push the subject to its next lifecycle state when a chain resolves.
 * Default behaviour is a no-op — the engine never hard-depends on a consumer being wired.
 */
@Injectable()
export class StatusTransitionRegistry {
  private readonly logger = new Logger(StatusTransitionRegistry.name);
  private readonly callbacks = new Map<string, StatusTransitionCallback>();

  registerTransition(subjectTable: string, callback: StatusTransitionCallback): void {
    this.callbacks.set(subjectTable, callback);
  }

  async fire(subjectTable: string, subjectId: string, status: ApprovalStatus): Promise<void> {
    const callback = this.callbacks.get(subjectTable);
    if (!callback) {
      return; // default no-op
    }
    try {
      await callback(subjectId, status);
    } catch (err) {
      // A consumer's transition failing must not corrupt the approval decision itself.
      this.logger.error(
        `StatusTransition callback for "${subjectTable}" (${subjectId} → ${status}) failed: ${
          (err as Error).message
        }`,
      );
    }
  }
}
