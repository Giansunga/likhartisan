import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();
const approveRpc = vi.fn();
const checkoutDesignOrder = vi.fn();
vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    rpc: (...args: unknown[]) => approveRpc(...args),
  },
}));
vi.mock('../../../lib/designQuoteCheckout', () => ({ checkoutDesignOrder: (...args: unknown[]) => checkoutDesignOrder(...args) }));

import QuoteReviewModal from '../QuoteReviewModal';

const quoted = { id: 'request-1', status: 'quoted', quantity: 2, quoted_price: 4200, lead_time_days: 14, shop_response: 'Hand finished.', conversation_id: 'conversation-1', design_snapshot: null, order_id: null };

function showModal() {
  render(<MemoryRouter><QuoteReviewModal requestId="request-1" onClose={vi.fn()} /></MemoryRouter>);
}

describe('QuoteReviewModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: quoted, error: null });
    approveRpc.mockResolvedValue({ data: { ...quoted, status: 'approved', order_id: 'order-1' }, error: null });
    checkoutDesignOrder.mockResolvedValue(undefined);
  });

  it('loads the current quote and approves it once before checkout', async () => {
    showModal();
    expect(screen.getByText('Loading quote…')).toBeInTheDocument();
    const approve = await screen.findByRole('button', { name: 'Approve Quote & Pay' });
    expect(screen.getByText('₱4,200.00')).toBeInTheDocument();
    expect(screen.getByText('Hand finished.')).toBeInTheDocument();
    fireEvent.click(approve);
    fireEvent.click(approve);
    await waitFor(() => expect(checkoutDesignOrder).toHaveBeenCalledWith('order-1'));
    expect(approveRpc).toHaveBeenCalledTimes(1);
    expect(approveRpc).toHaveBeenCalledWith('approve_design_request', { p_request_id: 'request-1' });
  });

  it('preserves approval and offers Pay now after checkout fails', async () => {
    checkoutDesignOrder.mockRejectedValueOnce(new Error('Payment unavailable'));
    maybeSingle.mockResolvedValueOnce({ data: quoted, error: null }).mockResolvedValueOnce({ data: { ...quoted, status: 'approved', order_id: 'order-1' }, error: null });
    showModal();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve Quote & Pay' }));
    expect(await screen.findByText(/Payment unavailable.*approval is saved/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pay now' }));
    await waitFor(() => expect(checkoutDesignOrder).toHaveBeenCalledTimes(2));
    expect(approveRpc).toHaveBeenCalledTimes(1);
  });

  it('does not approve an outdated or missing quote', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { ...quoted, status: 'changes_requested' }, error: null });
    showModal();
    expect(await screen.findByText(/no longer ready for approval/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve Quote & Pay' })).not.toBeInTheDocument();
    expect(approveRpc).not.toHaveBeenCalled();
  });

  it('shows an approval failure without starting checkout', async () => {
    approveRpc.mockResolvedValueOnce({ data: null, error: { message: 'Quote expired' } });
    showModal();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve Quote & Pay' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Quote expired');
    expect(checkoutDesignOrder).not.toHaveBeenCalled();
  });
});
