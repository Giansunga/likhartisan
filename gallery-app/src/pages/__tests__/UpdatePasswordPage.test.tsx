import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UpdatePasswordPage from '../UpdatePasswordPage';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  updateUser: vi.fn(),
  recordSecurityActivity: vi.fn(),
  signOutWithActivity: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: {
    getSession: mocks.getSession,
    onAuthStateChange: mocks.onAuthStateChange,
    updateUser: mocks.updateUser,
  } },
}));
vi.mock('../../lib/activityApi', () => ({
  recordSecurityActivity: mocks.recordSecurityActivity,
  signOutWithActivity: mocks.signOutWithActivity,
}));

function renderPage() {
  return render(<MemoryRouter initialEntries={['/update-password']}><Routes>
    <Route path="/update-password" element={<UpdatePasswordPage />} />
    <Route path="/forgot-password" element={<p>Request link destination</p>} />
    <Route path="/" element={<p>Home destination</p>} />
  </Routes></MemoryRouter>);
}

function fillPasswords(next: string, confirmation = next) {
  fireEvent.change(screen.getByLabelText('New password', { selector: 'input' }), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirm new password', { selector: 'input' }), { target: { value: confirmation } });
}

describe('reset password page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'buyer-1' } } } });
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.recordSecurityActivity.mockResolvedValue(undefined);
    mocks.signOutWithActivity.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('shows the branded form with password guidance and keyboard-friendly visibility controls', async () => {
    renderPage();
    const newPassword = await screen.findByLabelText('New password', { selector: 'input' });
    const confirmation = screen.getByLabelText('Confirm new password', { selector: 'input' });

    expect(screen.getByRole('img', { name: 'LikhArtisan' })).toBeInTheDocument();
    expect(screen.getByText('At least 8 characters, 1 uppercase letter, 1 number, and 1 symbol.')).toBeInTheDocument();
    expect(newPassword).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmation).toHaveAttribute('autocomplete', 'new-password');
    newPassword.focus();
    expect(newPassword).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Show new password' }));
    expect(newPassword).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide new password' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Show confirmation password' }));
    expect(confirmation).toHaveAttribute('type', 'text');
  });

  it('shows a mismatch error without sending a password update', async () => {
    renderPage();
    await screen.findByLabelText('New password', { selector: 'input' });
    fillPasswords('New-password1!', 'Other-password1!');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('shows the submitting state and an update error', async () => {
    let finishUpdate!: (value: { error: { message: string } }) => void;
    mocks.updateUser.mockImplementation(() => new Promise(resolve => { finishUpdate = resolve; }));
    renderPage();
    await screen.findByLabelText('New password', { selector: 'input' });
    fillPasswords('New-password1!');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(screen.getByRole('button', { name: /Updating password/ })).toBeDisabled();
    await act(async () => finishUpdate({ error: { message: 'Please request a new reset link.' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please request a new reset link.');
    expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled();
  });

  it('shows a link-checking state and a recovery action for an invalid link', async () => {
    vi.useFakeTimers();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Checking your reset link');

    await act(async () => { await Promise.resolve(); });
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole('alert')).toHaveTextContent('This reset link has expired or is invalid.');
    expect(screen.queryByLabelText('New password', { selector: 'input' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Request a new link' }));
    expect(screen.getByText('Request link destination')).toBeInTheDocument();
  });

  it('opens the form when a recovery event arrives after the initial session check', async () => {
    let notifyRecovery!: (event: string, session: { user: { id: string } } | null) => void;
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.onAuthStateChange.mockImplementation(callback => {
      notifyRecovery = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    renderPage();

    await waitFor(() => expect(mocks.onAuthStateChange).toHaveBeenCalled());
    act(() => notifyRecovery('PASSWORD_RECOVERY', { user: { id: 'buyer-1' } }));
    expect(screen.getByLabelText('New password', { selector: 'input' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows success after updating and signing out', async () => {
    renderPage();
    await screen.findByLabelText('New password', { selector: 'input' });
    fillPasswords('New-password1!');
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'You’re all set' })).toBeInTheDocument());
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'New-password1!' });
    expect(mocks.recordSecurityActivity).toHaveBeenCalledWith('auth.password_reset');
    expect(mocks.signOutWithActivity).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Go to login' }));
    expect(screen.getByText('Home destination')).toBeInTheDocument();
  });
});
