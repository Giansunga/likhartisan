import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual(['Home', 'Gallery', 'Design', 'Artisans', 'Shops']);
  });

  it('opens Artisans from the bottom bar and updates the active destination', () => {
    renderBottomNav('/shops');
    const artisans = screen.getByRole('link', { name: 'Artisans' });
    expect(artisans).toHaveAttribute('href', '/artisans');
    fireEvent.click(artisans);
    expect(artisans).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Shops' })).not.toHaveAttribute('aria-current');
  });

  it('does not render inside the artisan dashboard', () => {
    renderBottomNav('/artisan-dashboard/orders');
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument();
  });
});
