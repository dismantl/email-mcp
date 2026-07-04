import DeadlineExceededError from './deadline-error.js';

export { DeadlineExceededError };

/**
 * A shared wall-clock budget across a sequence of async IMAP ops.
 * WHY: ImapFlow search/fetch calls take no AbortSignal, so an in-flight command
 * cannot be cancelled. Callers must reset the connection after a timeout because
 * the abandoned command is still on the wire.
 */
export class Deadline {
  private readonly end: number;

  constructor(ms: number) {
    this.end = Date.now() + ms;
  }

  remaining(): number {
    return this.end - Date.now();
  }

  expired(): boolean {
    return this.remaining() <= 0;
  }

  async race<T>(op: Promise<T>, label: string): Promise<T> {
    op.catch(() => undefined);
    const remaining = this.remaining();
    if (remaining <= 0) throw new DeadlineExceededError(label);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DeadlineExceededError(label)), remaining);
    });

    try {
      return await Promise.race([op, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
