import 'expo-sqlite/localStorage/install';

/**
 * Small on-device key/value store for per-device conveniences (welcome seen, demo session).
 * Backed by expo-sqlite's localStorage. Never store secrets or server-owned data here.
 */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage unavailable; the app still works, it just won't remember this.
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

export const StorageKeys = {
  hasSeenWelcome: 'hhhna.hasSeenWelcome',
  demoSession: 'hhhna.demoSession',
  textSize: 'hhhna.textSize',
} as const;
