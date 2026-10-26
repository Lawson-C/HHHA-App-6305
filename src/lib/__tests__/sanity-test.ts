import { toApiError } from '@/lib/api/resident';
import { portableTextToMarkdown } from '@/lib/sanity';

const block = (text: string, extra: Record<string, unknown> = {}) => ({
  _type: 'block',
  style: 'normal',
  children: [{ text }],
  ...extra,
});

describe('portableTextToMarkdown', () => {
  it('maps headings, bullets and paragraphs to the Markdown subset the app renders', () => {
    expect(
      portableTextToMarkdown([
        block('Heat is dangerous.'),
        block('Warning signs', { style: 'h2' }),
        block('Dizziness', { listItem: 'bullet' }),
        block('Headache', { listItem: 'bullet' }),
        block('Drink water.'),
      ]),
    ).toBe('Heat is dangerous.\n\n## Warning signs\n\n- Dizziness\n- Headache\n\nDrink water.');
  });

  it('returns null for empty bodies', () => {
    expect(portableTextToMarkdown(null)).toBeNull();
    expect(portableTextToMarkdown([])).toBeNull();
  });
});

describe('toApiError', () => {
  it('maps Postgres/PostgREST codes to HTTP-like statuses', () => {
    expect(toApiError({ code: '42501', message: 'denied' }).status).toBe(403);
    expect(toApiError({ code: 'PGRST116', message: 'none' }).status).toBe(404);
    expect(toApiError({ code: '23505', message: 'dup' }).status).toBe(409);
    expect(
      toApiError({ code: 'P0001', message: 'At least one active admin must remain' }).status,
    ).toBe(400);
    expect(toApiError({ code: '23514', message: 'check' }).status).toBe(400);
    expect(toApiError({ message: 'boom' }).status).toBe(500);
  });
});
