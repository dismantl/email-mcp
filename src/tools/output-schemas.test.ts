import type { Email, EmailMeta } from '../types/index.js';
import {
  emailSummarySchema,
  getEmailOutputSchema,
  listEmailsOutputSchema,
  toEmailDetailPayload,
  toEmailSummaryPayload,
} from './output-schemas.js';

function createEmailMeta(overrides: Partial<EmailMeta> = {}): EmailMeta {
  return {
    id: '42',
    uidValidity: '12345',
    subject: 'Structured output',
    from: { name: 'Sender', address: 'sender@example.com' },
    to: [{ name: 'Recipient', address: 'recipient@example.com' }],
    date: '2026-07-03T14:00:00.000Z',
    messageId: '<message@example.com>',
    threadId: '<thread@example.com>',
    inReplyTo: '<parent@example.com>',
    references: ['<root@example.com>', '<parent@example.com>'],
    seen: true,
    flagged: false,
    answered: true,
    hasAttachments: true,
    labels: ['Work'],
    preview: 'Preview text',
    ...overrides,
  };
}

function createEmail(overrides: Partial<Email> = {}): Email {
  return {
    ...createEmailMeta(overrides),
    cc: [{ name: 'Copied', address: 'copied@example.com' }],
    bodyText: 'Full body text',
    bodyHtml: '<p>Full body text</p>',
    attachments: [{ filename: 'notes.txt', mimeType: 'text/plain', size: 128 }],
    headers: {},
    unsubscribe: {
      oneClick: true,
      http: 'https://example.com/unsubscribe',
      mailto: 'mailto:unsubscribe@example.com',
    },
    ...overrides,
  };
}

describe('email output schemas', () => {
  it('maps an EmailMeta fixture to a schema-valid summary payload', () => {
    const payload = toEmailSummaryPayload(createEmailMeta(), 'INBOX');

    expect(emailSummarySchema.parse(payload)).toEqual({
      id: '42',
      mailbox: 'INBOX',
      uidValidity: '12345',
      messageId: '<message@example.com>',
      threadId: '<thread@example.com>',
      subject: 'Structured output',
      from: { name: 'Sender', address: 'sender@example.com' },
      date: '2026-07-03T14:00:00.000Z',
      seen: true,
      flagged: false,
      answered: true,
      hasAttachments: true,
      labels: ['Work'],
      preview: 'Preview text',
    });
  });

  it('maps an EmailMeta fixture without optional fields to a schema-valid summary payload', () => {
    const payload = toEmailSummaryPayload(
      createEmailMeta({
        from: { address: 'sender@example.com' },
        inReplyTo: undefined,
        references: undefined,
        preview: undefined,
      }),
      'Archive',
    );

    expect(emailSummarySchema.parse(payload)).toEqual({
      id: '42',
      mailbox: 'Archive',
      uidValidity: '12345',
      messageId: '<message@example.com>',
      threadId: '<thread@example.com>',
      subject: 'Structured output',
      from: { address: 'sender@example.com' },
      date: '2026-07-03T14:00:00.000Z',
      seen: true,
      flagged: false,
      answered: true,
      hasAttachments: true,
      labels: ['Work'],
    });
  });

  it('wraps summary payloads in a schema-valid list output object', () => {
    const summary = toEmailSummaryPayload(createEmailMeta(), 'INBOX');

    expect(
      listEmailsOutputSchema.parse({
        mailbox: 'INBOX',
        page: 1,
        pageSize: 20,
        total: 1,
        emails: [summary],
      }),
    ).toEqual({
      mailbox: 'INBOX',
      page: 1,
      pageSize: 20,
      total: 1,
      emails: [summary],
    });
  });

  it('maps an Email fixture to a schema-valid detail payload', () => {
    const payload = toEmailDetailPayload(createEmail(), 'INBOX', 'Rendered body');

    expect(getEmailOutputSchema.parse(payload)).toEqual({
      id: '42',
      mailbox: 'INBOX',
      uidValidity: '12345',
      messageId: '<message@example.com>',
      threadId: '<thread@example.com>',
      subject: 'Structured output',
      from: { name: 'Sender', address: 'sender@example.com' },
      to: [{ name: 'Recipient', address: 'recipient@example.com' }],
      cc: [{ name: 'Copied', address: 'copied@example.com' }],
      date: '2026-07-03T14:00:00.000Z',
      seen: true,
      flagged: false,
      answered: true,
      hasAttachments: true,
      labels: ['Work'],
      preview: 'Preview text',
      inReplyTo: '<parent@example.com>',
      references: ['<root@example.com>', '<parent@example.com>'],
      unsubscribe: {
        oneClick: true,
        http: 'https://example.com/unsubscribe',
        mailto: 'mailto:unsubscribe@example.com',
      },
      attachments: [{ filename: 'notes.txt', mimeType: 'text/plain', size: 128 }],
      body: 'Rendered body',
    });
  });

  it('maps an Email fixture without optional fields to a schema-valid detail payload', () => {
    const payload = toEmailDetailPayload(
      createEmail({
        cc: undefined,
        inReplyTo: undefined,
        references: undefined,
        preview: undefined,
        unsubscribe: undefined,
      }),
      'Archive',
      'Rendered body',
    );

    expect(getEmailOutputSchema.parse(payload)).toEqual({
      id: '42',
      mailbox: 'Archive',
      uidValidity: '12345',
      messageId: '<message@example.com>',
      threadId: '<thread@example.com>',
      subject: 'Structured output',
      from: { name: 'Sender', address: 'sender@example.com' },
      to: [{ name: 'Recipient', address: 'recipient@example.com' }],
      date: '2026-07-03T14:00:00.000Z',
      seen: true,
      flagged: false,
      answered: true,
      hasAttachments: true,
      labels: ['Work'],
      attachments: [{ filename: 'notes.txt', mimeType: 'text/plain', size: 128 }],
      body: 'Rendered body',
    });
  });

  it('rejects a summary payload missing id', () => {
    const payload = toEmailSummaryPayload(createEmailMeta(), 'INBOX');
    const withoutId: Partial<typeof payload> = { ...payload };
    delete withoutId.id;

    expect(() => emailSummarySchema.parse(withoutId)).toThrow();
  });
});
