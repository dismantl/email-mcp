import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type ImapService from '../services/imap.service.js';
import type SmtpService from '../services/smtp.service.js';
import registerDraftTools from './drafts.tool.js';
import registerSendTools from './send.tool.js';

vi.mock('../safety/audit.js', () => ({
  default: { log: vi.fn().mockResolvedValue(undefined) },
}));

// Registers the email-sending tools against a stub server and returns each
// tool's advertised input shape (name -> Zod raw shape). Services are only
// touched inside handlers, so stubs suffice for schema inspection.
function registerEmailToolShapes(): Map<string, z.ZodRawShape> {
  const shapes = new Map<string, z.ZodRawShape>();
  const server = {
    tool: vi.fn((name: string, _description: string, shape: z.ZodRawShape) => {
      shapes.set(name, shape);
    }),
  } as unknown as McpServer;

  registerSendTools(server, {} as SmtpService);
  registerDraftTools(server, {} as ImapService, {} as SmtpService);
  return shapes;
}

// Convert a shape exactly as the MCP SDK does on the wire (Zod v4 toJSONSchema,
// draft-7, input side) so the assertion sees the bytes a model provider sees.
function advertisedSchema(shape: z.ZodRawShape): unknown {
  return z.toJSONSchema(z.object(shape), { target: 'draft-7', io: 'input' });
}

// OpenAI's tool/function schema validation is backed by RE2, which rejects regex
// lookaround in `pattern`. Advertising one makes every model request carrying the
// tool fail ("regex lookaround is not supported"). `z.string().email()` emits
// exactly such a pattern, so this guards every recipient field — and any field
// added later — against regressing to it.
const LOOKAROUND = /\(\?[=!<]/;

describe('email tool schemas advertised to model providers', () => {
  it('never advertise a regex-lookaround pattern', () => {
    const shapes = registerEmailToolShapes();
    expect(shapes.size).toBeGreaterThan(0);

    for (const [name, shape] of shapes) {
      const advertised = JSON.stringify(advertisedSchema(shape));
      expect(advertised, `${name} advertises a lookaround pattern`).not.toMatch(LOOKAROUND);
    }
  });

  it('keep an email validation pattern on recipient fields', () => {
    const shapes = registerEmailToolShapes();
    for (const [tool, field] of [
      ['send_email', 'to'],
      ['forward_email', 'to'],
      ['save_draft', 'to'],
    ] as const) {
      const shape = shapes.get(tool);
      expect(shape, `${tool} registered`).toBeDefined();
      const json = advertisedSchema({ [field]: (shape as z.ZodRawShape)[field] }) as {
        properties?: Record<string, { items?: { pattern?: string } }>;
      };
      expect(json.properties?.[field]?.items?.pattern, `${tool}.${field} pattern`).toBeTruthy();
    }
  });
});
