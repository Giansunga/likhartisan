import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CartItem } from '../../../types';
import { ContactCard, DeliveryCard, OrderReview } from '../CheckoutComponents';

const item: CartItem = {
  productId: 'pot-1',
  productName: 'Hand-thrown vase',
  image: '/vase.jpg',
  price: 850,
  qty: 2,
  shopId: 'shop-1',
  shopName: 'Clay House',
  variation: '18 in × 8 in',
};

describe('checkout components', () => {
  it('provides labelled contact fields and save controls', () => {
    const onFormChange = vi.fn();
    render(
      <ContactCard
        name="Buyer"
        phone="09123456789"
        address="San Fernando, Pampanga"
        editing
        form={{ name: 'Buyer', phone: '09123456789', address: 'San Fernando, Pampanga' }}
        saving={false}
        requiresAddress
        onEdit={vi.fn()}
        onCancel={vi.fn()}
        onFormChange={onFormChange}
        onSave={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '09999999999' } });
    expect(onFormChange).toHaveBeenCalledWith(expect.objectContaining({ phone: '09999999999' }));
    expect(screen.getByRole('button', { name: 'Save details' })).toBeEnabled();
  });

  it('shows courier quote failures with an explicit retry action', () => {
    const onRetryQuote = vi.fn();
    render(
      <DeliveryCard
        value="courier"
        shopAddress="Santo Tomas, Pampanga"
        vehicleLabel="Motorcycle"
        itemCount={2}
        totalKg={4.2}
        quoteFee={null}
        quoteDistanceKm={null}
        quoteLoading={false}
        quoteError="We could not confirm a courier fee."
        onChange={vi.fn()}
        onRetryQuote={onRetryQuote}
      />,
    );

    expect(screen.getByText('We could not confirm a courier fee.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryQuote).toHaveBeenCalledOnce();
  });

  it('explains why payment is unavailable and totals only the reviewed items', () => {
    render(
      <OrderReview
        items={[item]}
        subtotal={1700}
        shippingFee={0}
        total={1700}
        deliveryOption={null}
        quoteLoading={false}
        hasCourierQuote={false}
        placing={false}
        disabledReason="Select pickup or courier delivery."
        onPlaceOrder={vi.fn()}
      />,
    );

    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(screen.getAllByText('₱1,700.00')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Continue to secure payment/ })).toBeDisabled();
    expect(screen.getByText('Select pickup or courier delivery.')).toBeInTheDocument();
  });
});
