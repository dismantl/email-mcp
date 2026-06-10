export interface ThreadIdInput {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
}

function firstNonBlank(values: (string | undefined)[]): string | undefined {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value));
}

export function computeThreadId({ messageId, inReplyTo, references = [] }: ThreadIdInput): string {
  return firstNonBlank([references[0], inReplyTo, messageId]) ?? '';
}
