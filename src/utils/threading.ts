export interface ThreadIdInput {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
}

export function parseEmailHeaders(headerText: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let currentKey: string | undefined;

  headerText.split(/\r?\n/).forEach((line) => {
    if (line === '') return;

    if (/^\s/.test(line) && currentKey) {
      headers[currentKey] = `${headers[currentKey]} ${line.trim()}`.trim();
      return;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      currentKey = line.slice(0, colonIdx).trim().toLowerCase();
      headers[currentKey] = line.slice(colonIdx + 1).trim();
    }
  });

  return headers;
}

export function parseReferencesHeader(value: string | undefined): string[] {
  return value?.split(/\s+/).filter(Boolean) ?? [];
}

function firstNonBlank(values: (string | undefined)[]): string | undefined {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value));
}

export function computeThreadId({ messageId, inReplyTo, references = [] }: ThreadIdInput): string {
  return firstNonBlank([references[0], inReplyTo, messageId]) ?? '';
}
