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
});
