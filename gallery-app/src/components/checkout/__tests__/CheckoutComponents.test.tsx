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
  it('shows saved contact details without editable fields and links to Profile', () => {
    const edit = vi.fn();
    render(<ContactCard name="Buyer" phone="09123456789" address="San Fernando, Pampanga" requiresAddress onEditProfile={edit} />);
    expect(screen.getByText('San Fernando, Pampanga')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save details' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit in Profile' }));
    expect(edit).toHaveBeenCalledOnce();
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

  it('shows a calculating state while a courier quote is loading', () => {
    render(
      <DeliveryCard
        value="courier"
        shopAddress="Santo Tomas, Pampanga"
        vehicleLabel="Motorcycle"
        itemCount={1}
        totalKg={2}
        quoteFee={null}
        quoteDistanceKm={null}
        quoteLoading
        quoteError={null}
        onChange={vi.fn()}
        onRetryQuote={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Calculating delivery fee…');
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
