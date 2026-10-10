import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LikhAIRouteDock from '../LikhAIRouteDock';

vi.mock('../chat/LikhAIConversation', () => ({ default: () => <p>Support conversation</p> }));
let mobile = false;
function Jump() { const navigate = useNavigate(); return <><button onClick={() => navigate('/artisan-dashboard/listings')}>Seller portal</button><button onClick={() => navigate('/gallery')}>Public gallery</button></>; }
function show(path: string) { return render(<MemoryRouter initialEntries={[path]}><LikhAIRouteDock /><Jump /></MemoryRouter>); }
beforeEach(() => {
  mobile = false;
  window.matchMedia = vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList));
});
describe('portal LikhAI visibility', () => {
  it.each(['/admin', '/admin/products', '/admin/products/create', '/admin/analytics', '/artisan-dashboard', '/artisan-dashboard/listings', '/artisan-dashboard/messages', '/artisan-dashboard/profile'])('hides on %s at all viewport sizes', path => {
    const desktop = show(path); expect(screen.queryByRole('button', { name: 'Open LikhAI customer support' })).not.toBeInTheDocument(); desktop.unmount();
    mobile = true; show(path); expect(screen.queryByRole('button', { name: 'Open LikhAI customer support' })).not.toBeInTheDocument();
  });
  it('unmounts an open panel entering a portal and returns a closed launcher on public pages', () => {
    show('/gallery'); fireEvent.click(screen.getByRole('button', { name: 'Open LikhAI customer support' }));
    expect(screen.getByRole('complementary', { name: 'LikhAI customer support' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seller portal' }));
    expect(screen.queryByText('Support conversation')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Public gallery' }));
    expect(screen.getByRole('button', { name: 'Open LikhAI customer support' })).toBeInTheDocument();
    expect(screen.queryByText('Support conversation')).not.toBeInTheDocument();
  });
  it('retains existing mobile product hiding and desktop public availability', () => {
    const desktop = show('/product/vase'); expect(screen.getByRole('button', { name: 'Open LikhAI customer support' })).toBeInTheDocument(); desktop.unmount();
    mobile = true; show('/product/vase'); expect(screen.queryByRole('button', { name: 'Open LikhAI customer support' })).not.toBeInTheDocument();
  });
});
