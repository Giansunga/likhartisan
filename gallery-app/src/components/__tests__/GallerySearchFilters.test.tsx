import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GallerySearchFilters from '../GallerySearchFilters';

const plan = {
  semanticQuery: 'terracotta vase',
  filters: {
    category: 'Vases',
    shopId: null,
    minPrice: null,
    maxPrice: 2000,
    material: 'Terracotta',
    technique: null,
  },
};

const options = {
  categories: ['Planters', 'Vases'],
  shops: [{ id: '6b7be271-c73c-49db-b228-4bb899c8020c', name: 'Tomas Pottery' }],
  materials: ['Stoneware', 'Terracotta'],
  techniques: ['Hand-built', 'Wheel-thrown'],
};

describe('GallerySearchFilters', () => {
  it('exposes detected constraints as removable chips', () => {
    const onChange = vi.fn();
    render(<GallerySearchFilters plan={plan} options={options} parserFallback={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove Up to ₱2,000 filter' }));
    expect(onChange).toHaveBeenCalledWith({
      ...plan,
      filters: { ...plan.filters, maxPrice: null },
    });
  });

  it('opens an accessible compact editor and applies catalog-only values', () => {
    const onChange = vi.fn();
    render(<GallerySearchFilters plan={plan} options={options} parserFallback={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit filters' }));
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Planters' } });
    fireEvent.change(screen.getByLabelText('Minimum price'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(onChange).toHaveBeenCalledWith({
      ...plan,
      filters: { ...plan.filters, category: 'Planters', minPrice: 500 },
    });
  });
});
