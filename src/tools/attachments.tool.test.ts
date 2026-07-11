import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type ImapService from '../services/imap.service.js';
import registerAttachmentTools from './attachments.tool.js';

type ToolHandler = (params: Record<string, unknown>) => Promise<{
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

function createServer() {
  return {
    registerTool: vi.fn(),
  } as unknown as McpServer & { registerTool: ReturnType<typeof vi.fn> };
}

function getToolCall(server: ReturnType<typeof createServer>, name: string) {
  const call = server.registerTool.mock.calls.find(([toolName]) => toolName === name);
  if (!call) throw new Error(`Tool not registered: ${name}`);
  return call;
}

function getHandler(server: ReturnType<typeof createServer>, name: string): ToolHandler {
  return getToolCall(server, name)[2] as ToolHandler;
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

    const config = getToolCall(server, 'download_attachment')[1] as Record<string, unknown>;
    expect(config.inputSchema).toHaveProperty('uidValidity');
    expect(config.outputSchema).toBeDefined();

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
      '12345',
    );
  });

  it('returns binary attachments as a single JSON document with contentBase64', async () => {
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

    // A single JSON block: content in a prose-marker second block is invisible
    // to structured clients that parse the first JSON document they find.
    expect(response.content).toHaveLength(1);
    const payload = JSON.parse(response.content[0].text) as Record<string, unknown>;
    expect(payload.contentBase64).toBe('Y29udGVudA==');
    expect(payload.text).toBeUndefined();
    expect(response.content[0].text).not.toContain('--- Base64 Content ---');
    expect(response.structuredContent).toEqual(payload);
  });

  it('decodes text attachments (e.g. .ics invites) into a text field', async () => {
    const ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR';
    const server = createServer();
    const imapService = {
      downloadAttachment: vi.fn().mockResolvedValue({
        filename: 'appointment.ics',
        mimeType: 'text/calendar',
        size: ics.length,
        contentBase64: Buffer.from(ics, 'utf-8').toString('base64'),
      }),
    } as unknown as ImapService;

    registerAttachmentTools(server, imapService);

    const response = await getHandler(
      server,
      'download_attachment',
    )({
      account: 'test',
      id: '42',
      mailbox: 'INBOX',
      filename: 'appointment.ics',
      uidValidity: '12345',
    });

    expect(response.content).toHaveLength(1);
    const payload = JSON.parse(response.content[0].text) as Record<string, unknown>;
    expect(payload.text).toBe(ics);
    expect(payload.contentBase64).toBeUndefined();
    expect(payload.mimeType).toBe('text/calendar');
    expect(response.structuredContent).toEqual(payload);
  });

  it('handles uppercase text mimetypes case-insensitively', async () => {
    const server = createServer();
    const imapService = {
      downloadAttachment: vi.fn().mockResolvedValue({
        filename: 'notes.txt',
        mimeType: 'TEXT/PLAIN',
        size: 5,
        contentBase64: Buffer.from('hello', 'utf-8').toString('base64'),
      }),
    } as unknown as ImapService;

    registerAttachmentTools(server, imapService);

    const response = await getHandler(
      server,
      'download_attachment',
    )({
      account: 'test',
      id: '42',
      mailbox: 'INBOX',
      filename: 'notes.txt',
      uidValidity: '12345',
    });

    const payload = JSON.parse(response.content[0].text) as Record<string, unknown>;
    expect(payload.text).toBe('hello');
    expect(payload.contentBase64).toBeUndefined();
  });

  it('treats structured-syntax suffixes (+json/+xml) as textual', async () => {
    const body = '<calendar/>';
    const server = createServer();
    const imapService = {
      downloadAttachment: vi.fn().mockResolvedValue({
        filename: 'invite.xml',
        mimeType: 'application/soap+xml',
        size: body.length,
        contentBase64: Buffer.from(body, 'utf-8').toString('base64'),
      }),
    } as unknown as ImapService;

    registerAttachmentTools(server, imapService);

    const response = await getHandler(
      server,
      'download_attachment',
    )({
      account: 'test',
      id: '42',
      mailbox: 'INBOX',
      filename: 'invite.xml',
      uidValidity: '12345',
    });

    const payload = JSON.parse(response.content[0].text) as Record<string, unknown>;
    expect(payload.text).toBe(body);
    expect(payload.contentBase64).toBeUndefined();
  });

  it('falls back to contentBase64 when a text attachment is not valid UTF-8', async () => {
    // 0xFF 0xFE is not decodable as UTF-8; a lossy decode would emit U+FFFD
    // and lose the original bytes with no recovery path.
    const invalidUtf8 = Buffer.from([0xff, 0xfe, 0x41]).toString('base64');
    const server = createServer();
    const imapService = {
      downloadAttachment: vi.fn().mockResolvedValue({
        filename: 'legacy.txt',
        mimeType: 'text/plain',
        size: 3,
        contentBase64: invalidUtf8,
      }),
    } as unknown as ImapService;

    registerAttachmentTools(server, imapService);

    const response = await getHandler(
      server,
      'download_attachment',
    )({
      account: 'test',
      id: '42',
      mailbox: 'INBOX',
      filename: 'legacy.txt',
      uidValidity: '12345',
    });

    const payload = JSON.parse(response.content[0].text) as Record<string, unknown>;
    expect(payload.contentBase64).toBe(invalidUtf8);
    expect(payload.text).toBeUndefined();
  });
});
