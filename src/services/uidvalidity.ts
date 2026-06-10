import type { ImapFlow } from 'imapflow';

export function normalizeUidValidity(
  uidValidity: bigint | number | string | null | undefined,
): string | undefined {
  if (uidValidity === undefined || uidValidity === null) {
    return undefined;
  }
  return String(uidValidity);
}

export function currentMailboxUidValidity(client: ImapFlow, mailbox: string): string {
  const normalized = normalizeUidValidity(client.mailbox ? client.mailbox.uidValidity : undefined);
  if (normalized === undefined) {
    throw new Error(`Mailbox "${mailbox}" did not expose UIDVALIDITY.`);
  }
  return normalized;
}

export function assertMailboxUidValidity(
  client: ImapFlow,
  mailbox: string,
  expectedUidValidity: bigint | number | string,
): string {
  const expected = normalizeUidValidity(expectedUidValidity);
  if (expected === undefined || expected.length === 0) {
    throw new Error(`UIDVALIDITY is required for mailbox "${mailbox}".`);
  }

  const actual = currentMailboxUidValidity(client, mailbox);
  if (actual !== expected) {
    throw new Error(
      `UIDVALIDITY mismatch for mailbox "${mailbox}": expected ${expected}, got ${actual}.`,
    );
  }
  return actual;
}
