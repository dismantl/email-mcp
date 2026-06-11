import { calendarStateKey } from './calendar-state.js';

describe('calendarStateKey', () => {
  it('distinguishes reused UIDs by mailbox and UIDVALIDITY', () => {
    expect(calendarStateKey('work', '42', 'INBOX', '12345')).not.toBe(
      calendarStateKey('work', '42', 'INBOX', '67890'),
    );
    expect(calendarStateKey('work', '42', 'INBOX', '12345')).not.toBe(
      calendarStateKey('work', '42', 'Archive', '12345'),
    );
  });
});
