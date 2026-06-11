import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import registerCleanupPrompt from './cleanup.prompt.js';

type PromptHandler = (params: Record<string, string>) => Promise<{
  messages: { role: 'user'; content: { type: 'text'; text: string } }[];
}>;

function createServer() {
  return {
    prompt: vi.fn(),
  } as unknown as McpServer & { prompt: ReturnType<typeof vi.fn> };
}

function getHandler(server: ReturnType<typeof createServer>, name: string): PromptHandler {
  const call = server.prompt.mock.calls.find(([promptName]) => promptName === name);
  if (!call) throw new Error(`Prompt not registered: ${name}`);
  return call[3] as PromptHandler;
}

describe('registerCleanupPrompt', () => {
  it('tells execute-mode cleanup to carry UIDVALIDITY into bulk actions', async () => {
    const server = createServer();
    registerCleanupPrompt(server);

    const response = await getHandler(
      server,
      'cleanup_inbox',
    )({
      account: 'test',
      older_than_days: '30',
      dry_run: 'false',
    });

    const {
      content: { text },
    } = response.messages[0];
    expect(text).toContain('uidValidity');
    expect(text).toContain('Group');
    expect(text).toContain('bulk_action');
  });
});
