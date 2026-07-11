import { z } from 'zod';

import type { Email, EmailMeta } from '../types/index.js';

export const emailAddressSchema = z.object({
  name: z.string().optional(),
  address: z.string(),
});

export const emailSummarySchema = z.object({
  id: z.string(),
  mailbox: z.string(),
  uidValidity: z.string(),
  messageId: z.string(),
  threadId: z.string(),
  subject: z.string(),
  from: emailAddressSchema,
  date: z.string(),
  seen: z.boolean(),
  flagged: z.boolean(),
  answered: z.boolean(),
  hasAttachments: z.boolean(),
  labels: z.array(z.string()),
  preview: z.string().optional(),
});

export const listEmailsOutputSchema = z.object({
  mailbox: z.string(),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  emails: z.array(emailSummarySchema),
});

const unsubscribeSchema = z.object({
  oneClick: z.boolean(),
  http: z.string().optional(),
  mailto: z.string().optional(),
});

const attachmentSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
});

export const downloadAttachmentOutputSchema = z.object({
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  sizeHuman: z.string(),
  // Exactly one of text/contentBase64 is present (the SDK's object-shaped
  // outputSchema cannot express the union, so the invariant lives here).
  text: z
    .string()
    .optional()
    .describe('Decoded content for valid-UTF-8 text attachments; absent when contentBase64 is set'),
  contentBase64: z
    .string()
    .optional()
    .describe('Base64 content for binary or non-UTF-8 attachments; absent when text is set'),
});

export const getEmailOutputSchema = emailSummarySchema.extend({
  to: z.array(emailAddressSchema),
  cc: z.array(emailAddressSchema).optional(),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).optional(),
  unsubscribe: unsubscribeSchema.optional(),
  attachments: z.array(attachmentSchema),
  body: z.string(),
});

export type EmailSummaryPayload = z.infer<typeof emailSummarySchema>;
export type ListEmailsOutput = z.infer<typeof listEmailsOutputSchema>;
export type GetEmailOutput = z.infer<typeof getEmailOutputSchema>;

export function toEmailSummaryPayload(meta: EmailMeta, mailbox: string): EmailSummaryPayload {
  return {
    id: meta.id,
    mailbox,
    uidValidity: meta.uidValidity,
    messageId: meta.messageId,
    threadId: meta.threadId,
    subject: meta.subject,
    from: meta.from,
    date: meta.date,
    seen: meta.seen,
    flagged: meta.flagged,
    answered: meta.answered,
    hasAttachments: meta.hasAttachments,
    labels: meta.labels,
    ...(meta.preview !== undefined ? { preview: meta.preview } : {}),
  };
}

export function toEmailDetailPayload(email: Email, mailbox: string, body: string): GetEmailOutput {
  return {
    ...toEmailSummaryPayload(email, mailbox),
    to: email.to,
    ...(email.cc !== undefined ? { cc: email.cc } : {}),
    ...(email.inReplyTo !== undefined ? { inReplyTo: email.inReplyTo } : {}),
    ...(email.references !== undefined ? { references: email.references } : {}),
    ...(email.unsubscribe !== undefined ? { unsubscribe: email.unsubscribe } : {}),
    attachments: email.attachments,
    body,
  };
}
