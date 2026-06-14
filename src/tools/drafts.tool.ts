/**
 * MCP tools: save_draft, send_draft
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import audit from '../safety/audit.js';
import type ImapService from '../services/imap.service.js';
import type SmtpService from '../services/smtp.service.js';
import emailAddress from '../utils/email-address.js';

const uidValiditySchema = z
  .union([z.string().min(1), z.number()])
  .transform((value) => value.toString())
  .describe('Mailbox UIDVALIDITY captured with the draft UID');

export default function registerDraftTools(
  server: McpServer,
  imapService: ImapService,
  smtpService: SmtpService,
): void {
  // ---------------------------------------------------------------------------
  // save_draft
  // ---------------------------------------------------------------------------
  server.tool(
    'save_draft',
    'Save an email draft to the Drafts folder. Compose over time, then use send_draft to send it. Use list_emails with the Drafts mailbox to see saved drafts.',
    {
      account: z.string().describe('Account name from list_accounts'),
      to: z
        .array(emailAddress)
        .default([])
        .describe('Recipient email addresses (can be empty for drafts)'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body content'),
      cc: z.array(emailAddress).optional().describe('CC recipients'),
      bcc: z.array(emailAddress).optional().describe('BCC recipients'),
      html: z.boolean().default(false).describe('Send as HTML (default: plain text)'),
      in_reply_to: z.string().optional().describe('Message-ID for threading (from get_email)'),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ account, to, subject, body, cc, bcc, html, in_reply_to: inReplyTo }) => {
      try {
        const result = await imapService.saveDraft(account, {
          to,
          subject,
          body,
          cc,
          bcc,
          html,
          inReplyTo,
        });

        await audit.log('save_draft', account, { to, subject }, 'ok');

        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `📝 Draft saved (ID: ${result.id}, folder: ${result.mailbox}).`,
                result.uidValidity ? `UIDVALIDITY: ${result.uidValidity}` : undefined,
              ]
                .filter((line): line is string => Boolean(line))
                .join('\n'),
            },
          ],
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await audit.log('save_draft', account, { to, subject }, 'error', errMsg);
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Failed to save draft: ${errMsg}`,
            },
          ],
        };
      }
    },
  );

  // ---------------------------------------------------------------------------
  // send_draft
  // ---------------------------------------------------------------------------
  server.tool(
    'send_draft',
    'Send an existing draft email and remove it from Drafts. The draft is fetched, sent via SMTP, then deleted. Use list_emails with the Drafts mailbox to find draft IDs.',
    {
      account: z.string().describe('Account name from list_accounts'),
      id: z.number().int().describe('Draft email UID (from list_emails on Drafts mailbox)'),
      uidValidity: uidValiditySchema,
      mailbox: z.string().optional().describe('Drafts folder path (auto-detected if omitted)'),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ account, id, uidValidity, mailbox }) => {
      try {
        const result = await smtpService.sendDraft(account, id, uidValidity, mailbox);

        await audit.log('send_draft', account, { id, mailbox, uidValidity }, 'ok');

        return {
          content: [
            {
              type: 'text' as const,
              text: `✅ Draft sent (Message-ID: ${result.messageId}). Draft removed from folder.`,
            },
          ],
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await audit.log('send_draft', account, { id, mailbox, uidValidity }, 'error', errMsg);
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Failed to send draft: ${errMsg}`,
            },
          ],
        };
      }
    },
  );
}
