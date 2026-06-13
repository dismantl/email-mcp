import { parseListUnsubscribe } from './list-unsubscribe.js';

describe('parseListUnsubscribe', () => {
  it('returns undefined when no List-Unsubscribe header is present', () => {
    expect(parseListUnsubscribe({})).toBeUndefined();
    expect(parseListUnsubscribe({ subject: 'hi' })).toBeUndefined();
  });

  it('extracts an https target', () => {
    const result = parseListUnsubscribe({
      'list-unsubscribe': '<https://example.com/unsub?id=123>',
    });
    expect(result).toEqual({ oneClick: false, http: 'https://example.com/unsub?id=123' });
  });

  it('extracts a mailto target, preserving the full URI', () => {
    const result = parseListUnsubscribe({
      'list-unsubscribe': '<mailto:unsub@example.com?subject=unsubscribe>',
    });
    expect(result).toEqual({
      oneClick: false,
      mailto: 'mailto:unsub@example.com?subject=unsubscribe',
    });
  });

  it('extracts both http and mailto, preferring the first of each', () => {
    const result = parseListUnsubscribe({
      'list-unsubscribe':
        '<https://example.com/u?id=1>, <https://example.com/u?id=2>, <mailto:a@example.com>, <mailto:b@example.com>',
    });
    expect(result).toEqual({
      oneClick: false,
      http: 'https://example.com/u?id=1',
      mailto: 'mailto:a@example.com',
    });
  });

  it('marks one-click only when List-Unsubscribe-Post advertises it AND an http target exists', () => {
    const result = parseListUnsubscribe({
      'list-unsubscribe': '<https://example.com/u?id=1>, <mailto:a@example.com>',
      'list-unsubscribe-post': 'List-Unsubscribe=One-Click',
    });
    expect(result).toEqual({
      oneClick: true,
      http: 'https://example.com/u?id=1',
      mailto: 'mailto:a@example.com',
    });
  });

  it('is case- and whitespace-insensitive for the one-click post directive', () => {
    const result = parseListUnsubscribe({
      'list-unsubscribe': '<https://example.com/u>',
      'list-unsubscribe-post': 'list-unsubscribe = one-click',
    });
    expect(result?.oneClick).toBe(true);
  });

  it('prefers an https target over a cleartext http one regardless of header order', () => {
    const result = parseListUnsubscribe({
      'list-unsubscribe': '<http://example.com/u>, <https://example.com/u>',
      'list-unsubscribe-post': 'List-Unsubscribe=One-Click',
    });
    expect(result).toEqual({ oneClick: true, http: 'https://example.com/u' });
  });

  it('does not claim one-click for a cleartext http target (RFC 8058 requires https)', () => {
    const result = parseListUnsubscribe({
      'list-unsubscribe': '<http://example.com/u>',
      'list-unsubscribe-post': 'List-Unsubscribe=One-Click',
    });
    // The http link is still surfaced, but it is not a valid one-click POST target.
    expect(result).toEqual({ oneClick: false, http: 'http://example.com/u' });
  });

  it('does not claim one-click when only a mailto target exists', () => {
    const result = parseListUnsubscribe({
      'list-unsubscribe': '<mailto:a@example.com>',
      'list-unsubscribe-post': 'List-Unsubscribe=One-Click',
    });
    expect(result).toEqual({ oneClick: false, mailto: 'mailto:a@example.com' });
  });

  it('handles a folded/multi-URI header value (already unfolded to one line)', () => {
    // parseEmailHeaders unfolds continuation lines into a single space-joined value.
    const result = parseListUnsubscribe({
      'list-unsubscribe': '<https://example.com/u?id=1> , <mailto:a@example.com>',
    });
    expect(result?.http).toBe('https://example.com/u?id=1');
    expect(result?.mailto).toBe('mailto:a@example.com');
  });

  it('falls back to a bare (bracketless) URI', () => {
    const result = parseListUnsubscribe({
      'list-unsubscribe': 'https://example.com/unsub',
    });
    expect(result).toEqual({ oneClick: false, http: 'https://example.com/unsub' });
  });

  it('returns undefined when the header has no usable http or mailto URI', () => {
    expect(parseListUnsubscribe({ 'list-unsubscribe': '<ftp://example.com/u>' })).toBeUndefined();
    expect(parseListUnsubscribe({ 'list-unsubscribe': '<>' })).toBeUndefined();
  });

  it('rejects a non-URL value that only prefix-matches a scheme', () => {
    // Guards against treating crafted/garbage header content as an authoritative target.
    expect(parseListUnsubscribe({ 'list-unsubscribe': '<https://>' })).toBeUndefined();
    expect(parseListUnsubscribe({ 'list-unsubscribe': '<https:// not a url>' })).toBeUndefined();
  });

  it('rejects a URI containing internal whitespace (malformed / spoof-resistant)', () => {
    const result = parseListUnsubscribe({
      'list-unsubscribe': '<https://example.com/u  spoof>, <mailto:a@example.com>',
    });
    // The whitespace http URI is dropped; the clean mailto still resolves.
    expect(result).toEqual({ oneClick: false, mailto: 'mailto:a@example.com' });
  });
});
