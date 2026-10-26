import { routeForPush } from '@/lib/push';

describe('routeForPush', () => {
  it('opens the alert for a sent notification', () => {
    expect(routeForPush({ type: 'notification', documentId: 'abc' })).toEqual({
      pathname: '/alerts/[id]',
      params: { id: 'abc' },
    });
  });

  it('opens the event for a reminder', () => {
    expect(routeForPush({ type: 'event-reminder', eventDocumentId: 'evt' })).toEqual({
      pathname: '/events/[id]',
      params: { id: 'evt' },
    });
  });

  it('ignores unknown or malformed payloads', () => {
    expect(routeForPush(undefined)).toBeNull();
    expect(routeForPush({ type: 'notification' })).toBeNull();
    expect(routeForPush({ type: 'something-else', documentId: 'x' })).toBeNull();
  });
});
