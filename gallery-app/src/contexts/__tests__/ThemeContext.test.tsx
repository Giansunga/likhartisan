import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../ThemeContext';

const supabaseMocks = vi.hoisted(() => ({
  single: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: supabaseMocks.single })),
      })),
      upsert: supabaseMocks.upsert,
    })),
  },
}));

function ThemeHarness() {
  const { currentTheme, setTheme } = useTheme();

  return (
    <div>
      <span>{currentTheme}</span>
      <button onClick={() => setTheme('christmas')}>Use Christmas</button>
      <button onClick={() => setTheme('valentines')}>Use Valentine</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    supabaseMocks.single.mockResolvedValue({
      data: { theme_name: 'default', auto_detect: false },
      error: null,
    });
    supabaseMocks.upsert.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.documentElement.className = '';
    document.getElementById('theme-dynamic-vars')?.remove();
  });

  it('applies and persists Christmas, then removes it when another theme is selected', async () => {
    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    );

    await screen.findByText('default');
    fireEvent.click(screen.getByRole('button', { name: 'Use Christmas' }));

    expect(screen.getByText('christmas')).toBeInTheDocument();
    expect(document.documentElement).toHaveClass('theme-christmas');
    await waitFor(() => expect(supabaseMocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'current',
      theme_name: 'christmas',
      auto_detect: false,
    })));

    fireEvent.click(screen.getByRole('button', { name: 'Use Valentine' }));
    expect(document.documentElement).not.toHaveClass('theme-christmas');
    expect(document.documentElement).toHaveClass('theme-valentines');
  });

  it('falls back to the default theme for a legacy stored value', async () => {
    supabaseMocks.single.mockResolvedValue({
      data: { theme_name: 'holy-week', auto_detect: false },
      error: null,
    });

    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    );

    await screen.findByText('default');
    expect(document.documentElement).not.toHaveClass('theme-christmas');
    expect(document.documentElement).not.toHaveClass('theme-valentines');
  });
});
