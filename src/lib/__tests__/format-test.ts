import { dayKey, formatPhone, formatRelative, formatTimeRange, initials } from '@/lib/format';

describe('format', () => {
  it('drops the repeated AM/PM in a time range (Atlanta time)', () => {
    // 6:00–7:30 PM EDT on Sep 24 2026 = 22:00–23:30 UTC
    expect(formatTimeRange('2026-09-24T22:00:00Z', '2026-09-24T23:30:00Z')).toBe('6:00 – 7:30 PM');
    expect(formatTimeRange('2026-09-24T15:00:00Z', '2026-09-24T18:00:00Z')).toBe(
      '11:00 AM – 2:00 PM',
    );
  });

  it('groups by Atlanta calendar day, not UTC', () => {
    // 11 PM EDT on Sep 24 is already Sep 25 in UTC.
    expect(dayKey('2026-09-25T03:00:00Z')).toBe('2026-09-24');
  });

  it('formats relative times', () => {
    const now = new Date('2026-10-12T12:00:00Z');
    expect(formatRelative('2026-10-12T11:50:00Z', now)).toBe('10 min ago');
    expect(formatRelative('2026-10-12T09:00:00Z', now)).toBe('3 hr ago');
  });

  it('formats US phone numbers and initials', () => {
    expect(formatPhone('+14045550142')).toBe('(404) 555-0142');
    expect(formatPhone(null)).toBe('');
    expect(initials('Denise Carter')).toBe('DC');
    expect(initials('denise')).toBe('D');
  });
});
