import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProductTable from '../ProductTable';
import type { Product } from '../../../types';

const product: Product = {
  id: 'product-1', name: 'Sample Vase', description: '', category: 'Vases', price: 450, stock: 2, inStock: true,
  image: '/product.png', materials: 'Clay', dimensions: '', height: '', openingDiameter: '', technique: 'Handmade',
  shopId: 'shop-1', shopName: 'Test Shop', status: 'active', views: 8, ratingAvg: 0, ratingCount: 0,
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z',
};

describe('ProductTable', () => {
  it('renders inventory and exposes edit plus menu actions', () => {
    const handlers = { onEdit: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn() };
    render(<ProductTable products={[product]} {...handlers} />);

    expect(screen.getAllByText('Low stock').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect(handlers.onEdit).toHaveBeenCalledWith(product);
    fireEvent.click(screen.getAllByRole('button', { name: /More actions/ })[0]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive product' }));
    expect(handlers.onArchive).toHaveBeenCalledWith(product);
  });

  it('disables duplicate actions for the busy product', () => {
    render(<ProductTable products={[product]} busyProductId="product-1" onEdit={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: 'Working…' })[0]).toBeDisabled();
  });
});
