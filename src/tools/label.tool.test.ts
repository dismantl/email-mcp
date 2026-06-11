import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import audit from '../safety/audit.js';
import type ImapService from '../services/imap.service.js';
import registerLabelTools from './label.tool.js';

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

describe('registerLabelTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires UIDVALIDITY for add_label and passes it to the IMAP service', async () => {
    const server = createServer();
    const imapService = {
      addLabel: vi.fn().mockResolvedValue(undefined),
    } as unknown as ImapService;

    registerLabelTools(server, imapService);

    const schema = getToolCall(server, 'add_label')[2] as Record<string, unknown>;
    expect(schema).toHaveProperty('uidValidity');

    const response = await getHandler(
      server,
      'add_label',
    )({
      account: 'test',
      emailId: '42',
      mailbox: 'INBOX',
      label: 'Project',
      uidValidity: '12345',
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.addLabel).toHaveBeenCalledWith('test', '42', 'INBOX', 'Project', '12345');
    expect(audit.log).toHaveBeenCalledWith(
      'add_label',
      'test',
      { emailId: '42', mailbox: 'INBOX', label: 'Project', uidValidity: '12345' },
      'ok',
    );
  });

  it('requires UIDVALIDITY for remove_label and passes it to the IMAP service', async () => {
    const server = createServer();
    const imapService = {
      removeLabel: vi.fn().mockResolvedValue(undefined),
    } as unknown as ImapService;

    registerLabelTools(server, imapService);

    const schema = getToolCall(server, 'remove_label')[2] as Record<string, unknown>;
    expect(schema).toHaveProperty('uidValidity');

    const response = await getHandler(
      server,
      'remove_label',
    )({
      account: 'test',
      emailId: '42',
      mailbox: 'INBOX',
      label: 'Project',
      uidValidity: '12345',
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.removeLabel).toHaveBeenCalledWith('test', '42', 'INBOX', 'Project', '12345');
    expect(audit.log).toHaveBeenCalledWith(
      'remove_label',
      'test',
      { emailId: '42', mailbox: 'INBOX', label: 'Project', uidValidity: '12345' },
      'ok',
    );
  });
});
