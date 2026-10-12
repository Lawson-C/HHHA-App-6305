/** Client-side form rules. The server (Supabase Auth, Strapi) enforces them again. */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RULE = `At least ${PASSWORD_MIN_LENGTH} characters.`;

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return 'Enter your email.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "That doesn't look like an email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Enter a password.';
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_RULE;
  return null;
}

export function validateFullName(name: string): string | null {
  const value = name.trim();
  if (!value) return 'Enter your name.';
  if (value.length > 100) return 'Use 100 characters or fewer.';
  return null;
}

/**
 * Normalize a phone number to E.164. Accepts US 10-digit numbers (with any punctuation),
 * 11-digit numbers starting with 1, or numbers already in +E.164 form.
 * Returns null when the input can't be normalized.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return /^[1-9]\d{1,14}$/.test(digits) ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export function validatePhone(phone: string): string | null {
  if (!phone.trim()) return 'Enter your phone number.';
  return normalizePhone(phone) ? null : 'Enter a 10-digit phone number.';
}
