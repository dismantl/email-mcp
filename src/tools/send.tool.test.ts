import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import audit from '../safety/audit.js';
import type SmtpService from '../services/smtp.service.js';
import registerSendTools from './send.tool.js';

vi.mock('../safety/audit.js', () => ({
  default: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

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

describe('registerSendTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires UIDVALIDITY for reply_email and passes it to the SMTP service', async () => {
    const server = createServer();
    const smtpService = {
      replyToEmail: vi.fn().mockResolvedValue({ messageId: '<reply@example.com>', status: 'sent' }),
    } as unknown as SmtpService;

    registerSendTools(server, smtpService);

    const schema = getToolCall(server, 'reply_email')[2] as Record<string, unknown>;
    expect(schema).toHaveProperty('uidValidity');

    const response = await getHandler(
      server,
      'reply_email',
    )({
      account: 'test',
      emailId: '42',
      uidValidity: '12345',
      mailbox: 'INBOX',
      body: 'Thanks',
      replyAll: false,
      html: false,
    });

    expect(response.isError).toBeUndefined();
    expect(smtpService.replyToEmail).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({
        emailId: '42',
        uidValidity: '12345',
        mailbox: 'INBOX',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      'reply_email',
      'test',
      { emailId: '42', mailbox: 'INBOX', uidValidity: '12345' },
      'ok',
    );
  });

  it('requires UIDVALIDITY for forward_email and passes it to the SMTP service', async () => {
    const server = createServer();
    const smtpService = {
      forwardEmail: vi
        .fn()
        .mockResolvedValue({ messageId: '<forward@example.com>', status: 'sent' }),
    } as unknown as SmtpService;

    registerSendTools(server, smtpService);

    const schema = getToolCall(server, 'forward_email')[2] as Record<string, unknown>;
    expect(schema).toHaveProperty('uidValidity');

    const response = await getHandler(
      server,
      'forward_email',
    )({
      account: 'test',
      emailId: '42',
      uidValidity: '12345',
      mailbox: 'INBOX',
      to: ['recipient@example.com'],
      body: 'FYI',
    });

    expect(response.isError).toBeUndefined();
    expect(smtpService.forwardEmail).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({
        emailId: '42',
        uidValidity: '12345',
        mailbox: 'INBOX',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      'forward_email',
      'test',
      { to: ['recipient@example.com'], emailId: '42', uidValidity: '12345' },
      'ok',
    );
  });
});
