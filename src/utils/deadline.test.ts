import { Deadline, DeadlineExceededError } from './deadline.js';

describe('Deadline', () => {
  it('resolves an op that finishes within budget', async () => {
    await expect(new Deadline(1000).race(Promise.resolve('ok'), 'fast')).resolves.toBe('ok');
  });

  it('rejects with DeadlineExceededError when the op overruns', async () => {
    const slow = new Promise((resolve) => {
      setTimeout(() => resolve('late'), 200);
    });

    await expect(new Deadline(20).race(slow, 'slow')).rejects.toBeInstanceOf(DeadlineExceededError);
  });

  it('does not emit an unhandledRejection when the abandoned op later rejects', async () => {
    const handler = vi.fn();
    process.once('unhandledRejection', handler);
    const boom = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('boom')), 60);
    });

    await expect(new Deadline(10).race(boom, 'boom')).rejects.toBeInstanceOf(DeadlineExceededError);
    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
