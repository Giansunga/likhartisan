import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ProductTable from '../ProductTable';
import type { Product } from '../../../types';

const products: Product[] = Array.from({ length: 13 }, (_, index) => ({
  id: `product-${index + 1}`,
  name: `Product ${index + 1}`,
  description: '',
  category: 'Vases',
  price: index + 1,
  stock: 10,
  inStock: true,
  image: '/product.png',
  materials: 'Clay',
  dimensions: '10 x 10 cm',
  height: '10 cm',
  openingDiameter: '5 cm',
  technique: 'Handmade',
  shopId: 'shop-1',
  shopName: 'Test Shop',
  status: 'active',
  views: 0,
  ratingAvg: 0,
  ratingCount: 0,
  createdAt: new Date(2026, 0, index + 1).toISOString(),
  updatedAt: new Date(2026, 0, index + 1).toISOString(),
}));

const handlers = {
  onDelete: vi.fn(),
  onArchive: vi.fn(),
  onEdit: vi.fn(),
};

afterEach(() => {
  window.sessionStorage.clear();
});

describe('ProductTable pagination', () => {
  it('restores the selected page after switching away and returning', () => {
    const firstRender = render(<ProductTable products={products} {...handlers} />);

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(window.sessionStorage.getItem('admin-products-page')).toBe('2');
    firstRender.unmount();

    render(<ProductTable products={products} {...handlers} />);

    expect(screen.getByRole('button', { name: '2' }).className).toContain('bg-primary');
  });

  it('clamps a restored page when fewer product pages are available', () => {
    window.sessionStorage.setItem('admin-products-page', '3');

    render(<ProductTable products={products.slice(0, 7)} {...handlers} />);

    expect(screen.getByRole('button', { name: '2' }).className).toContain('bg-primary');
    expect(window.sessionStorage.getItem('admin-products-page')).toBe('2');
  });
});
