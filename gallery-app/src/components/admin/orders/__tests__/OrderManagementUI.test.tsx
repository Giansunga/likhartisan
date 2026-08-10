import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Order } from '../../../../types';
import {
  OrderDetailDrawer,
  OrdersList,
  OrdersToolbar,
  QueueTabs,
} from '../OrderManagementUI';
import { matchesQueue } from '../orderManagementUtils';

const order: Order = {
  id: '12345678-aaaa-bbbb-cccc-123456789012',
  user_name: 'Maria Santos',
  email: 'maria@example.com',
  items: [{ product_id: 'pot-1', product_name: 'Handmade Pot', qty: 1, price: 850, shop_name: 'Clay House' }],
  subtotal: 850,
  shipping_fee: 100,
  total: 950,
  status: 'paid',
  payment_status: 'paid',
  delivery_status: 'preparing',
  created_at: '2026-08-10T04:00:00.000Z',
};

describe('orders management UI', () => {
  it('classifies every fulfillment queue without leaking cancelled orders', () => {
    expect(matchesQueue({ ...order, delivery_status: 'pending' }, 'pending')).toBe(true);
    expect(matchesQueue(order, 'preparing')).toBe(true);
    expect(matchesQueue({ ...order, delivery_status: 'shipped' }, 'shipped')).toBe(true);
    expect(matchesQueue({ ...order, delivery_status: 'delivered' }, 'delivered')).toBe(true);
    expect(matchesQueue({ ...order, status: 'completed', delivery_status: 'completed' }, 'completed')).toBe(true);
    expect(matchesQueue({ ...order, status: 'cancelled', delivery_status: 'preparing' }, 'cancelled')).toBe(true);
    expect(matchesQueue({ ...order, status: 'cancelled', delivery_status: 'preparing' }, 'preparing')).toBe(false);
  });

  it('renders queue counts and changes the active queue', () => {
    const onChange = vi.fn();
    render(<QueueTabs active="all" onChange={onChange} tabs={[
      { key: 'all', label: 'All orders', count: 12 },
      { key: 'preparing', label: 'Preparing', count: 3 },
    ]} />);

    expect(screen.getByRole('button', { name: /All orders\s*12/ })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: /Preparing\s*3/ }));
    expect(onChange).toHaveBeenCalledWith('preparing');
  });

  it('supports advanced filters, removable chips, and export', () => {
    const onToggleAdvanced = vi.fn();
    const onRemove = vi.fn();
    const onExport = vi.fn();
    render(
      <OrdersToolbar
        search="Maria"
        onSearchChange={vi.fn()}
        advancedOpen
        onToggleAdvanced={onToggleAdvanced}
        payment="failed"
        onPaymentChange={vi.fn()}
        orderType="all"
        onOrderTypeChange={vi.fn()}
        dateFrom=""
        onDateFromChange={vi.fn()}
        dateTo=""
        onDateToChange={vi.fn()}
        chips={[{ key: 'payment', label: 'Payment: failed', onRemove }]}
        onClearAll={vi.fn()}
        onExport={onExport}
      />,
    );

    expect(screen.getByLabelText('Search orders')).toHaveValue('Maria');
    expect(screen.getByLabelText('Payment')).toHaveValue('failed');
    fireEvent.click(screen.getByRole('button', { name: /Payment: failed/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('renders desktop and mobile order summaries and opens the order', () => {
    const onOpen = vi.fn();
    render(<OrdersList orders={[order]} loading={false} onRetry={vi.fn()} onOpen={onOpen} sortField="created_at" sortDir="desc" onSort={vi.fn()} />);

    expect(screen.getAllByText('#12345678')).toHaveLength(2);
    expect(screen.getAllByText('Maria Santos')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /View order/ }));
    expect(onOpen).toHaveBeenCalledWith(order);
  });

  it('provides accessible detail tabs and closes with Escape', () => {
    const onClose = vi.fn();
    const onTabChange = vi.fn();
    render(
      <OrderDetailDrawer
        order={order}
        activeTab="overview"
        onTabChange={onTabChange}
        onClose={onClose}
        onToggleInvestigation={vi.fn()}
        footer={<button type="button">Ship order</button>}
      >
        <p>Order summary content</p>
      </OrderDetailDrawer>,
    );

    expect(screen.getByRole('dialog', { name: '#12345678' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Ship order' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Fulfillment' }));
    expect(onTabChange).toHaveBeenCalledWith('delivery');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
