import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import ShoppingAccess from './ShoppingAccess';
const auth = vi.hoisted(() => ({ user: null as null | { id: string }, loading: false }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
beforeEach(() => { auth.user = null; auth.loading = false; sessionStorage.clear(); });
it('blocks guest content and requests sign-in once, with a retry button', async () => {
 const listener = vi.fn(); window.addEventListener('open-auth', listener);
 const tree = <MemoryRouter initialEntries={['/cart']}><ShoppingAccess><p>Private cart</p></ShoppingAccess></MemoryRouter>;
 const view = render(tree); await waitFor(() => expect(listener).toHaveBeenCalledOnce());
 expect(screen.queryByText('Private cart')).toBeNull(); view.rerender(tree);
 expect(listener).toHaveBeenCalledOnce(); fireEvent.click(screen.getByText('Sign In')); expect(listener).toHaveBeenCalledTimes(2);
 window.removeEventListener('open-auth', listener);
});
it('waits for auth and renders only after sign-in', () => {
 auth.loading = true;
 const tree = () => <MemoryRouter><ShoppingAccess><p>Private cart</p></ShoppingAccess></MemoryRouter>;
 const view = render(tree()); expect(screen.getByRole('status')).toBeInTheDocument(); expect(screen.queryByText('Private cart')).toBeNull();
 auth.loading = false; auth.user = { id: 'a' }; view.rerender(tree()); expect(screen.getByText('Private cart')).toBeInTheDocument();
 auth.user = null; view.rerender(tree()); expect(screen.queryByText('Private cart')).toBeNull();
});
