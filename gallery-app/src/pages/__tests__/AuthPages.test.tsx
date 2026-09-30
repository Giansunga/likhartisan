import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignInPage from '../SignInPage';

const mocks = vi.hoisted(() => ({ signInWithPassword: vi.fn(), getAuthDestination: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signInWithPassword: mocks.signInWithPassword } } }));
vi.mock('../../lib/authDestination', () => ({ getAuthDestination: mocks.getAuthDestination }));

function renderPage() {
  render(<MemoryRouter initialEntries={['/signin']}><Routes>
    <Route path="/signin" element={<SignInPage />} />
    <Route path="/" element={<p>Home destination</p>} />
    <Route path="/artisan-dashboard" element={<p>Shop destination</p>} />
  </Routes></MemoryRouter>);
}

describe('direct sign-in page', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getAuthDestination.mockResolvedValue('/'); });

  it('signs in and routes a shop owner after a real session', async () => {
    const user = { id: 'shop-1', email: 'shop@example.com' };
    mocks.signInWithPassword.mockResolvedValue({ data: { user, session: { user } }, error: null });
    mocks.getAuthDestination.mockResolvedValue('/artisan-dashboard');
    renderPage();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'shop@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(screen.getByText('Shop destination')).toBeInTheDocument());
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'shop@example.com', password: 'password123' });
    expect(mocks.getAuthDestination).toHaveBeenCalledWith(user);
  });

  it('keeps a failed sign-in on the form', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } });
    renderPage();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'maria@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });
});
