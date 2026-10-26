import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildReminderMessages,
  defaultRemindAt,
  planReminders,
  type DueReminder,
} from '../_shared/reminders.ts';

const now = new Date('2026-10-19T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

test('defaultRemindAt: 24 h before, else 1 h before, else now (Q-004)', () => {
  const inThreeDays = new Date(now.getTime() + 72 * HOUR);
  assert.equal(
    defaultRemindAt(inThreeDays, now).toISOString(),
    new Date(inThreeDays.getTime() - 24 * HOUR).toISOString(),
  );
  const inFiveHours = new Date(now.getTime() + 5 * HOUR);
  assert.equal(
    defaultRemindAt(inFiveHours, now).toISOString(),
    new Date(inFiveHours.getTime() - HOUR).toISOString(),
  );
  const inThirtyMinutes = new Date(now.getTime() + HOUR / 2);
  assert.equal(defaultRemindAt(inThirtyMinutes, now).toISOString(), now.toISOString());
});

const reminder = (overrides: Partial<DueReminder> = {}): DueReminder => ({
  reminder_id: 'r1',
  user_id: 'u1',
  event_id: 'event-1',
  event_title: 'Budgeting basics workshop',
  event_starts_at: '2026-10-20T22:00:00.000Z',
  tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'],
  ...overrides,
});

test('buildReminderMessages: one per device, app routing payload, Eastern time', () => {
  const messages = buildReminderMessages(reminder());
  assert.equal(messages.length, 2);
  assert.equal(messages[0].title, 'Reminder: Budgeting basics workshop');
  assert.equal(messages[0].body, 'Starts Tue, Oct 20, 6:00 PM');
  assert.deepEqual(messages[0].data, { type: 'event-reminder', eventDocumentId: 'event-1' });
  assert.ok(
    buildReminderMessages(reminder({ event_title: 'x'.repeat(100) }))[0].title.length <= 65,
  );
  assert.equal(
    buildReminderMessages(reminder({ event_title: null }))[0].title,
    'Reminder: Upcoming event',
  );
  assert.deepEqual(buildReminderMessages(reminder({ tokens: [] })), []);
});

test('planReminders without Sanity sends everything as stored', () => {
  assert.deepEqual(planReminders([reminder()], null, now), [
    { action: 'send', reminder: reminder() },
  ]);
});

test('planReminders reconciles with Sanity: deleted, moved, renamed', () => {
  const plans = planReminders(
    [
      reminder({ reminder_id: 'gone', event_id: 'deleted-event' }),
      reminder({ reminder_id: 'moved', event_id: 'moved-event' }),
      reminder({ reminder_id: 'moved-past', event_id: 'moved-past-event' }),
      reminder({ reminder_id: 'same', event_id: 'event-1' }),
    ],
    new Map([
      ['moved-event', { _id: 'moved-event', title: 'x', startsAt: '2026-10-27T22:00:00Z' }],
      [
        'moved-past-event',
        { _id: 'moved-past-event', title: 'x', startsAt: '2026-10-18T22:00:00Z' },
      ],
      ['event-1', { _id: 'event-1', title: 'Renamed workshop', startsAt: '2026-10-20T22:00:20Z' }],
    ]),
    now,
  );
  assert.deepEqual(plans[0], { action: 'delete', reminderId: 'gone' });
  assert.deepEqual(plans[1], {
    action: 'reschedule',
    reminderId: 'moved',
    startsAt: '2026-10-27T22:00:00.000Z',
  });
  assert.deepEqual(plans[2], { action: 'skip', reminderId: 'moved-past' });
  assert.equal(plans[3].action, 'send');
  assert.equal(plans[3].action === 'send' && plans[3].reminder.event_title, 'Renamed workshop');
});

test('planReminders skips reminders for events that already started', () => {
  assert.deepEqual(
    planReminders([reminder({ event_starts_at: '2026-10-19T11:00:00Z' })], null, now),
    [{ action: 'skip', reminderId: 'r1' }],
  );
});
