/**
 * MCP tool: download_attachment
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type ImapService from '../services/imap.service.js';

const TEXTUAL_MIME_TYPES = new Set(['application/json', 'application/xml']);

function isTextualMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || TEXTUAL_MIME_TYPES.has(mimeType.toLowerCase());
}

const uidValiditySchema = z
  .union([z.string().min(1), z.number()])
  .transform((value) => value.toString())
  .describe('Mailbox UIDVALIDITY captured with the email UID');

export default function registerAttachmentTools(server: McpServer, imapService: ImapService): void {
  server.tool(
    'download_attachment',
    'Download an email attachment by filename. First use get_email to see available attachments and their filenames. Returns a JSON document with decoded `text` for text attachments (e.g. .ics calendar invites) or `contentBase64` for binary files ≤5MB.',
    {
      account: z.string().describe('Account name from list_accounts'),
      id: z.string().describe('Email ID (UID) from list_emails or get_email'),
      mailbox: z.string().default('INBOX').describe('Mailbox containing the email'),
      filename: z.string().describe('Exact attachment filename (from get_email metadata)'),
      uidValidity: uidValiditySchema,
    },
    { readOnlyHint: true, destructiveHint: false },
    async ({ account, id, mailbox, filename, uidValidity }) => {
      try {
        const result = await imapService.downloadAttachment(
          account,
          id,
          mailbox,
          filename,
          uidValidity,
        );

        // One self-contained JSON document: structured clients parse the first
        // JSON text block, so content delivered in a separate prose-marker
        // block is invisible to them. Text attachments are decoded so callers
        // (e.g. calendar-invite parsing) can consume them directly.
        const payload: Record<string, unknown> = {
          filename: result.filename,
          mimeType: result.mimeType,
          size: result.size,
          sizeHuman: `${Math.round(result.size / 1024)}KB`,
        };
        if (isTextualMimeType(result.mimeType)) {
          payload.text = Buffer.from(result.contentBase64, 'base64').toString('utf-8');
        } else {
          payload.contentBase64 = result.contentBase64;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(payload, null, 2),
            },
          ],
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
