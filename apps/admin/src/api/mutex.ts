/** Minimal single-flight mutex so only one token refresh runs at a time. */
export class Mutex {
  private locked = false;
  private waiters: Array<() => void> = [];

  isLocked(): boolean {
    return this.locked;
  }

  /** Resolves once the mutex is free (does not acquire). */
  async wait(): Promise<void> {
    if (!this.locked) return;
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  /** Acquires the lock; returns a release function. */
  async acquire(): Promise<() => void> {
    while (this.locked) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.locked = true;
    return () => {
      this.locked = false;
      const next = this.waiters.shift();
      if (next) next();
    };
  }
}
