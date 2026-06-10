import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import audit from '../safety/audit.js';
import type ImapService from '../services/imap.service.js';
import registerManageTools from './manage.tool.js';

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

describe('registerManageTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires UIDVALIDITY for move_email and passes it to the IMAP service', async () => {
    const server = createServer();
    const imapService = {
      moveEmail: vi.fn().mockResolvedValue(undefined),
    } as unknown as ImapService;

    registerManageTools(server, imapService);

    const schema = getToolCall(server, 'move_email')[2] as Record<string, unknown>;
    expect(schema).toHaveProperty('uidValidity');

    const response = await getHandler(
      server,
      'move_email',
    )({
      account: 'test',
      emailId: '42',
      sourceMailbox: 'INBOX',
      destinationMailbox: 'Archive',
      uidValidity: '12345',
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.moveEmail).toHaveBeenCalledWith('test', '42', 'INBOX', 'Archive', '12345');
    expect(audit.log).toHaveBeenCalledWith(
      'move_email',
      'test',
      {
        emailId: '42',
        sourceMailbox: 'INBOX',
        destinationMailbox: 'Archive',
        uidValidity: '12345',
      },
      'ok',
    );
  });

  it('requires UIDVALIDITY for delete_email and passes it to the IMAP service', async () => {
    const server = createServer();
    const imapService = {
      deleteEmail: vi.fn().mockResolvedValue(undefined),
    } as unknown as ImapService;

    registerManageTools(server, imapService);

    const schema = getToolCall(server, 'delete_email')[2] as Record<string, unknown>;
    expect(schema).toHaveProperty('uidValidity');

    const response = await getHandler(
      server,
      'delete_email',
    )({
      account: 'test',
      emailId: '42',
      mailbox: 'INBOX',
      permanent: true,
      uidValidity: '12345',
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.deleteEmail).toHaveBeenCalledWith('test', '42', 'INBOX', true, '12345');
    expect(audit.log).toHaveBeenCalledWith(
      'delete_email',
      'test',
      {
        emailId: '42',
        mailbox: 'INBOX',
        permanent: true,
        uidValidity: '12345',
      },
      'ok',
    );
  });

  it('requires UIDVALIDITY for mark_email and passes it to the IMAP service', async () => {
    const server = createServer();
    const imapService = {
      setFlags: vi.fn().mockResolvedValue(undefined),
    } as unknown as ImapService;

    registerManageTools(server, imapService);

    const schema = getToolCall(server, 'mark_email')[2] as Record<string, unknown>;
    expect(schema).toHaveProperty('uidValidity');

    const response = await getHandler(
      server,
      'mark_email',
    )({
      account: 'test',
      id: '42',
      mailbox: 'INBOX',
      action: 'read',
      uidValidity: '12345',
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.setFlags).toHaveBeenCalledWith('test', '42', 'INBOX', 'read', '12345');
    expect(audit.log).toHaveBeenCalledWith(
      'mark_email',
      'test',
      {
        id: '42',
        mailbox: 'INBOX',
        action: 'read',
        uidValidity: '12345',
      },
      'ok',
    );
  });
});
