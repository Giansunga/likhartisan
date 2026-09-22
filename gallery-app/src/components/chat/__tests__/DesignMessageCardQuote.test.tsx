import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const openQuoteReview = vi.fn();
vi.mock('../QuoteReviewContext', () => ({ useQuoteReview: () => openQuoteReview }));
vi.mock('../../../lib/supabase', () => ({ supabase: {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'request-1', status: 'quoted', quantity: 1, quoted_price: 2500, lead_time_days: 10, design_snapshot: { model: { name: 'Vase' }, material: {}, decoration: {}, dimensions: {} } }, error: null }) }) }) }),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: vi.fn(),
} }));
import DesignMessageCard from '../DesignMessageCard';

it('opens quote review from the buyer message card', async () => {
  render(<DesignMessageCard data={{ type: 'design_request_update', version: 1, request_id: 'request-1', message: 'Quote sent' }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Review Shop Quote' }));
  expect(openQuoteReview).toHaveBeenCalledWith('request-1');
});

it('shares one realtime subscription when the same request appears in multiple messages', async () => {
  render(<>
    <DesignMessageCard data={{ type: 'design_request', version: 1, request_id: 'request-1', message: 'Design sent' }} />
    <DesignMessageCard data={{ type: 'design_request_update', version: 1, request_id: 'request-1', message: 'Quote sent' }} />
  </>);
  expect(await screen.findAllByRole('button', { name: 'Review Shop Quote' })).toHaveLength(2);
});
