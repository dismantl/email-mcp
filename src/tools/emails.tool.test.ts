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

function createEmailMeta(overrides: Partial<EmailMeta> = {}): EmailMeta {
  return {
    id: '2',
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
    expect(response.content[0].text).toContain(
      'References: <root@example.com> <parent@example.com>',
    );
  });
});
