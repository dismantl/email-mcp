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
    mailbox: { uidValidity: 12345n },
    list: vi.fn().mockResolvedValue([]),
    status: vi.fn().mockResolvedValue({ messages: 5, unseen: 2 }),
    fetch: vi.fn().mockReturnValue((async function* fetchMock() {})()),
    fetchOne: vi.fn(),
    download: vi.fn().mockRejectedValue(new Error('no text part')),
    search: vi.fn().mockResolvedValue([]),
    messageMove: vi.fn().mockResolvedValue(true),
    messageDelete: vi.fn().mockResolvedValue(true),
    messageCopy: vi.fn().mockResolvedValue(true),
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
  // UIDVALIDITY
  // -----------------------------------------------------------------------

  describe('UIDVALIDITY', () => {
    it('includes selected mailbox UIDVALIDITY in listEmails results', async () => {
      client.search.mockResolvedValue([2]);
      client.fetch.mockReturnValue(
        createFetchResults([
          createMockMessage({
            uid: 2,
            messageId: '<message@example.com>',
          }),
        ]),
      );

      const result = await service.listEmails('test');

      expect(result.items[0]).toMatchObject({
        id: '2',
        uidValidity: '12345',
      });
    });

    it('includes selected mailbox UIDVALIDITY in searchEmails results', async () => {
      client.search.mockResolvedValue([2]);
      client.fetch.mockReturnValue(
        createFetchResults([
          createMockMessage({
            uid: 2,
            messageId: '<message@example.com>',
          }),
        ]),
      );

      const result = await service.searchEmails('test', 'message');

      expect(result.items[0]).toMatchObject({
        id: '2',
        uidValidity: '12345',
      });
    });

    it('includes selected mailbox UIDVALIDITY in getEmail results', async () => {
      client.fetchOne.mockResolvedValue(
        createMockMessage({
          uid: 2,
          messageId: '<message@example.com>',
        }),
      );

      const email = await service.getEmail('test', '2');

      expect(email.uidValidity).toBe('12345');
    });

    it('rejects getEmail when the expected UIDVALIDITY is stale', async () => {
      await expect(service.getEmail('test', '2', 'INBOX', '999')).rejects.toThrow(
        'UIDVALIDITY mismatch for mailbox "INBOX": expected 999, got 12345.',
      );

      expect(client.fetchOne).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('rejects moveEmail when the expected UIDVALIDITY is stale', async () => {
      client.list.mockResolvedValue([{ name: 'INBOX', path: 'INBOX', specialUse: '\\Inbox' }]);

      await expect(service.moveEmail('test', '42', 'INBOX', 'Archive', '999')).rejects.toThrow(
        'UIDVALIDITY mismatch for mailbox "INBOX": expected 999, got 12345.',
      );

      expect(client.messageMove).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('rejects deleteEmail when the expected UIDVALIDITY is stale', async () => {
      await expect(service.deleteEmail('test', '99', 'INBOX', true, '999')).rejects.toThrow(
        'UIDVALIDITY mismatch for mailbox "INBOX": expected 999, got 12345.',
      );

      expect(client.messageDelete).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('rejects deleteEmail when UIDVALIDITY is missing', async () => {
      await expect(
        service.deleteEmail('test', '99', 'INBOX', true, undefined as never),
      ).rejects.toThrow('UIDVALIDITY is required for mailbox "INBOX".');

      expect(client.messageDelete).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('rejects setFlags when the expected UIDVALIDITY is stale', async () => {
      await expect(service.setFlags('test', '10', 'INBOX', 'read', '999')).rejects.toThrow(
        'UIDVALIDITY mismatch for mailbox "INBOX": expected 999, got 12345.',
      );

      expect(client.messageFlagsAdd).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('rejects setFlags when UIDVALIDITY is missing', async () => {
      await expect(
        service.setFlags('test', '10', 'INBOX', 'read', undefined as never),
      ).rejects.toThrow('UIDVALIDITY is required for mailbox "INBOX".');

      expect(client.messageFlagsAdd).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('rejects label changes when the expected UIDVALIDITY is stale', async () => {
      await expect(service.addLabel('test', '10', 'INBOX', 'Project', '999')).rejects.toThrow(
        'UIDVALIDITY mismatch for mailbox "INBOX": expected 999, got 12345.',
      );

      expect(client.messageFlagsAdd).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('rejects label changes when UIDVALIDITY is missing', async () => {
      await expect(
        service.addLabel('test', '10', 'INBOX', 'Project', undefined as never),
      ).rejects.toThrow('UIDVALIDITY is required for mailbox "INBOX".');

      expect(client.messageFlagsAdd).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('fails bulk actions before applying them when the expected UIDVALIDITY is stale', async () => {
      const result = await service.bulkSetFlags('test', [10, 11], 'INBOX', 'mark_read', '999');

      expect(result).toEqual({
        total: 2,
        succeeded: 0,
        failed: 2,
        errors: ['UIDVALIDITY mismatch for mailbox "INBOX": expected 999, got 12345.'],
      });
      expect(client.messageFlagsAdd).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('fails bulk actions before applying them when UIDVALIDITY is missing', async () => {
      const result = await service.bulkSetFlags(
        'test',
        [10, 11],
        'INBOX',
        'mark_read',
        undefined as never,
      );

      expect(result).toEqual({
        total: 2,
        succeeded: 0,
        failed: 2,
        errors: ['UIDVALIDITY is required for mailbox "INBOX".'],
      });
      expect(client.messageFlagsAdd).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('rejects attachment download when the expected UIDVALIDITY is stale', async () => {
      await expect(
        service.downloadAttachment('test', '10', 'INBOX', 'agenda.pdf', '999'),
      ).rejects.toThrow('UIDVALIDITY mismatch for mailbox "INBOX": expected 999, got 12345.');

      expect(client.fetchOne).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('rejects attachment download when UIDVALIDITY is missing', async () => {
      await expect(
        service.downloadAttachment('test', '10', 'INBOX', 'agenda.pdf', undefined as never),
      ).rejects.toThrow('UIDVALIDITY is required for mailbox "INBOX".');

      expect(client.fetchOne).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('rejects calendar part extraction when the expected UIDVALIDITY is stale', async () => {
      await expect(service.getCalendarParts('test', 'INBOX', '10', '999')).rejects.toThrow(
        'UIDVALIDITY mismatch for mailbox "INBOX": expected 999, got 12345.',
      );

      expect(client.fetch).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('rejects calendar part extraction when UIDVALIDITY is missing', async () => {
      await expect(
        service.getCalendarParts('test', 'INBOX', '10', undefined as never),
      ).rejects.toThrow('UIDVALIDITY is required for mailbox "INBOX".');

      expect(client.fetch).not.toHaveBeenCalled();
      expect(client._releaseFn).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // moveEmail
  // -----------------------------------------------------------------------

  describe('moveEmail', () => {
    it('moves email between mailboxes', async () => {
      // assertRealMailbox calls client.list() internally
      client.list.mockResolvedValue([{ name: 'INBOX', path: 'INBOX', specialUse: '\\Inbox' }]);

      await service.moveEmail('test', '42', 'INBOX', 'Archive', '12345');

      expect(client.getMailboxLock).toHaveBeenCalledWith('INBOX');
      expect(client.messageMove).toHaveBeenCalledWith('42', 'Archive', { uid: true });
      expect(client._releaseFn).toHaveBeenCalled();
    });

    it('calls sanitizeMailboxName on inputs', async () => {
      client.list.mockResolvedValue([]);

      // Passing valid names — sanitize should pass them through without error
      await service.moveEmail('test', '1', 'INBOX', 'Sent', '12345');

      expect(client.messageMove).toHaveBeenCalledWith('1', 'Sent', { uid: true });
    });
  });

  // -----------------------------------------------------------------------
  // deleteEmail
  // -----------------------------------------------------------------------

  describe('deleteEmail', () => {
    it('permanently deletes when permanent=true', async () => {
      await service.deleteEmail('test', '99', 'INBOX', true, '12345');

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

      await service.deleteEmail('test', '99', 'INBOX', false, '12345');

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
      await service.setFlags('test', '10', 'INBOX', 'read', '12345');

      expect(client.messageFlagsAdd).toHaveBeenCalledWith('10', ['\\Seen'], { uid: true });
      expect(client.messageFlagsRemove).not.toHaveBeenCalled();
    });

    it('removes Seen flag for unread action', async () => {
      await service.setFlags('test', '10', 'INBOX', 'unread', '12345');

      expect(client.messageFlagsRemove).toHaveBeenCalledWith('10', ['\\Seen'], { uid: true });
      expect(client.messageFlagsAdd).not.toHaveBeenCalled();
    });

    it('adds Flagged flag for flag action', async () => {
      await service.setFlags('test', '10', 'INBOX', 'flag', '12345');

      expect(client.messageFlagsAdd).toHaveBeenCalledWith('10', ['\\Flagged'], { uid: true });
    });
  });
});
