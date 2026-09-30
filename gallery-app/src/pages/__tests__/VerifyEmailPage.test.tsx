import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VerifyEmailPage from '../VerifyEmailPage';

const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn(), resend: vi.fn(), getAuthDestination: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { verifyOtp: mocks.verifyOtp, resend: mocks.resend } } }));
vi.mock('../../lib/authDestination', () => ({ getAuthDestination: mocks.getAuthDestination }));

function renderPage() {
  render(<MemoryRouter initialEntries={['/verify-email']}><Routes>
    <Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route path="/artisan-dashboard" element={<p>Shop destination</p>} />
    <Route path="/signin" element={<p>Sign in destination</p>} />
  </Routes></MemoryRouter>);
}

describe('signup email verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('likhartisan:pending-signup-email', 'maria@example.com');
    mocks.getAuthDestination.mockResolvedValue('/artisan-dashboard');
  });

  it('confirms a signup code and routes the verified user', async () => {
    const user = { id: 'shop-1', email: 'maria@example.com' };
    mocks.verifyOtp.mockResolvedValue({ data: { session: { user } }, error: null });
    renderPage();
    expect(screen.getByLabelText('Email address')).toHaveValue('maria@example.com');
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify Email' }));
    await waitFor(() => expect(screen.getByText('Shop destination')).toBeInTheDocument());
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: 'maria@example.com', token: '12345678', type: 'email' });
    expect(sessionStorage.getItem('likhartisan:pending-signup-email')).toBeNull();
  });

  it('keeps an invalid code on the form', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'Token has expired or is invalid' } });
    renderPage();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '11111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify Email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Token has expired or is invalid');
    expect(screen.getByLabelText('Verification code')).toBeInTheDocument();
  });

  it('resends to the entered address without creating another account', async () => {
    mocks.resend.mockResolvedValue({ error: null });
    renderPage();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'resend code' }));
    expect(await screen.findByRole('status')).toHaveTextContent('new@example.com');
    expect(mocks.resend).toHaveBeenCalledWith({ type: 'signup', email: 'new@example.com' });
  });
});
