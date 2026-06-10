import { computeThreadId } from './threading.js';

describe('computeThreadId', () => {
  it('uses the first References entry as the canonical thread id', () => {
    expect(
      computeThreadId({
        messageId: '<reply@example.com>',
        inReplyTo: '<parent@example.com>',
        references: ['<root@example.com>', '<parent@example.com>'],
      }),
    ).toBe('<root@example.com>');
  });

  it('falls back to In-Reply-To when References is empty', () => {
    expect(
      computeThreadId({
        messageId: '<reply@example.com>',
        inReplyTo: '<parent@example.com>',
        references: [],
      }),
    ).toBe('<parent@example.com>');
  });

  it('falls back to the message id for root messages', () => {
    expect(
      computeThreadId({
        messageId: '<root@example.com>',
      }),
    ).toBe('<root@example.com>');
  });

  it('ignores blank candidates and falls back safely', () => {
    expect(
      computeThreadId({
        messageId: '<root@example.com>',
        inReplyTo: ' ',
        references: ['', '   '],
      }),
    ).toBe('<root@example.com>');
  });

  it('returns the same id for a root and replies in the same thread', () => {
    const root = computeThreadId({
      messageId: '<root@example.com>',
    });
    const firstReply = computeThreadId({
      messageId: '<first-reply@example.com>',
      inReplyTo: '<root@example.com>',
      references: ['<root@example.com>'],
    });
    const secondReply = computeThreadId({
      messageId: '<second-reply@example.com>',
      inReplyTo: '<first-reply@example.com>',
      references: ['<root@example.com>', '<first-reply@example.com>'],
    });

    expect([root, firstReply, secondReply]).toEqual([
      '<root@example.com>',
      '<root@example.com>',
      '<root@example.com>',
    ]);
  });
});
