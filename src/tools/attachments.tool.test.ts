import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type ImapService from '../services/imap.service.js';
import registerAttachmentTools from './attachments.tool.js';

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

describe('registerAttachmentTools', () => {
  it('requires UIDVALIDITY for download_attachment and passes it to the IMAP service', async () => {
    const server = createServer();
    const imapService = {
      downloadAttachment: vi.fn().mockResolvedValue({
        filename: 'agenda.pdf',
        mimeType: 'application/pdf',
        size: 12,
        contentBase64: 'Y29udGVudA==',
      }),
    } as unknown as ImapService;

    registerAttachmentTools(server, imapService);

    const schema = getToolCall(server, 'download_attachment')[2] as Record<string, unknown>;
    expect(schema).toHaveProperty('uidValidity');

    const response = await getHandler(
      server,
      'download_attachment',
    )({
      account: 'test',
      id: '42',
      mailbox: 'INBOX',
      filename: 'agenda.pdf',
      uidValidity: '12345',
    });

    expect(response.isError).toBeUndefined();
    expect(imapService.downloadAttachment).toHaveBeenCalledWith(
      'test',
      '42',
      'INBOX',
      'agenda.pdf',
      undefined,
      '12345',
    );
  });
});
