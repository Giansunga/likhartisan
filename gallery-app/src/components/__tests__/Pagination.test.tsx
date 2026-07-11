import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Pagination from '../Pagination';

function renderPagination(overrides = {}) {
  const defaultProps = {
    page: 1,
    totalPages: 5,
    total: 100,
    pageSize: 24,
    onPageChange: vi.fn(),
    ...overrides,
  };
  return { ...defaultProps, ...render(
    <MemoryRouter><Pagination {...defaultProps} /></MemoryRouter>
  ) };
}

describe('Pagination', () => {
  it('renders nothing when totalPages is 1', () => {
    const { container } = renderPagination({ totalPages: 1 });
    expect(container.innerHTML).toBe('');
  });

  it('shows correct range text', () => {
    renderPagination({ page: 1, total: 50, pageSize: 24 });
    expect(screen.getByText('Showing 1–24 of 50 products')).toBeDefined();
  });

  it('calls onPageChange when clicking Next', () => {
    const onPageChange = vi.fn();
    renderPagination({ page: 1, totalPages: 3, onPageChange });
    const nextBtn = screen.getByLabelText('Next page');
    fireEvent.click(nextBtn);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables Previous on first page', () => {
    renderPagination({ page: 1 });
    const prevBtn = screen.getByLabelText('Previous page');
    expect(prevBtn).toBeDisabled();
  });

  it('disables Next on last page', () => {
    renderPagination({ page: 5, totalPages: 5 });
    const nextBtn = screen.getByLabelText('Next page');
    expect(nextBtn).toBeDisabled();
  });

  it('calls onPageChange when clicking a page number', () => {
    const onPageChange = vi.fn();
    renderPagination({ page: 1, totalPages: 5, onPageChange });
    const page3 = screen.getByLabelText('Page 3');
    fireEvent.click(page3);
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('highlights current page', () => {
    renderPagination({ page: 2, totalPages: 5 });
    const currentPage = screen.getByLabelText('Page 2');
    expect(currentPage.getAttribute('aria-current')).toBe('page');
  });
});
