import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CartItem } from '../../../types';
import { CartSummary, ShopCartGroup } from '../CartComponents';
import { getCartLineKey } from '../../../lib/cartCheckout';

const item: CartItem = {
  productId: 'p1',
  productName: 'Hand-thrown vase',
  image: '/vase.jpg',
  price: 850,
  qty: 1,
  shopId: 's1',
  shopName: 'Clay House',
};

describe('cart components', () => {
  it('exposes labelled selection, quantity, and removal controls', () => {
    const onToggleItem = vi.fn();
    const onQuantityChange = vi.fn();
    const onRemove = vi.fn();
    render(
      <MemoryRouter>
        <ShopCartGroup
          shopKey="s1"
          shopName="Clay House"
          items={[item]}
          activeShopKey="s1"
          selected={new Set([getCartLineKey(item)])}
          getAvailability={() => ({ status: 'ready', stock: 3, available: true })}
          onToggleShop={vi.fn()}
          onToggleItem={onToggleItem}
          onQuantityChange={onQuantityChange}
          onRemove={onRemove}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText('Select Hand-thrown vase'));
    fireEvent.click(screen.getByLabelText('Increase quantity of Hand-thrown vase'));
    fireEvent.click(screen.getByLabelText('Remove Hand-thrown vase from cart'));

    expect(onToggleItem).toHaveBeenCalledWith(item);
    expect(onQuantityChange).toHaveBeenCalledWith(item, 1);
    expect(onRemove).toHaveBeenCalledWith(item);
  });

  it('keeps courier estimation optional while checkout remains available', () => {
    const onCheckout = vi.fn();
    render(
      <CartSummary
        shopName="Clay House"
        itemCount={2}
        subtotal={1700}
        deliveryOption="courier"
        address=""
        estimateFee={null}
        estimateLoading={false}
        estimateError=""
        onDeliveryOptionChange={vi.fn()}
        onAddressChange={vi.fn()}
        onEstimate={vi.fn()}
        onCheckout={onCheckout}
      />,
    );

    expect(screen.getByText('At checkout')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Checkout 2 items' }));
    expect(onCheckout).toHaveBeenCalledOnce();
  });

  it('caps quantity controls at the validated stock level', () => {
    render(
      <MemoryRouter>
        <ShopCartGroup
          shopKey="s1"
          shopName="Clay House"
          items={[{ ...item, qty: 3 }]}
          activeShopKey="s1"
          selected={new Set([getCartLineKey(item)])}
          getAvailability={() => ({ status: 'ready', stock: 3, available: true })}
          onToggleShop={vi.fn()}
          onToggleItem={vi.fn()}
          onQuantityChange={vi.fn()}
          onRemove={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Increase quantity of Hand-thrown vase')).toBeDisabled();
  });
});
