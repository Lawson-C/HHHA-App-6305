import type { Alert } from '@/lib/api/types';

/** An alert is active until its `endsAt` passes. */
export function isAlertActive(alert: Alert, now: Date = new Date()) {
  return !alert.endsAt || new Date(alert.endsAt).getTime() > now.getTime();
}
