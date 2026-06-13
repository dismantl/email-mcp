/**
 * Parses RFC 2369 / RFC 8058 List-Unsubscribe headers into an actionable target.
 *
 * Surfacing this lets downstream consumers act on a real unsubscribe target
 * instead of inferring one from body text. "One-click" (RFC 8058) is only
 * genuine when an HTTP(S) target exists AND List-Unsubscribe-Post advertises it;
 * a mailto-only or directive-less header is a manual unsubscribe, not one-click.
 */

export interface ParsedUnsubscribe {
  /** True only when an http(s) target exists AND List-Unsubscribe-Post advertises one-click (RFC 8058). */
  oneClick: boolean;
  /** First http(s) unsubscribe URI, verbatim. */
  http?: string;
  /** First mailto: unsubscribe URI, verbatim (scheme and query preserved). */
  mailto?: string;
}

const ANGLE_URI_RE = /<([^>]+)>/g;
const ONE_CLICK_RE = /list-unsubscribe\s*=\s*one-click/i;
const HTTP_RE = /^https?:\/\//i;
const MAILTO_RE = /^mailto:/i;

function extractUris(raw: string): string[] {
  const bracketed = [...raw.matchAll(ANGLE_URI_RE)].map((match) => match[1].trim()).filter(Boolean);
  if (bracketed.length > 0) return bracketed;
  // Some senders omit angle brackets; fall back to the bare header value.
  const bare = raw.trim();
  return bare ? [bare] : [];
}

export function parseListUnsubscribe(
  headers: Record<string, string>,
): ParsedUnsubscribe | undefined {
  const raw = headers['list-unsubscribe'];
  if (!raw) return undefined;

  const uris = extractUris(raw);
  const http = uris.find((uri) => HTTP_RE.test(uri));
  const mailto = uris.find((uri) => MAILTO_RE.test(uri));
  if (!http && !mailto) return undefined;

  const oneClick = Boolean(http) && ONE_CLICK_RE.test(headers['list-unsubscribe-post'] ?? '');

  return { oneClick, ...(http ? { http } : {}), ...(mailto ? { mailto } : {}) };
}
