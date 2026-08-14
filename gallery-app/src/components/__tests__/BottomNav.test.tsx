import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import BottomNav from '../BottomNav';

function renderBottomNav(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><BottomNav /></MemoryRouter>);
}

describe('BottomNav', () => {
  it('stays mounted at the document root and identifies the active destination', () => {
    renderBottomNav('/gallery/product-1');
    const navigation = screen.getByRole('navigation', { name: 'Mobile navigation' });

    expect(navigation.parentElement).toBe(document.body);
    expect(screen.getByRole('link', { name: 'Gallery' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  it('does not render inside the artisan dashboard', () => {
    renderBottomNav('/artisan-dashboard/orders');
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument();
  });
});
