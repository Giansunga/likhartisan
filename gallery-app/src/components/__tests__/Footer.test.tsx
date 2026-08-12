import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Footer from '../Footer';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useMediaQuery: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: mocks.useMediaQuery,
}));

function renderFooter(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Footer />
    </MemoryRouter>,
  );
}

describe('Footer', () => {
  beforeEach(() => {
    mocks.useMediaQuery.mockReturnValue(false);
    mocks.useAuth.mockReturnValue({ user: null });
  });

  it('renders the branded footer and dispatches the existing signed-out auth actions', () => {
    const authEvent = vi.fn();
    window.addEventListener('open-auth', authEvent as EventListener);

    renderFooter();

    const logo = screen.getByRole('img', { name: 'LikhArtisan' });
    expect(logo).toHaveAttribute('src', '/images/likhartisan-brown-wordmark.png');
    expect(screen.getByRole('link', { name: 'LikhArtisan home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /\+63 967 671 1111/ })).toHaveAttribute('href', 'tel:+639676711111');
    expect(screen.getByRole('link', { name: 'Tea Light Vases' })).toHaveAttribute('href', '/gallery?category=Tea%20Light%20Vases');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(authEvent).toHaveBeenCalledTimes(1);
    expect((authEvent.mock.calls[0][0] as CustomEvent).detail).toEqual({ view: 'signin' });

    window.removeEventListener('open-auth', authEvent as EventListener);
  });

  it('shows account destinations for signed-in users', () => {
    mocks.useAuth.mockReturnValue({ user: { id: 'buyer-id' } });

    renderFooter();

    expect(screen.getByRole('link', { name: 'My Account' })).toHaveAttribute('href', '/dashboard?tab=account');
    expect(screen.getByRole('link', { name: 'My Purchases' })).toHaveAttribute('href', '/dashboard?tab=purchases');
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('does not render on mobile or protected dashboard routes', () => {
    mocks.useMediaQuery.mockReturnValue(true);
    const mobile = renderFooter();
    expect(mobile.container.querySelector('footer')).toBeNull();
    mobile.unmount();

    mocks.useMediaQuery.mockReturnValue(false);
    const admin = renderFooter('/admin');
    expect(admin.container.querySelector('footer')).toBeNull();
    admin.unmount();

    const artisan = renderFooter('/artisan-dashboard');
    expect(artisan.container.querySelector('footer')).toBeNull();
  });
});
