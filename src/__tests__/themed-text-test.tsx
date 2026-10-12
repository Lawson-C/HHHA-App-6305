import { render, screen } from '@testing-library/react-native';

import { ThemedText } from '@/components/themed-text';

// Smoke test proving the Jest + React Native Testing Library setup works.
// Replace/extend with real feature tests as screens are built.
describe('ThemedText', () => {
  it('renders its children', () => {
    render(<ThemedText>Historic Hunter Hills</ThemedText>);
    expect(screen.getByText('Historic Hunter Hills')).toBeOnTheScreen();
  });
});
