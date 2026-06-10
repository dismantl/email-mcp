import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type CalendarService from '../services/calendar.service.js';
import type ImapService from '../services/imap.service.js';
import type LocalCalendarService from '../services/local-calendar.service.js';
import type RemindersService from '../services/reminders.service.js';
import registerCalendarTools from './calendar.tool.js';

type ToolHandler = (params: Record<string, unknown>) => Promise<{
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}>;

function createServer() {
  return {
    tool: vi.fn(),
  } as unknown as McpServer & { tool: ReturnType<typeof vi.fn> };
}

function getToolCall(server: ReturnType<typeof createServer>, name: string) {
  const call = server.tool.mock.calls.find(([toolName]) => toolName === name);
  if (!call) throw new Error(`Tool not registered: ${name}`);
  return call;
}

function getHandler(server: ReturnType<typeof createServer>, name: string): ToolHandler {
  return getToolCall(server, name)[4] as ToolHandler;
}

function createMockEmail() {
  return {
    id: '42',
    uidValidity: '12345',
    subject: 'Planning',
    from: { name: 'Sender', address: 'sender@example.com' },
    to: [],
    date: '2026-06-10T12:00:00.000Z',
    messageId: '<message@example.com>',
    threadId: '<message@example.com>',
    seen: false,
    flagged: false,
    answered: false,
    hasAttachments: false,
    labels: [],
    bodyText: 'Please follow up.',
    bodyHtml: '',
    attachments: [],
    headers: {},
  };
}

describe('registerCalendarTools', () => {
  it('requires UIDVALIDITY for email-backed calendar and reminder tools', () => {
    const server = createServer();

    registerCalendarTools(
      server,
      {} as ImapService,
      {} as CalendarService,
      {} as LocalCalendarService,
      {} as RemindersService,
    );

    expect(getToolCall(server, 'extract_calendar')[2]).toHaveProperty('uidValidity');
    expect(getToolCall(server, 'add_to_calendar')[2]).toHaveProperty('uidValidity');
    expect(getToolCall(server, 'create_reminder')[2]).toHaveProperty('uidValidity');
    expect(getToolCall(server, 'analyze_email_for_scheduling')[2]).toHaveProperty('uidValidity');
  });

  it('passes UIDVALIDITY to calendar extraction IMAP fetches', async () => {
    const server = createServer();
    const imapService = {
      getEmail: vi.fn().mockResolvedValue(createMockEmail()),
      getCalendarParts: vi.fn().mockResolvedValue([]),
    } as unknown as ImapService;
    const calendarService = {
      extractFromParts: vi.fn(),
    } as unknown as CalendarService;

    registerCalendarTools(
      server,
      imapService,
      calendarService,
      {} as LocalCalendarService,
      {} as RemindersService,
    );

    const response = await getHandler(
      server,
      'extract_calendar',
    )({
      account: 'test',
      email_id: '42',
      mailbox: 'INBOX',
      uidValidity: '12345',
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.getEmail).toHaveBeenCalledWith('test', '42', 'INBOX', '12345');
    expect(imapService.getCalendarParts).toHaveBeenCalledWith('test', 'INBOX', '42', '12345');
  });

  it('passes UIDVALIDITY to reminder email fetches', async () => {
    const server = createServer();
    const imapService = {
      getEmail: vi.fn().mockResolvedValue(createMockEmail()),
    } as unknown as ImapService;
    const remindersService = {
      addReminder: vi.fn().mockResolvedValue({ status: 'added' }),
    } as unknown as RemindersService;

    registerCalendarTools(
      server,
      imapService,
      {} as CalendarService,
      {} as LocalCalendarService,
      remindersService,
    );

    const response = await getHandler(
      server,
      'create_reminder',
    )({
      account: 'test',
      email_id: '42',
      mailbox: 'INBOX',
      uidValidity: '12345',
      priority: 'none',
      confirm: false,
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.getEmail).toHaveBeenCalledWith('test', '42', 'INBOX', '12345');
  });
});
