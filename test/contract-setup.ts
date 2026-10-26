/**
 * Contract-test setup (jest.contract.config.js):
 * - Loads .env, as Expo CLI does for app builds.
 * - Routes fetch to the host Node's real fetch (test/contract-env.js). In app tests Expo's
 *   native fetch is used, which has no network stack under Node.
 */
import { load } from '@expo/env';

load(process.cwd(), { force: true, silent: true });

jest.mock('expo/src/winter/fetch', () => ({
  fetch: (...args: Parameters<typeof fetch>) =>
    (globalThis as unknown as { __hostFetch: typeof fetch }).__hostFetch(...args),
}));
