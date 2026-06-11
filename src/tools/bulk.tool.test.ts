import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import audit from '../safety/audit.js';
import type ImapService from '../services/imap.service.js';
import registerBulkTools from './bulk.tool.js';

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

describe('registerBulkTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires UIDVALIDITY for bulk_action and passes it to bulk flag operations', async () => {
    const server = createServer();
    const imapService = {
      bulkSetFlags: vi.fn().mockResolvedValue({ total: 2, succeeded: 2, failed: 0 }),
    } as unknown as ImapService;

    registerBulkTools(server, imapService);

    const schema = getToolCall(server, 'bulk_action')[2] as Record<string, unknown>;
    expect(schema).toHaveProperty('uidValidity');

    const response = await getHandler(
      server,
      'bulk_action',
    )({
      account: 'test',
      mailbox: 'INBOX',
      action: 'mark_read',
      ids: [10, 11],
      uidValidity: '12345',
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.bulkSetFlags).toHaveBeenCalledWith(
      'test',
      [10, 11],
      'INBOX',
      'mark_read',
      '12345',
    );
    expect(audit.log).toHaveBeenCalledWith(
      'bulk_action',
      'test',
      {
        mailbox: 'INBOX',
        action: 'mark_read',
        ids: 2,
        destination: undefined,
        uidValidity: '12345',
      },
      'ok',
    );
  });

  it('passes UIDVALIDITY to bulk move operations', async () => {
    const server = createServer();
    const imapService = {
      bulkMove: vi.fn().mockResolvedValue({ total: 2, succeeded: 2, failed: 0 }),
    } as unknown as ImapService;

    registerBulkTools(server, imapService);

    const response = await getHandler(
      server,
      'bulk_action',
    )({
      account: 'test',
      mailbox: 'INBOX',
      action: 'move',
      ids: [10, 11],
      destination: 'Archive',
      uidValidity: '12345',
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.bulkMove).toHaveBeenCalledWith(
      'test',
      [10, 11],
      'INBOX',
      'Archive',
      '12345',
    );
  });
});
