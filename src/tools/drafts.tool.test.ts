import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type ImapService from '../services/imap.service.js';
import type SmtpService from '../services/smtp.service.js';
import registerDraftTools from './drafts.tool.js';

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

function getHandler(server: ReturnType<typeof createServer>, name: string): ToolHandler {
  const call = server.tool.mock.calls.find(([toolName]) => toolName === name);
  if (!call) throw new Error(`Tool not registered: ${name}`);
  return call[4] as ToolHandler;
}

describe('registerDraftTools', () => {
  it('returns UIDVALIDITY when saving a draft', async () => {
    const server = createServer();
    const imapService = {
      saveDraft: vi.fn().mockResolvedValue({ id: 42, mailbox: 'Drafts', uidValidity: '12345' }),
    } as unknown as ImapService;
    const smtpService = {} as unknown as SmtpService;

    registerDraftTools(server, imapService, smtpService);

    const response = await getHandler(
      server,
      'save_draft',
    )({
      account: 'test',
      to: ['recipient@example.com'],
      subject: 'Draft subject',
      body: 'Draft body',
      html: false,
    });

    expect(response.content[0].text).toContain('UIDVALIDITY: 12345');
  });

  it('passes UIDVALIDITY when sending a draft', async () => {
    const server = createServer();
    const imapService = {} as unknown as ImapService;
    const smtpService = {
      sendDraft: vi.fn().mockResolvedValue({ messageId: '<sent@example.com>', status: 'sent' }),
    } as unknown as SmtpService;

    registerDraftTools(server, imapService, smtpService);

    const response = await getHandler(
      server,
      'send_draft',
    )({
      account: 'test',
      id: 42,
      mailbox: 'Drafts',
      uidValidity: '12345',
    });

    expect(response.isError).toBeUndefined();
    expect(smtpService.sendDraft).toHaveBeenCalledWith('test', 42, '12345', 'Drafts');
  });
});
