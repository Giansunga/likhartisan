import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShopArtisans } from '../../../hooks/useShopArtisans';
import FeaturedArtisanSelect from '../FeaturedArtisanSelect';
import { useState } from 'react';

const mocks = vi.hoisted(() => ({ load: vi.fn(), filter: vi.fn(), order: vi.fn() }));
vi.mock('../../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: (key: string, value: string) => {
  mocks.filter(key, value);
  return { order: (key: string) => { mocks.order(key); return mocks.load(value); } };
} }) }) } }));
function Form({ shopId }: { shopId: string }) {
  const options = useShopArtisans(shopId);
  const [value, setValue] = useState('');
  return <FeaturedArtisanSelect shopId={shopId} value={value} onChange={setValue} {...options} />;
}
const juan = { id: 'juan', shop_id: 'one', name: 'Juan Dela Cruz', specialty: 'Master Potter' };
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue({ data: [juan], error: null }); });
describe('shop artisan selector', () => {
  it('waits for a shop and filters/sorts artisan choices with keyboard-accessible labeling', async () => {
    const { rerender } = render(<Form shopId="" />);
    expect(screen.getByRole('combobox', { name: 'Featured Artisan *' })).toBeDisabled();
    expect(mocks.load).not.toHaveBeenCalled();
    rerender(<Form shopId="one" />);
    await screen.findByRole('option', { name: 'Juan Dela Cruz' });
    expect(mocks.filter).toHaveBeenCalledWith('shop_id', 'one');
    expect(mocks.order).toHaveBeenCalledWith('name');
    const select = screen.getByRole('combobox');
    expect(select).toBeRequired();
    select.focus(); expect(select).toHaveFocus();
    fireEvent.change(select, { target: { value: 'juan' } });
    expect(screen.getByText('Master Potter')).toBeInTheDocument();
  });
  it('shows an empty-shop explanation and management link', async () => {
    mocks.load.mockResolvedValue({ data: [], error: null });
    render(<Form shopId="one" />);
    expect(await screen.findByText(/No artisans belong/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Artisan Management' })).toHaveAttribute('href', '/admin/artisans');
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
  it('retries a failed request', async () => {
    mocks.load.mockResolvedValueOnce({ data: null, error: { message: 'Network failure' } });
    render(<Form shopId="one" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load artisans');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('option', { name: 'Juan Dela Cruz' })).toBeInTheDocument();
  });
  it('ignores late responses from a previously selected shop', async () => {
    let resolveOld!: (result: unknown) => void;
    mocks.load.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    mocks.load.mockResolvedValueOnce({ data: [{ ...juan, id: 'ana', shop_id: 'two', name: 'Ana' }], error: null });
    const { rerender } = render(<Form shopId="one" />);
    rerender(<Form shopId="two" />);
    await screen.findByRole('option', { name: 'Ana' });
    resolveOld({ data: [juan], error: null });
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Juan Dela Cruz' })).not.toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Ana' })).toBeInTheDocument();
  });
});
