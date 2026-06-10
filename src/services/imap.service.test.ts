import type { IConnectionManager } from '../connections/types.js';
import ImapService from './imap.service.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockImapClient() {
  const releaseFn = vi.fn();
  return {
    usable: true,
    getMailboxLock: vi.fn().mockResolvedValue({ release: releaseFn }),
    list: vi.fn().mockResolvedValue([]),
    status: vi.fn().mockResolvedValue({ messages: 5, unseen: 2 }),
    fetch: vi.fn().mockReturnValue((async function* fetchMock() {})()),
    fetchOne: vi.fn(),
    download: vi.fn().mockRejectedValue(new Error('no text part')),
    search: vi.fn().mockResolvedValue([]),
    messageMove: vi.fn().mockResolvedValue(true),
    messageDelete: vi.fn().mockResolvedValue(true),
    messageFlagsAdd: vi.fn().mockResolvedValue(true),
    messageFlagsRemove: vi.fn().mockResolvedValue(true),
    _releaseFn: releaseFn,
  };
}

function createMockConnectionManager(mockClient: ReturnType<typeof createMockImapClient>) {
  return {
    getAccount: vi.fn().mockReturnValue({
      name: 'test',
      email: 'test@example.com',
      username: 'test@example.com',
      imap: { host: 'imap.example.com', port: 993, tls: true, starttls: false, verifySsl: true },
      smtp: { host: 'smtp.example.com', port: 465, tls: true, starttls: false, verifySsl: true },
    }),
    getAccountNames: vi.fn().mockReturnValue(['test']),
    getImapClient: vi.fn().mockResolvedValue(mockClient),
    getSmtpTransport: vi.fn(),
    closeAll: vi.fn(),
  } satisfies IConnectionManager;
}

interface MockMessageOptions {
  uid: number;
  subject?: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
}

function createMockMessage({
  uid,
  subject = 'Thread update',
  messageId,
  inReplyTo,
  references,
}: MockMessageOptions): Record<string, unknown> {
  const headerLines = [
    `Message-ID: ${messageId}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : undefined,
    references ? `References: ${references.join(' ')}` : undefined,
  ].filter((line): line is string => Boolean(line));

  return {
    uid,
    seq: uid,
    envelope: {
      subject,
      messageId,
      inReplyTo,
      date: new Date('2026-06-10T12:00:00Z'),
      from: [{ name: 'Sender', address: 'sender@example.com' }],
      to: [{ name: 'Recipient', address: 'recipient@example.com' }],
    },
    flags: new Set<string>(),
    bodyStructure: undefined,
    headers: Buffer.from(`${headerLines.join('\r\n')}\r\n\r\n`),
    source: Buffer.from(`${headerLines.join('\r\n')}\r\n\r\nBody text`),
  };
}

async function* createFetchResults(messages: Record<string, unknown>[]) {
  for (const message of messages) {
    yield message;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImapService', () => {
  let client: ReturnType<typeof createMockImapClient>;
  let connections: ReturnType<typeof createMockConnectionManager>;
  let service: ImapService;

  beforeEach(() => {
    client = createMockImapClient();
    connections = createMockConnectionManager(client);
    service = new ImapService(connections);
  });

  // -----------------------------------------------------------------------
  // listMailboxes
  // -----------------------------------------------------------------------

  describe('listMailboxes', () => {
    it('returns mailbox list with message counts', async () => {
      client.list.mockResolvedValue([
        { name: 'INBOX', path: 'INBOX', specialUse: '\\Inbox' },
        { name: 'Sent', path: 'Sent', specialUse: '\\Sent' },
      ]);
      client.status.mockResolvedValue({ messages: 10, unseen: 3 });

      const result = await service.listMailboxes('test');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'INBOX',
        path: 'INBOX',
        specialUse: '\\Inbox',
        totalMessages: 10,
        unseenMessages: 3,
      });
      expect(result[1]).toEqual({
        name: 'Sent',
        path: 'Sent',
        specialUse: '\\Sent',
        totalMessages: 10,
        unseenMessages: 3,
      });
      expect(client.status).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // thread metadata
  // -----------------------------------------------------------------------

  describe('thread metadata', () => {
    it('includes canonical thread fields in listEmails results', async () => {
      client.search.mockResolvedValue([2]);
      client.fetch.mockReturnValue(
        createFetchResults([
          createMockMessage({
            uid: 2,
            messageId: '<reply@example.com>',
            inReplyTo: '<parent@example.com>',
            references: ['<root@example.com>', '<parent@example.com>'],
          }),
        ]),
      );

      const result = await service.listEmails('test');

      expect(result.items[0]).toMatchObject({
        messageId: '<reply@example.com>',
        inReplyTo: '<parent@example.com>',
        references: ['<root@example.com>', '<parent@example.com>'],
        threadId: '<root@example.com>',
      });
    });

    it('includes references and canonical thread id in getEmail results', async () => {
      client.fetchOne.mockResolvedValue(
        createMockMessage({
          uid: 2,
          messageId: '<reply@example.com>',
          inReplyTo: '<parent@example.com>',
          references: ['<root@example.com>', '<parent@example.com>'],
        }),
      );

      const email = await service.getEmail('test', '2');

      expect(email).toMatchObject({
        messageId: '<reply@example.com>',
        inReplyTo: '<parent@example.com>',
        references: ['<root@example.com>', '<parent@example.com>'],
        threadId: '<root@example.com>',
      });
    });

    it('returns the canonical thread id from getThread instead of the query seed', async () => {
      const root = createMockMessage({
        uid: 1,
        messageId: '<root@example.com>',
      });
      const reply = createMockMessage({
        uid: 2,
        messageId: '<reply@example.com>',
        inReplyTo: '<root@example.com>',
        references: ['<root@example.com>'],
      });

      client.fetchOne.mockResolvedValue(reply);
      client.fetch.mockReturnValue(createFetchResults([root, reply]));
      client.search.mockImplementation(async (criteria: Record<string, unknown>) => {
        const header = criteria.header as Record<string, string> | undefined;
        if (!header) return [];
        if (header['Message-ID'] === '<reply@example.com>') return [2];
        if (header['Message-ID'] === '<root@example.com>') return [1];
        if (header.References === '<root@example.com>') return [2];
        if (header['In-Reply-To'] === '<root@example.com>') return [2];
        return [];
      });

      const thread = await service.getThread('test', '<reply@example.com>');

      expect(thread.threadId).toBe('<root@example.com>');
      expect(thread.messages.map((email) => email.threadId)).toEqual([
        '<root@example.com>',
        '<root@example.com>',
      ]);
    });
  });

  // -----------------------------------------------------------------------
  // moveEmail
  // -----------------------------------------------------------------------

  describe('moveEmail', () => {
    it('moves email between mailboxes', async () => {
      // assertRealMailbox calls client.list() internally
      client.list.mockResolvedValue([{ name: 'INBOX', path: 'INBOX', specialUse: '\\Inbox' }]);

      await service.moveEmail('test', '42', 'INBOX', 'Archive');

      expect(client.getMailboxLock).toHaveBeenCalledWith('INBOX');
      expect(client.messageMove).toHaveBeenCalledWith('42', 'Archive', { uid: true });
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('calls sanitizeMailboxName on inputs', async () => {
      client.list.mockResolvedValue([]);

      // Passing valid names — sanitize should pass them through without error
      await service.moveEmail('test', '1', 'INBOX', 'Sent');

      expect(client.messageMove).toHaveBeenCalledWith('1', 'Sent', { uid: true });
    });
  });

  // -----------------------------------------------------------------------
  // deleteEmail
  // -----------------------------------------------------------------------

  describe('deleteEmail', () => {
    it('permanently deletes when permanent=true', async () => {
      await service.deleteEmail('test', '99', 'INBOX', true);

      expect(client.messageDelete).toHaveBeenCalledWith('99', { uid: true });
      expect(client.messageMove).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('moves to trash when permanent=false', async () => {
      // assertRealMailbox + trash detection both call client.list()
      client.list.mockResolvedValue([
        { name: 'INBOX', path: 'INBOX', specialUse: '\\Inbox' },
        { name: 'Trash', path: 'Trash', specialUse: '\\Trash' },
      ]);

      await service.deleteEmail('test', '99', 'INBOX', false);

      expect(client.messageDelete).not.toHaveBeenCalled();
      expect(client.messageMove).toHaveBeenCalledWith('99', 'Trash', { uid: true });
      expect(client._releaseFn).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // setFlags
  // -----------------------------------------------------------------------

  describe('setFlags', () => {
    it('adds Seen flag for read action', async () => {
      await service.setFlags('test', '10', 'INBOX', 'read');

      expect(client.messageFlagsAdd).toHaveBeenCalledWith('10', ['\\Seen'], { uid: true });
      expect(client.messageFlagsRemove).not.toHaveBeenCalled();
    });

    it('removes Seen flag for unread action', async () => {
      await service.setFlags('test', '10', 'INBOX', 'unread');

      expect(client.messageFlagsRemove).toHaveBeenCalledWith('10', ['\\Seen'], { uid: true });
      expect(client.messageFlagsAdd).not.toHaveBeenCalled();
    });

    it('adds Flagged flag for flag action', async () => {
      await service.setFlags('test', '10', 'INBOX', 'flag');

      expect(client.messageFlagsAdd).toHaveBeenCalledWith('10', ['\\Flagged'], { uid: true });
    });
  });
});
