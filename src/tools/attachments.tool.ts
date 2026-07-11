/**
 * MCP tool: download_attachment
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type ImapService from '../services/imap.service.js';

import { downloadAttachmentOutputSchema } from './output-schemas.js';

const TEXTUAL_MIME_TYPES = new Set(['application/json', 'application/xml']);

function isTextualMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith('text/') || TEXTUAL_MIME_TYPES.has(normalized);
}

/**
 * Decode base64 content as UTF-8, or return undefined when the bytes are not
 * valid UTF-8. A lossy decode would silently corrupt the content (U+FFFD
 * replacement) with no recovery path once the base64 form is withheld.
 */
function decodeUtf8Strict(contentBase64: string): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(contentBase64, 'base64'));
  } catch {
    return undefined;
  }
}

const uidValiditySchema = z
  .union([z.string().min(1), z.number()])
  .transform((value) => value.toString())
  .describe('Mailbox UIDVALIDITY captured with the email UID');

export default function registerAttachmentTools(server: McpServer, imapService: ImapService): void {
  server.registerTool(
    'download_attachment',
    {
      description:
        'Download an email attachment by filename. First use get_email to see available ' +
        'attachments and their filenames. Returns a JSON document with decoded `text` for ' +
        'text attachments (e.g. .ics calendar invites) or `contentBase64` for binary or ' +
        'non-UTF-8 files \u22645MB.',
      inputSchema: {
        account: z.string().describe('Account name from list_accounts'),
        id: z.string().describe('Email ID (UID) from list_emails or get_email'),
        mailbox: z.string().default('INBOX').describe('Mailbox containing the email'),
        filename: z.string().describe('Exact attachment filename (from get_email metadata)'),
        uidValidity: uidValiditySchema,
      },
      outputSchema: downloadAttachmentOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ account, id, mailbox, filename, uidValidity }) => {
      try {
        const result = await imapService.downloadAttachment(
          account,
          id,
          mailbox,
          filename,
          uidValidity,
        );

        // One self-contained JSON document (plus structuredContent for
        // protocol-aware clients): content delivered in a separate
        // prose-marker block is invisible to structured clients that parse
        // the first JSON text block. Text attachments are decoded so callers
        // (e.g. calendar-invite parsing) can consume them directly; content
        // that is not valid UTF-8 falls back to base64 rather than being
        // corrupted by a lossy decode.
        const text = isTextualMimeType(result.mimeType)
          ? decodeUtf8Strict(result.contentBase64)
          : undefined;
        const payload: z.infer<typeof downloadAttachmentOutputSchema> = {
          filename: result.filename,
          mimeType: result.mimeType,
          size: result.size,
          sizeHuman: `${Math.round(result.size / 1024)}KB`,
          ...(text !== undefined ? { text } : { contentBase64: result.contentBase64 }),
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
          structuredContent: payload,
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Failed to download attachment: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
