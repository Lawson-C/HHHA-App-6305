import {
  normalizePhone,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
} from '@/lib/auth/validation';

describe('auth validation', () => {
  it('accepts a normal email and rejects malformed ones', () => {
    expect(validateEmail('denise.carter@email.com')).toBeNull();
    expect(validateEmail('  denise@email.com ')).toBeNull();
    expect(validateEmail('')).toMatch(/enter your email/i);
    expect(validateEmail('denise@')).toMatch(/doesn't look like/i);
  });

  it('requires passwords of at least 8 characters', () => {
    expect(validatePassword('')).toMatch(/enter a password/i);
    expect(validatePassword('1234567')).toMatch(/at least 8/i);
    expect(validatePassword('12345678')).toBeNull();
  });

  it('requires a name of 1-100 characters', () => {
    expect(validateFullName('   ')).toMatch(/enter your name/i);
    expect(validateFullName('Denise Carter')).toBeNull();
    expect(validateFullName('x'.repeat(101))).toMatch(/100/);
  });

  it('normalizes US phone numbers to E.164', () => {
    expect(normalizePhone('(404) 555-0142')).toBe('+14045550142');
    expect(normalizePhone('1-404-555-0142')).toBe('+14045550142');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizePhone('555-0142')).toBeNull();
    expect(validatePhone('404555')).toMatch(/10-digit/);
    expect(validatePhone('4045550142')).toBeNull();
  });
});
