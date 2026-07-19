import { ApprovalStatus } from '@prisma/client';
import { StatusTransitionRegistry } from './status-transition.registry';

describe('StatusTransitionRegistry', () => {
  it('is a no-op when no callback is registered', async () => {
    const registry = new StatusTransitionRegistry();
    await expect(
      registry.fire('requisitions', 's1', ApprovalStatus.APPROVED),
    ).resolves.toBeUndefined();
  });

  it('invokes the registered callback with subjectId and status', async () => {
    const registry = new StatusTransitionRegistry();
    const cb = jest.fn();
    registry.registerTransition('requisitions', cb);
    await registry.fire('requisitions', 's1', ApprovalStatus.APPROVED);
    expect(cb).toHaveBeenCalledWith('s1', ApprovalStatus.APPROVED);
  });

  it('swallows callback errors so a decision is never corrupted', async () => {
    const registry = new StatusTransitionRegistry();
    registry.registerTransition('requisitions', () => {
      throw new Error('boom');
    });
    await expect(
      registry.fire('requisitions', 's1', ApprovalStatus.REJECTED),
    ).resolves.toBeUndefined();
  });
});
