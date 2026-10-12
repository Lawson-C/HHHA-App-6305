/**
 * Drives the real route tree in demo mode (no EXPO_PUBLIC_* env), covering the
 * docs/design/user-flows.md basics: first launch → guest browsing, sign-in, and the
 * Protected route guards for /profile and /admin.
 */
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { StorageKeys } from '@/lib/storage';

jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));

// Relative to the project root (Jest's rootDir).
const appDir = './src/app';

beforeEach(() => {
  localStorage.clear();
});

describe('app flow (demo mode)', () => {
  it('sends a first-time visitor to the welcome screen', async () => {
    const app = renderRouter(appDir, { initialUrl: '/' });
    expect(await screen.findByText('Get started')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/welcome');
  });

  it('lets a returning guest browse home but not reach the profile', async () => {
    localStorage.setItem(StorageKeys.hasSeenWelcome, '1');
    const app = renderRouter(appDir, { initialUrl: '/' });
    expect(await screen.findByText('Services')).toBeOnTheScreen();
    expect(await screen.findByText('Boil water advisory')).toBeOnTheScreen();
    // Guests see "Sign in" instead of an avatar.
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();

    act(() => {
      router.push('/profile');
    });
    // /profile is Protected (signed-in only), so navigation doesn't land there.
    expect(app.getPathname()).not.toBe('/profile');
  });

  it('validates the sign-in form, then signs in', async () => {
    localStorage.setItem(StorageKeys.hasSeenWelcome, '1');
    const app = renderRouter(appDir, { initialUrl: '/sign-in' });
    expect(await screen.findByText('Welcome back')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('sign-in-submit'));
    expect(await screen.findByText('Enter your email.')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Email'), 'denise.carter@email.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    fireEvent.press(screen.getByTestId('sign-in-submit'));

    await waitFor(() => expect(app.getPathname()).toBe('/'));
    expect(await screen.findByLabelText('Your profile')).toBeOnTheScreen();
  });

  it('keeps residents out of /admin and lets staff in', async () => {
    localStorage.setItem(StorageKeys.hasSeenWelcome, '1');
    localStorage.setItem(
      StorageKeys.demoSession,
      JSON.stringify({ email: 'resident@example.com' }),
    );
    const resident = renderRouter(appDir, { initialUrl: '/' });
    await screen.findByText('Services');
    act(() => {
      router.push('/admin');
    });
    expect(resident.getPathname()).not.toBe('/admin');
    resident.unmount();

    localStorage.setItem(
      StorageKeys.demoSession,
      JSON.stringify({ email: 'staff@example.com', asStaff: true }),
    );
    renderRouter(appDir, { initialUrl: '/admin' });
    expect(await screen.findByText('Dashboard')).toBeOnTheScreen();
  });
});
