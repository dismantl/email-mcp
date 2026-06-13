import type { ParsedUnsubscribe } from '../types/index.js';

// Canonical definition lives in types/ (referenced by Email); re-exported here so
// consumers can import the parser's result type alongside the parser.
export type { ParsedUnsubscribe };

/**
 * Parses RFC 2369 / RFC 8058 List-Unsubscribe headers into an actionable target.
 *
 * Surfacing this lets downstream consumers act on a real unsubscribe target
 * instead of inferring one from body text. "One-click" (RFC 8058) is only
 * genuine when an HTTP(S) target exists AND List-Unsubscribe-Post advertises it;
 * a mailto-only or directive-less header is a manual unsubscribe, not one-click.
 *
 * List-Unsubscribe is attacker-controlled email content, so a URI is surfaced
 * only when it parses as a real URL of the expected scheme and carries no
 * internal whitespace (which a valid angle-bracketed URI never does, and which
 * keeps the rendered Unsubscribe line unspoofable).
 */

const ANGLE_URI_RE = /<([^>]+)>/g;
const ONE_CLICK_RE = /list-unsubscribe\s*=\s*one-click/i;

function extractUris(raw: string): string[] {
  const bracketed = [...raw.matchAll(ANGLE_URI_RE)].map((match) => match[1].trim()).filter(Boolean);
  if (bracketed.length > 0) return bracketed;
  // Some senders omit angle brackets; fall back to the bare header value.
  const bare = raw.trim();
  return bare ? [bare] : [];
}

function uriOfScheme(uri: string, schemes: readonly string[]): boolean {
  if (/\s/.test(uri)) return false;
  try {
    return schemes.includes(new URL(uri).protocol);
  } catch {
    return false;
  }
}

export function parseListUnsubscribe(
  headers: Record<string, string>,
): ParsedUnsubscribe | undefined {
  const raw = headers['list-unsubscribe'];
  if (!raw) return undefined;

  const uris = extractUris(raw);
  // Prefer https so a header listing http before https still yields a one-click-capable target.
  const http =
    uris.find((uri) => uriOfScheme(uri, ['https:'])) ??
    uris.find((uri) => uriOfScheme(uri, ['http:']));
  const mailto = uris.find((uri) => uriOfScheme(uri, ['mailto:']));
  if (!http && !mailto) return undefined;

  // RFC 8058 one-click POST is defined only over HTTPS; a cleartext http target
  // (or mailto-only) is a manual unsubscribe even if List-Unsubscribe-Post claims one-click.
  const oneClick =
    http !== undefined &&
    uriOfScheme(http, ['https:']) &&
    ONE_CLICK_RE.test(headers['list-unsubscribe-post'] ?? '');

  return { oneClick, ...(http ? { http } : {}), ...(mailto ? { mailto } : {}) };
}
