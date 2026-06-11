import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type ImapService from '../services/imap.service.js';
import registerLocateTools from './locate.tool.js';

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

describe('registerLocateTools', () => {
  it('requires UIDVALIDITY and passes it to folder lookup', async () => {
    const server = createServer();
    const imapService = {
      findEmailFolder: vi.fn().mockResolvedValue({
        folders: ['INBOX'],
        locations: [{ mailbox: 'INBOX', emailId: '77', uidValidity: '12345' }],
        messageId: '<message@example.com>',
      }),
    } as unknown as ImapService;

    registerLocateTools(server, imapService);

    const schema = getToolCall(server, 'find_email_folder')[2] as Record<string, unknown>;
    expect(schema).toHaveProperty('uidValidity');

    const response = await getHandler(
      server,
      'find_email_folder',
    )({
      account: 'test',
      emailId: '42',
      sourceMailbox: 'All Mail',
      uidValidity: '12345',
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.findEmailFolder).toHaveBeenCalledWith('test', '42', 'All Mail', '12345');
    expect(response.content[0].text).toContain('sourceMailbox: INBOX');
    expect(response.content[0].text).toContain('emailId: 77');
    expect(response.content[0].text).toContain('uidValidity: 12345');
  });
});
