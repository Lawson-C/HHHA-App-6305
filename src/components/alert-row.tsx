import { router } from 'expo-router';

import { ListRow } from '@/components/ui/list-row';
import { isAlertActive } from '@/lib/alerts';
import type { Alert } from '@/lib/api/types';
import { formatRelative } from '@/lib/format';
import { alertCategory } from '@/lib/labels';

/** Figma "Alert Card": category icon, title, "issuer · time". */
export function AlertRow({ alert }: { alert: Alert }) {
  const presentation = alertCategory[alert.category];
  const ended = !isAlertActive(alert);
  return (
    <ListRow
      title={alert.title}
      subtitle={`${alert.issuer ?? presentation.label} · ${ended ? 'Ended' : formatRelative(alert.sentAt)}`}
      icon={presentation.icon}
      tone={ended ? 'neutral' : presentation.tone}
      onPress={() => router.push({ pathname: '/alerts/[id]', params: { id: alert.documentId } })}
    />
  );
}
