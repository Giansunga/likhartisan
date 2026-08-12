import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Order } from '../../../types';
import { formatCurrency, formatPlacedDate, formatPlacedTime } from './orderManagementUtils';
import './orders.css';

export type QueueKey = 'all' | 'pending' | 'preparing' | 'shipped' | 'delivered' | 'completed' | 'cancelled';
export type DetailTab = 'overview' | 'payment' | 'delivery' | 'activity' | 'problems';

export interface QueueTab {
  key: QueueKey;
  label: string;
  count: number;
}

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

const PAYMENT_OPTIONS = ['pending', 'paid', 'failed', 'refunded'];
const TYPE_OPTIONS = [
  { value: 'product', label: 'Regular Product' },
  { value: 'customized', label: 'Customized Pottery' },
];

export function StatusBadge({ kind, status }: { kind: 'payment' | 'order' | 'delivery'; status?: string }) {
  const palettes: Record<string, { background: string; color: string }> = {
    pending: { background: '#FFF3E0', color: '#B45309' },
    paid: { background: '#E8F5E9', color: '#2E7D32' },
    failed: { background: '#FFEBEE', color: '#C62828' },
    refunded: { background: '#F3E5F5', color: '#6A1B9A' },
    preparing: { background: '#E3F2FD', color: '#1565C0' },
    shipped: { background: '#F3E5F5', color: '#6A1B9A' },
    delivered: { background: '#E8F5E9', color: '#2E7D32' },
    completed: { background: '#E8F5E9', color: '#1B5E20' },
    cancelled: { background: '#FFEBEE', color: '#C62828' },
  };
  const normalized = status || 'pending';
  const palette = palettes[normalized] || palettes.pending;
  return (
    <span className={`orders-status-badge orders-status-badge--${kind}`} style={palette}>
      {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
    </span>
  );
}

export function QueueTabs({ tabs, active, onChange }: { tabs: QueueTab[]; active: QueueKey; onChange: (key: QueueKey) => void }) {
  return (
    <nav className="orders-queue-tabs" aria-label="Order fulfillment queues">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`orders-queue-tab${active === tab.key ? ' orders-queue-tab--active' : ''}`}
          aria-current={active === tab.key ? 'page' : undefined}
          onClick={() => onChange(tab.key)}
        >
          <span>{tab.label}</span>
          <span className="orders-queue-count">{tab.count}</span>
        </button>
      ))}
    </nav>
  );
}

export function ExceptionSummary({
  paymentIssues,
  problematic,
  investigations,
  onPaymentIssues,
  onProblematic,
  onInvestigations,
}: {
  paymentIssues: number;
  problematic: number;
  investigations: number;
  onPaymentIssues: () => void;
  onProblematic: () => void;
  onInvestigations: () => void;
}) {
  if (paymentIssues + problematic + investigations === 0) return null;
  return (
    <aside className="orders-exceptions" aria-label="Orders requiring attention">
      <div className="orders-exceptions-copy">
        <span className="orders-exceptions-icon" aria-hidden="true">!</span>
        <div><strong>Needs attention</strong><span>Review exceptions before they delay fulfillment.</span></div>
      </div>
      <div className="orders-exception-actions">
        <button type="button" onClick={onPaymentIssues}>Payment issues <strong>{paymentIssues}</strong></button>
        <button type="button" onClick={onProblematic}>Problems <strong>{problematic}</strong></button>
        <button type="button" onClick={onInvestigations}>Investigations <strong>{investigations}</strong></button>
      </div>
    </aside>
  );
}

export function OrdersToolbar({
  search,
  onSearchChange,
  advancedOpen,
  onToggleAdvanced,
  payment,
  onPaymentChange,
  orderType,
  onOrderTypeChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  chips,
  onClearAll,
  onExport,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  payment: string;
  onPaymentChange: (value: string) => void;
  orderType: string;
  onOrderTypeChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  chips: FilterChip[];
  onClearAll: () => void;
  onExport: () => void;
}) {
  return (
    <section className="orders-toolbar" aria-label="Order search and filters">
      <div className="orders-toolbar-main">
        <label className="orders-search">
          <span className="sr-only">Search orders</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search order, customer, product, or shop…" />
        </label>
        <button type="button" className={`orders-filter-button${advancedOpen ? ' is-active' : ''}`} aria-expanded={advancedOpen} onClick={onToggleAdvanced}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          Filters{chips.length > 0 ? ` (${chips.length})` : ''}
        </button>
        <button type="button" className="orders-export-button" onClick={onExport}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></svg>
          Export CSV
        </button>
      </div>

      <AnimatePresence initial={false}>
        {advancedOpen ? (
          <motion.div className="orders-advanced-filters" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <label><span>Payment</span><select value={payment} onChange={(event) => onPaymentChange(event.target.value)}><option value="all">All payments</option>{PAYMENT_OPTIONS.map((item) => <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}</select></label>
            <label><span>Order type</span><select value={orderType} onChange={(event) => onOrderTypeChange(event.target.value)}><option value="all">All types</option>{TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label><span>From</span><input type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} /></label>
            <label><span>To</span><input type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} /></label>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {chips.length > 0 ? (
        <div className="orders-filter-chips">
          {chips.map((chip) => <button type="button" key={chip.key} onClick={chip.onRemove}>{chip.label}<span aria-hidden="true">×</span></button>)}
          <button type="button" className="orders-clear-filters" onClick={onClearAll}>Clear all</button>
        </div>
      ) : null}
    </section>
  );
}

function OrderIndicators({ order }: { order: Order }) {
  return (
    <span className="orders-indicators">
      {order.is_problematic ? <span className="orders-indicator orders-indicator--problem">Problem</span> : null}
      {order.flagged_for_investigation ? <span className="orders-indicator orders-indicator--investigation">Investigation</span> : null}
    </span>
  );
}

function ItemSummary({ order, compact = false }: { order: Order; compact?: boolean }) {
  const first = order.items?.[0];
  if (!first) return <span className="orders-muted">No items</span>;
  return (
    <div className="orders-item-summary">
      {first.image ? <img src={first.image} alt="" /> : <span className="orders-item-placeholder" aria-hidden="true" />}
      <div><strong>{first.product_name || 'Product'}</strong><span>{compact ? `${first.qty} item${first.qty === 1 ? '' : 's'}` : `${first.shop_name || 'Shop'} · Qty ${first.qty}`}</span></div>
      {order.items.length > 1 ? <em>+{order.items.length - 1}</em> : null}
    </div>
  );
}

export function OrdersList({
  orders,
  loading,
  error,
  onRetry,
  onOpen,
  sortField,
  sortDir,
  onSort,
}: {
  orders: Order[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
  onOpen: (order: Order) => void;
  sortField: 'created_at' | 'total';
  sortDir: 'asc' | 'desc';
  onSort: (field: 'created_at' | 'total') => void;
}) {
  const empty = !loading && !error && orders.length === 0;
  return (
    <section className="orders-list-card" aria-live="polite">
      <div className="orders-desktop-table">
        <table>
          <thead><tr><th>Order / Customer</th><th>Items</th><th>Fulfillment</th><th>Payment</th><th><button type="button" onClick={() => onSort('total')}>Total {sortField === 'total' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</button></th><th><button type="button" onClick={() => onSort('created_at')}>Placed {sortField === 'created_at' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</button></th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading ? Array.from({ length: 6 }).map((_, row) => <tr key={row}>{Array.from({ length: 7 }).map((__, column) => <td key={column}><span className="orders-skeleton" /></td>)}</tr>) : null}
            {!loading ? orders.map((order) => (
              <tr key={order.id} tabIndex={0} onClick={() => onOpen(order)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(order); } }}>
                <td><div className="orders-order-cell"><strong>#{order.id.slice(0, 8).toUpperCase()}</strong><span>{order.user_name || 'Customer'}</span><small>{order.email || order.buyer_email || ''}</small><OrderIndicators order={order} /></div></td>
                <td><ItemSummary order={order} /></td>
                <td><StatusBadge kind="delivery" status={order.status === 'cancelled' ? 'cancelled' : order.delivery_status} /></td>
                <td><StatusBadge kind="payment" status={order.payment_status} /></td>
                <td className="orders-total-cell">{formatCurrency(order.total || 0)}</td>
                <td><span className="orders-date-cell">{formatPlacedDate(order.created_at)}<small>{formatPlacedTime(order.created_at)}</small></span></td>
                <td><button type="button" className="orders-view-button" onClick={(event) => { event.stopPropagation(); onOpen(order); }}>View</button></td>
              </tr>
            )) : null}
          </tbody>
        </table>
      </div>

      <div className="orders-mobile-list">
        {loading ? Array.from({ length: 4 }).map((_, index) => <div className="orders-mobile-card orders-mobile-card--loading" key={index}><span className="orders-skeleton" /><span className="orders-skeleton" /><span className="orders-skeleton" /></div>) : null}
        {!loading ? orders.map((order) => (
          <article className="orders-mobile-card" key={order.id}>
            <button type="button" className="orders-mobile-card-main" onClick={() => onOpen(order)}>
              <span className="orders-mobile-card-header"><span><strong>#{order.id.slice(0, 8).toUpperCase()}</strong><small>{formatPlacedDate(order.created_at)}</small></span><b>{formatCurrency(order.total || 0)}</b></span>
              <span className="orders-mobile-customer">{order.user_name || 'Customer'}</span>
              <ItemSummary order={order} compact />
              <span className="orders-mobile-statuses"><StatusBadge kind="delivery" status={order.status === 'cancelled' ? 'cancelled' : order.delivery_status} /><StatusBadge kind="payment" status={order.payment_status} /></span>
              <OrderIndicators order={order} />
              <span className="orders-mobile-view">View order <span aria-hidden="true">→</span></span>
            </button>
          </article>
        )) : null}
      </div>

      {error ? <div className="orders-empty-state"><strong>Orders couldn’t be loaded</strong><span>{error}</span><button type="button" onClick={onRetry}>Try again</button></div> : null}
      {empty ? <div className="orders-empty-state"><strong>No orders found</strong><span>Try another queue or remove some filters.</span></div> : null}
    </section>
  );
}

const DETAIL_TABS: Array<{ key: DetailTab; label: string }> = [
  { key: 'overview', label: 'Summary' },
  { key: 'payment', label: 'Payment' },
  { key: 'delivery', label: 'Fulfillment' },
  { key: 'activity', label: 'Activity' },
  { key: 'problems', label: 'Issues' },
];

export function OrderDetailDrawer({
  order,
  activeTab,
  onTabChange,
  onClose,
  onToggleInvestigation,
  children,
  footer,
}: {
  order: Order | null;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onClose: () => void;
  onToggleInvestigation: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!order) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); };
  }, [order, onClose]);

  return (
    <AnimatePresence>
      {order ? (
        <>
          <motion.button className="orders-drawer-overlay" type="button" aria-label="Close order details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside className="orders-drawer" role="dialog" aria-modal="true" aria-labelledby="order-detail-title" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 280 }}>
            <header className="orders-drawer-header">
              <div className="orders-drawer-title"><span>Order detail</span><h2 id="order-detail-title">#{order.id.slice(0, 8).toUpperCase()}</h2><p>{formatPlacedDate(order.created_at)} · {order.order_type === 'customized' ? 'Customized pottery' : 'Regular product'}</p></div>
              <div className="orders-drawer-header-actions">
                <button type="button" className={order.flagged_for_investigation ? 'is-flagged' : ''} onClick={onToggleInvestigation} aria-label={order.flagged_for_investigation ? 'Remove investigation flag' : 'Flag for investigation'} title={order.flagged_for_investigation ? 'Remove investigation flag' : 'Flag for investigation'}>!</button>
                <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close order details">×</button>
              </div>
              <div className="orders-drawer-statuses"><StatusBadge kind="order" status={order.status} /><StatusBadge kind="payment" status={order.payment_status} /><StatusBadge kind="delivery" status={order.delivery_status} /></div>
            </header>
            <div className="orders-drawer-tabs" role="tablist" aria-label="Order detail sections">{DETAIL_TABS.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.key} className={activeTab === tab.key ? 'is-active' : ''} key={tab.key} onClick={() => onTabChange(tab.key)}>{tab.label}</button>)}</div>
            <div className="orders-drawer-body" role="tabpanel">{children}</div>
            {footer ? <footer className="orders-drawer-footer">{footer}</footer> : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
