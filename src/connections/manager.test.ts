import type { AccountConfig } from '../types/index.js';
import ConnectionManager from './manager.js';

function createAccount(name = 'test'): AccountConfig {
  return {
    name,
    email: `${name}@example.com`,
    username: `${name}@example.com`,
    password: 'secret',
    imap: { host: 'imap.example.com', port: 993, tls: true, starttls: false, verifySsl: true },
    smtp: { host: 'smtp.example.com', port: 465, tls: true, starttls: false, verifySsl: true },
  };
}

describe('ConnectionManager', () => {
  it('resetImapClient drops and closes the cached client', async () => {
    const close = vi.fn();
    const manager = new ConnectionManager([createAccount()]);
    const cache = (manager as unknown as { imapClients: Map<string, unknown> }).imapClients;

    cache.set('test', { usable: true, close });

    await manager.resetImapClient('test');

    expect(close).toHaveBeenCalledOnce();
    expect(cache.has('test')).toBe(false);
  });
});
