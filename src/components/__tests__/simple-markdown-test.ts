import { parseMarkdown } from '@/components/simple-markdown';

describe('parseMarkdown', () => {
  it('splits headings, lists and paragraphs, and flags lists under a warning heading', () => {
    const blocks = parseMarkdown(
      'Heat is dangerous.\n\n## Warning signs\n\n- Dizziness\n- Headache\n\n## What to do\n\n- Drink water',
    );
    expect(blocks).toEqual([
      { kind: 'paragraph', text: 'Heat is dangerous.' },
      { kind: 'heading', text: 'Warning signs' },
      { kind: 'list', items: ['Dizziness', 'Headache'], warning: true },
      { kind: 'heading', text: 'What to do' },
      { kind: 'list', items: ['Drink water'], warning: false },
    ]);
  });
});
