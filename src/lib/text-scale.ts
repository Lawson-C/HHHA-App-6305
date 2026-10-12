import { useSyncExternalStore } from 'react';

import type { TextSize } from '@/lib/api/types';
import { storage, StorageKeys } from '@/lib/storage';

/** In-app text size preference (Profile → Preferences → Text size), on top of the OS setting. */
export const textScales: Record<TextSize, { label: string; scale: number }> = {
  default: { label: 'Default', scale: 1 },
  large: { label: 'Large', scale: 1.15 },
  extra_large: { label: 'Extra large', scale: 1.3 },
};

let current: TextSize = (storage.get(StorageKeys.textSize) as TextSize | null) ?? 'default';
if (!(current in textScales)) current = 'default';
const listeners = new Set<() => void>();

export function setTextSize(size: TextSize) {
  current = size;
  storage.set(StorageKeys.textSize, size);
  listeners.forEach((l) => l());
}

export function getTextSize() {
  return current;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, getTextSize, getTextSize);
}
