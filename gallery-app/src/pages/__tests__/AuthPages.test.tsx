import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignInPage from '../SignInPage';
import SignUpPage from '../SignUpPage';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  getAuthDestination: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: mocks.signInWithPassword, signUp: mocks.signUp } },
}));
vi.mock('../../lib/authDestination', () => ({ getAuthDestination: mocks.getAuthDestination }));

function renderPage(path: '/signin' | '/signup') {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/signin" element={<SignInPage />} />
    <Route path="/signup" element={<SignUpPage />} />
    <Route path="/" element={<p>Home destination</p>} />
    <Route path="/artisan-dashboard" element={<p>Shop destination</p>} />
  </Routes></MemoryRouter>);
}

function fillSignUp() {
  fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Maria' } });
  fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Santos' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'maria@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });
}

describe('direct authentication pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthDestination.mockResolvedValue('/');
  });

  it('signs in and routes a shop owner after a real session', async () => {
    const user = { id: 'shop-1', email: 'shop@example.com' };
    mocks.signInWithPassword.mockResolvedValue({ data: { user, session: { user } }, error: null });
    mocks.getAuthDestination.mockResolvedValue('/artisan-dashboard');
    renderPage('/signin');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'shop@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(screen.getByText('Shop destination')).toBeInTheDocument());
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'shop@example.com', password: 'password123' });
    expect(mocks.getAuthDestination).toHaveBeenCalledWith(user);
  });

  it('keeps a failed sign-in on the form', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } });
    renderPage('/signin');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'maria@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('rejects mismatched sign-up passwords before calling Supabase', async () => {
    renderPage('/signup');
    fillSignUp();
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('shows Supabase sign-up errors on the form', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Signup unavailable' } });
    renderPage('/signup');
    fillSignUp();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Signup unavailable');
  });

  it('asks for email confirmation when sign-up has no session', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'buyer-1' }, session: null }, error: null });
    renderPage('/signup');
    fillSignUp();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Check your email');
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: 'maria@example.com', password: 'password123', options: { data: { name: 'Maria Santos' } },
    });
    expect(mocks.getAuthDestination).not.toHaveBeenCalled();
  });

  it('routes immediately when sign-up returns a session', async () => {
    const user = { id: 'buyer-1', email: 'maria@example.com' };
    mocks.signUp.mockResolvedValue({ data: { user, session: { user } }, error: null });
    renderPage('/signup');
    fillSignUp();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(screen.getByText('Home destination')).toBeInTheDocument());
    expect(mocks.getAuthDestination).toHaveBeenCalledWith(user);
  });
});
