/**
 * MCP tool: bulk_action — batch operations on multiple emails.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import audit from '../safety/audit.js';

import type ImapService from '../services/imap.service.js';
import type { BulkResult } from '../types/index.js';

const uidValiditySchema = z
  .union([z.string().min(1), z.number()])
  .transform((value) => value.toString())
  .describe('Mailbox UIDVALIDITY captured with the email UIDs');

export default function registerBulkTools(server: McpServer, imapService: ImapService): void {
  server.tool(
    'bulk_action',
    'Batch operation on multiple emails by UID list. Supports mark_read, mark_unread, flag, unflag, move, and delete. Max 100 IDs per call. Returns success/failure counts.',
    {
      account: z.string().describe('Account name from list_accounts'),
      mailbox: z.string().default('INBOX').describe('Source mailbox containing the emails'),
      action: z
        .enum(['mark_read', 'mark_unread', 'flag', 'unflag', 'move', 'delete'])
        .describe('Bulk action to perform'),
      ids: z
        .array(z.number().int())
        .min(1)
        .max(100)
        .describe('Array of email UIDs (max 100). Get UIDs from list_emails or search_emails.'),
      uidValidity: uidValiditySchema,
      destination: z
        .string()
        .optional()
        .describe("Destination mailbox — required when action is 'move'"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ account, mailbox, action, ids, uidValidity, destination }) => {
      try {
        if (action === 'move' && !destination) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Destination mailbox is required for "move" action.`,
              },
            ],
          };
        }

        let result: BulkResult;
        if (action === 'move') {
          result = await imapService.bulkMove(
            account,
            ids,
            mailbox,
            destination as string,
            uidValidity,
          );
        } else if (action === 'delete') {
          result = await imapService.bulkDelete(account, ids, mailbox, false, uidValidity);
        } else {
          result = await imapService.bulkSetFlags(account, ids, mailbox, action, uidValidity);
        }

        await audit.log(
          'bulk_action',
          account,
          {
            mailbox,
            action,
            ids: ids.length,
            destination,
            uidValidity,
          },
          'ok',
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await audit.log(
          'bulk_action',
          account,
          { mailbox, action, ids: ids.length, uidValidity },
          'error',
          errMsg,
        );
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Bulk action failed: ${errMsg}`,
            },
          ],
        };
      }
    },
  );
}
