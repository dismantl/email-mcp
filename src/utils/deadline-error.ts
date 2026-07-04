/** Thrown by Deadline.race when the wall-clock budget elapses before the op settles. */
export default class DeadlineExceededError extends Error {
  constructor(public readonly label: string) {
    super(`operation exceeded deadline: ${label}`);
    this.name = 'DeadlineExceededError';
  }
}
