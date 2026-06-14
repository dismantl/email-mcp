import { z } from 'zod';
import emailAddress from './email-address.js';

describe('emailAddress', () => {
  it('accepts valid addresses', () => {
    for (const ok of ['a@b.com', 'dan@acab.enterprises', 'first.last+tag@sub.example.co.uk']) {
      expect(emailAddress.safeParse(ok).success).toBe(true);
    }
  });

  it('rejects obvious non-addresses', () => {
    for (const bad of ['', 'nope', 'no-at-sign.example', 'a@']) {
      expect(emailAddress.safeParse(bad).success).toBe(false);
    }
  });

  // Regression guard: the JSON Schema advertised to MCP clients must not contain
  // regex lookaround. OpenAI/RE2-backed tool-schema validation rejects such a
  // `pattern`, which silently disables every model call that carries a recipient
  // tool (send_email, save_draft, …). This converts the schema exactly as the
  // MCP SDK does on the wire (Zod v4 native toJSONSchema, io: 'input').
  it('emits a lookaround-free JSON Schema pattern (RE2-safe)', () => {
    const schema = z.object({ to: z.array(emailAddress).min(1) });
    const json = z.toJSONSchema(schema, { io: 'input' }) as {
      properties?: { to?: { items?: { pattern?: string } } };
    };
    const pattern = json.properties?.to?.items?.pattern ?? '';

    expect(pattern).not.toBe('');
    expect(pattern).not.toMatch(/\(\?[=!<]/);
  });
});
