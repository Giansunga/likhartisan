import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import DecorTab from '../DecorTab';
import { DEFAULT_DECORATION, type DecorationParams } from '../decor';

function Harness({ initial = DEFAULT_DECORATION }: { initial?: DecorationParams }) {
  const [decoration, setDecoration] = useState(initial);
  return <DecorTab decoration={decoration} onChange={setDecoration} />;
}

describe('DecorTab guided workflow', () => {
  it('gates customization and advances after choosing a motif', () => {
    render(<Harness />);
    const choose = screen.getByRole('button', { name: /Choose Pattern/ });
    const customize = screen.getByRole('button', { name: /Customize Pattern/ });
    expect(choose).toHaveAttribute('aria-expanded', 'true');
    expect(customize).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Blue botanical' }));

    expect(screen.getByRole('button', { name: /Choose Pattern.*Blue botanical.*Floral/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Customize Pattern.*Full wrap.*100%/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Pattern placement' })).toBeInTheDocument();
  });

  it('reopens completed sections and returns to selection after removal', () => {
    render(<Harness initial={{ ...DEFAULT_DECORATION, patternId: 'floral', placement: 'full' }} />);
    const choose = screen.getByRole('button', { name: /Choose Pattern/ });
    expect(choose).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(choose);
    expect(choose).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Customize Pattern/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove pattern' }));
    expect(screen.getByRole('button', { name: /Choose Pattern.*Select a motif/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Customize Pattern/ })).toBeDisabled();
  });
});
