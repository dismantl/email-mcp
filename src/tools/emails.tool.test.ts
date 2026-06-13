import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type ImapService from '../services/imap.service.js';
import type { Email, EmailMeta, PaginatedResult } from '../types/index.js';
import registerEmailsTools from './emails.tool.js';

type ToolHandler = (params: Record<string, unknown>) => Promise<{
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}>;

function createServer() {
  return {
    tool: vi.fn(),
  } as unknown as McpServer & { tool: ReturnType<typeof vi.fn> };
}

function getHandler(server: ReturnType<typeof createServer>, name: string): ToolHandler {
  const call = server.tool.mock.calls.find(([toolName]) => toolName === name);
  if (!call) throw new Error(`Tool not registered: ${name}`);
  return call[4] as ToolHandler;
}

function getToolOptions(server: ReturnType<typeof createServer>, name: string) {
  const call = server.tool.mock.calls.find(([toolName]) => toolName === name);
  if (!call) throw new Error(`Tool not registered: ${name}`);
  return call[3] as { readOnlyHint?: boolean; destructiveHint?: boolean };
}

function createEmailMeta(overrides: Partial<EmailMeta> = {}): EmailMeta {
  return {
    id: '2',
    uidValidity: '12345',
    subject: 'Thread update',
    from: { name: 'Sender', address: 'sender@example.com' },
    to: [{ name: 'Recipient', address: 'recipient@example.com' }],
    date: '2026-06-10T12:00:00.000Z',
    messageId: '<reply@example.com>',
    threadId: '<root@example.com>',
    inReplyTo: '<parent@example.com>',
    references: ['<root@example.com>', '<parent@example.com>'],
    seen: false,
    flagged: false,
    answered: true,
    hasAttachments: false,
    labels: [],
    preview: 'A short preview',
    ...overrides,
  };
}

function createEmail(overrides: Partial<Email> = {}): Email {
  return {
    ...createEmailMeta(overrides),
    bodyText: 'Body text',
    attachments: [],
    headers: {},
    ...overrides,
  };
}

describe('registerEmailsTools', () => {
  it('keeps list_emails marked read-only', () => {
    const server = createServer();
    const imapService = {} as unknown as ImapService;

    registerEmailsTools(server, imapService);

    expect(getToolOptions(server, 'list_emails')).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
  });

  it('does not mark get_email read-only because markRead can mutate flags', () => {
    const server = createServer();
    const imapService = {} as unknown as ImapService;

    registerEmailsTools(server, imapService);

    expect(getToolOptions(server, 'get_email')).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
    });
  });

  it('renders message and thread ids in list_emails output', async () => {
    const server = createServer();
    const result: PaginatedResult<EmailMeta> = {
      items: [createEmailMeta()],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    };
    const imapService = {
      listEmails: vi.fn().mockResolvedValue(result),
    } as unknown as ImapService;

    registerEmailsTools(server, imapService);

    const response = await getHandler(
      server,
      'list_emails',
    )({
      account: 'test',
      mailbox: 'INBOX',
      page: 1,
      pageSize: 20,
    });

    expect(response.content[0].text).toContain('Message-ID: <reply@example.com>');
    expect(response.content[0].text).toContain('Thread-ID: <root@example.com>');
  });

  it('renders UIDVALIDITY in list_emails output', async () => {
    const server = createServer();
    const result: PaginatedResult<EmailMeta> = {
      items: [createEmailMeta()],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    };
    const imapService = {
      listEmails: vi.fn().mockResolvedValue(result),
    } as unknown as ImapService;

    registerEmailsTools(server, imapService);

    const response = await getHandler(
      server,
      'list_emails',
    )({
      account: 'test',
      mailbox: 'INBOX',
      page: 1,
      pageSize: 20,
    });

    expect(response.content[0].text).toContain('UIDVALIDITY: 12345');
  });

  it('renders thread id and references in get_email output', async () => {
    const server = createServer();
    const imapService = {
      getEmail: vi.fn().mockResolvedValue(createEmail()),
    } as unknown as ImapService;

    registerEmailsTools(server, imapService);

    const response = await getHandler(
      server,
      'get_email',
    )({
      account: 'test',
      emailId: '2',
      mailbox: 'INBOX',
      format: 'text',
      markRead: false,
    });

    expect(response.content[0].text).toContain('Thread: <root@example.com>');
    expect(response.content[0].text).toContain('Refs:   <root@example.com> <parent@example.com>');
    expect(response.content[0].text).toContain('Mailbox: INBOX');
    expect(response.content[0].text).toContain('UID:    2');
    expect(response.content[0].text).toContain('UIDVALIDITY: 12345');
  });

  it('uses the caller UIDVALIDITY when get_email marks the message read', async () => {
    const server = createServer();
    const imapService = {
      getEmail: vi.fn().mockResolvedValue(createEmail()),
      setFlags: vi.fn().mockResolvedValue(undefined),
    } as unknown as ImapService;

    registerEmailsTools(server, imapService);

    const response = await getHandler(
      server,
      'get_email',
    )({
      account: 'test',
      emailId: '2',
      mailbox: 'INBOX',
      uidValidity: '67890',
      format: 'text',
      markRead: true,
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.getEmail).toHaveBeenCalledWith('test', '2', 'INBOX', '67890');
    expect(imapService.setFlags).toHaveBeenCalledWith('test', '2', 'INBOX', 'read', '67890');
  });

  it('rejects markRead without caller UIDVALIDITY before fetching the message', async () => {
    const server = createServer();
    const imapService = {
      getEmail: vi.fn().mockResolvedValue(createEmail()),
      setFlags: vi.fn().mockResolvedValue(undefined),
    } as unknown as ImapService;

    registerEmailsTools(server, imapService);

    const response = await getHandler(
      server,
      'get_email',
    )({
      account: 'test',
      emailId: '2',
      mailbox: 'INBOX',
      format: 'text',
      markRead: true,
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('UIDVALIDITY is required');
    expect(imapService.getEmail).not.toHaveBeenCalled();
    expect(imapService.setFlags).not.toHaveBeenCalled();
  });

  it('renders thread id and references in get_emails output', async () => {
    const server = createServer();
    const imapService = {
      getEmail: vi.fn().mockResolvedValue(createEmail()),
    } as unknown as ImapService;

    registerEmailsTools(server, imapService);

    const response = await getHandler(
      server,
      'get_emails',
    )({
      account: 'test',
      ids: ['2'],
      mailbox: 'INBOX',
      format: 'text',
    });

    expect(response.content[0].text).toContain('Thread-ID: <root@example.com>');
    expect(response.content[0].text).toContain('UIDVALIDITY: 12345');
    expect(response.content[0].text).toContain(
      'References: <root@example.com> <parent@example.com>',
    );
  });

  it('renders a copy-ready Unsubscribe line in get_email output', async () => {
    const server = createServer();
    const imapService = {
      getEmail: vi.fn().mockResolvedValue(
        createEmail({
          unsubscribe: {
            oneClick: true,
            http: 'https://example.com/u?id=1',
            mailto: 'mailto:unsub@example.com',
          },
        }),
      ),
    } as unknown as ImapService;

    registerEmailsTools(server, imapService);

    const response = await getHandler(
      server,
      'get_email',
    )({
      account: 'test',
      emailId: '2',
      mailbox: 'INBOX',
      format: 'text',
      markRead: false,
    });

    expect(response.content[0].text).toContain(
      'Unsubscribe: one-click=yes  http=https://example.com/u?id=1  mailto:unsub@example.com',
    );
  });

  it('omits the Unsubscribe line when the message has no List-Unsubscribe header', async () => {
    const server = createServer();
    const imapService = {
      getEmail: vi.fn().mockResolvedValue(createEmail()),
    } as unknown as ImapService;

    registerEmailsTools(server, imapService);

    const response = await getHandler(
      server,
      'get_email',
    )({
      account: 'test',
      emailId: '2',
      mailbox: 'INBOX',
      format: 'text',
      markRead: false,
    });

    expect(response.content[0].text).not.toContain('Unsubscribe:');
  });

  it('renders the Unsubscribe line in get_emails output', async () => {
    const server = createServer();
    const imapService = {
      getEmail: vi
        .fn()
        .mockResolvedValue(
          createEmail({ unsubscribe: { oneClick: false, mailto: 'mailto:unsub@example.com' } }),
        ),
    } as unknown as ImapService;

    registerEmailsTools(server, imapService);

    const response = await getHandler(
      server,
      'get_emails',
    )({
      account: 'test',
      ids: ['2'],
      mailbox: 'INBOX',
      format: 'text',
    });

    expect(response.content[0].text).toContain(
      'Unsubscribe: one-click=no  mailto:unsub@example.com',
    );
  });

  it('keeps the Unsubscribe line under maxLength truncation (Naomi triage call shape)', async () => {
    // Naomi reads triage mail via get_emails(format="text", maxLength=4000).
    // The line is metadata emitted before the body, so body truncation must not drop it.
    const server = createServer();
    const longBody = 'x'.repeat(500);
    const imapService = {
      getEmail: vi.fn().mockResolvedValue(
        createEmail({
          bodyText: longBody,
          unsubscribe: { oneClick: true, http: 'https://example.com/u?id=1' },
        }),
      ),
    } as unknown as ImapService;

    registerEmailsTools(server, imapService);

    const response = await getHandler(
      server,
      'get_emails',
    )({
      account: 'test',
      ids: ['2'],
      mailbox: 'INBOX',
      format: 'text',
      maxLength: 100,
    });

    const { text } = response.content[0];
    expect(text).toContain('Unsubscribe: one-click=yes  http=https://example.com/u?id=1');
    // Body was actually truncated, proving the line survives independently of body size.
    expect(text).toContain('more characters — increase maxLength');
  });

  it('omits absent reply metadata while keeping one blank line before the body', async () => {
    const server = createServer();
    const imapService = {
      getEmail: vi.fn().mockResolvedValue(
        createEmail({
          inReplyTo: undefined,
          references: [],
        }),
      ),
    } as unknown as ImapService;

    registerEmailsTools(server, imapService);

    const response = await getHandler(
      server,
      'get_emails',
    )({
      account: 'test',
      ids: ['2'],
      mailbox: 'INBOX',
      format: 'text',
    });

    expect(response.content[0].text).not.toContain('In-Reply-To:');
    expect(response.content[0].text).not.toContain('References:');
    expect(response.content[0].text).toContain('Thread-ID: <root@example.com>\n\nBody text');
  });
});
