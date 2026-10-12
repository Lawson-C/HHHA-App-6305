import { ApiError } from '@/lib/api/client';

type AuthLikeError = { code?: string; message?: string; status?: number; name?: string };

const messages: Record<string, string> = {
  user_already_exists: 'An account with this email already exists. Try signing in.',
  email_exists: 'An account with this email already exists. Try signing in.',
  weak_password: `That password is too easy to guess. Use at least 8 characters.`,
  invalid_credentials: "That email and password don't match. Try again.",
  email_not_confirmed: 'Confirm your email first. Check your inbox for the link.',
  over_request_rate_limit: 'Too many tries. Wait a minute and try again.',
  over_email_send_rate_limit: 'Too many emails sent. Wait a few minutes and try again.',
};

/** Turn a Supabase AuthError / ApiError / anything into a plain-language message. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  const e = (error ?? {}) as AuthLikeError;
  if (e.code && messages[e.code]) return messages[e.code];
  if (e.name === 'AuthRetryableFetchError' || e.status === 0) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return e.message || 'Something went wrong. Try again.';
}
