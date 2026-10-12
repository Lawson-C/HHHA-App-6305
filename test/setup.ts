/**
 * Global Jest setup for the app. Native-only modules get small in-memory fakes here so
 * tests run in Node. Keep fakes minimal; mock network calls at src/lib/api instead.
 */

// expo-sqlite's localStorage polyfill needs the native SQLite module. Use a Map instead.
jest.mock('expo-sqlite/localStorage/install', () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  return {};
});

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));

jest.mock('expo-blur', () => ({ BlurView: () => null }));
