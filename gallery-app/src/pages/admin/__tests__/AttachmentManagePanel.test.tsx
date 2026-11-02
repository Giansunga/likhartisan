import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AttachmentManagePanel from '../AttachmentManagePanel';

interface Query { table: string; operation: 'select' | 'upsert' | 'delete'; filters: Record<string, unknown>; payload?: Record<string, unknown> }
interface Result { data: unknown; error: { message: string } | null }
const mocks = vi.hoisted(() => ({
  query: vi.fn<(query: Query) => Promise<Result> | Result | undefined>(),
  refresh: null as null | (() => Promise<void>),
}));

vi.mock('../../../components/freeform/FreeformViewer', () => ({ default: () => <div>Model preview</div> }));
vi.mock('../../../components/freeform/generatedAttachmentCatalog', () => ({ GENERATED_ATTACHMENT_RECIPES: [
  { key: 'loop', name: 'Loop', family: 'handle', style: 'minimal', version: 1, thumbnail: '/loop.png' },
  { key: 'bridge', name: 'Bridge', family: 'handle', style: 'minimal', version: 1, thumbnail: '/bridge.png' },
] }));
vi.mock('../../../realtime/usePortalRealtimeRefresh', () => ({ usePortalRealtimeRefresh: (_tables: string[], refresh: () => Promise<void>) => { mocks.refresh = refresh; } }));
vi.mock('../../../lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    const query: Query = { table, operation: 'select', filters: {} };
    const execute = async (): Promise<Result> => {
      const override = mocks.query({ ...query, filters: { ...query.filters } });
      if (override) return override;
      if (query.operation === 'upsert') return { data: { recipe_key: query.payload?.recipe_key }, error: null };
      if (query.table === 'generated_attachment_catalog_settings') return { data: ['loop', 'bridge'].map(recipe_key => ({ recipe_key, active: true, default_price: 10, default_production_days: 1 })), error: null };
      if (query.table === 'shops') return { data: [{ id: 'shop-a', name: 'Shop A' }, { id: 'shop-b', name: 'Shop B' }], error: null };
      if (query.table === 'generated_attachment_shop_overrides') return { data: ['loop', 'bridge'].map(recipe_key => ({ recipe_key, shop_id: query.filters.shop_id, enabled: true, price_adjustment: query.filters.shop_id === 'shop-a' ? 100 : 200, production_days_adjustment: 2 })), error: null };
      return { data: [], error: null };
    };
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { query.filters[key] = value; return builder; },
      upsert: (payload: Record<string, unknown>) => { query.operation = 'upsert'; query.payload = payload; return builder; },
      delete: () => { query.operation = 'delete'; return builder; },
      order: execute,
      single: execute,
      maybeSingle: execute,
      then: (resolve: (value: Result) => unknown, reject?: (error: unknown) => unknown) => execute().then(resolve, reject),
    };
    return builder;
  },
} }));

function deferred() {
  let resolve!: (value: Result) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Result>((done, fail) => { resolve = done; reject = fail; });
  return { resolve, reject, promise };
}

function row(kind: 'global' | 'override', recipe = 'Loop') {
  const heading = screen.getByRole('heading', { name: kind === 'global' ? 'Global catalog' : 'Per-shop overrides' });
  const section = kind === 'global' ? heading.parentElement!.parentElement! : heading.closest('section')!;
  return within(section).getByText(recipe, { selector: 'strong' }).parentElement!.parentElement!;
}

async function openPanel() {
  render(<AttachmentManagePanel onBack={vi.fn()} />);
  await screen.findByRole('heading', { name: 'Global catalog' });
}

async function chooseShop(id = 'shop-a') {
  fireEvent.change(screen.getByLabelText('Shop'), { target: { value: id } });
  await waitFor(() => expect(within(row('override')).getByLabelText('Price override')).toHaveValue(id === 'shop-a' ? 100 : 200));
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.refresh = null;
});

describe('attachment catalog consistency', () => {
  it('does not apply a delayed shop A response to shop B or save it under B', async () => {
    const first = deferred();
    mocks.query.mockImplementation(query => query.table === 'generated_attachment_shop_overrides' && query.filters.shop_id === 'shop-a' ? first.promise : undefined);
    await openPanel();
    fireEvent.change(screen.getByLabelText('Shop'), { target: { value: 'shop-a' } });
    await waitFor(() => expect(mocks.query).toHaveBeenCalledWith(expect.objectContaining({ table: 'generated_attachment_shop_overrides', filters: { shop_id: 'shop-a' } })));
    await chooseShop('shop-b');
    await act(async () => { first.resolve({ data: [{ recipe_key: 'loop', enabled: true, price_adjustment: 111, production_days_adjustment: 3 }], error: null }); });
    expect(within(row('override')).getByLabelText('Price override')).toHaveValue(200);
    fireEvent.change(within(row('override')).getByLabelText('Price override'), { target: { value: '225' } });
    fireEvent.click(within(row('override')).getByRole('button', { name: 'Save' }));
    await screen.findByText('Shop override saved.');
    const writes = mocks.query.mock.calls.map(([query]) => query).filter(query => query.operation === 'upsert');
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({ shop_id: 'shop-b', recipe_key: 'loop', price_adjustment: 225 });
  });

  it('releases a rejected save and preserves its draft for retry', async () => {
    await openPanel();
    mocks.query.mockImplementation(query => query.operation === 'upsert' ? Promise.reject(new Error('Catalog save unavailable')) : undefined);
    fireEvent.change(within(row('global')).getByLabelText('Price ₱'), { target: { value: '27' } });
    fireEvent.click(within(row('global')).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Catalog save unavailable');
    expect(within(row('global')).getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(within(row('global')).getByLabelText('Price ₱')).toHaveValue(27);
    mocks.query.mockReset();
    fireEvent.click(within(row('global')).getByRole('button', { name: 'Save' }));
    await screen.findByText('Global settings saved.');
  });

  it.each(['global', 'override'] as const)('does not claim success for a null %s upsert result', async kind => {
    await openPanel();
    if (kind === 'override') await chooseShop();
    mocks.query.mockImplementation(query => query.operation === 'upsert' ? { data: null, error: null } : undefined);
    fireEvent.change(within(row(kind)).getByLabelText(kind === 'global' ? 'Price ₱' : 'Price override'), { target: { value: '73' } });
    fireEvent.click(within(row(kind)).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be confirmed/);
    expect(screen.queryByText(/settings saved|override saved/)).not.toBeInTheDocument();
    expect(within(row(kind)).getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(within(row(kind)).getByLabelText(kind === 'global' ? 'Price ₱' : 'Price override')).toHaveValue(73);
  });

  it('keeps another dirty global recipe after saving one recipe and receiving realtime', async () => {
    await openPanel();
    fireEvent.change(within(row('global')).getByLabelText('Price ₱'), { target: { value: '111' } });
    fireEvent.change(within(row('global', 'Bridge')).getByLabelText('Price ₱'), { target: { value: '222' } });
    fireEvent.click(within(row('global')).getByRole('button', { name: 'Save' }));
    await screen.findByText('Global settings saved.');
    await act(async () => { await mocks.refresh?.(); });
    expect(within(row('global', 'Bridge')).getByLabelText('Price ₱')).toHaveValue(222);
  });

  it('keeps another dirty shop recipe and blocks switching shops until all edited overrides are saved', async () => {
    await openPanel();
    await chooseShop();
    fireEvent.change(within(row('override')).getByLabelText('Price override'), { target: { value: '111' } });
    fireEvent.change(within(row('override', 'Bridge')).getByLabelText('Price override'), { target: { value: '222' } });
    fireEvent.click(within(row('override')).getByRole('button', { name: 'Save' }));
    await screen.findByText('Shop override saved.');
    await act(async () => { await mocks.refresh?.(); });
    expect(within(row('override', 'Bridge')).getByLabelText('Price override')).toHaveValue(222);
    expect(screen.getByLabelText('Shop')).toBeDisabled();
    fireEvent.click(within(row('override', 'Bridge')).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByLabelText('Shop')).toBeEnabled());
  });

  it('does not hide or overwrite edited fields during a loading retry', async () => {
    await openPanel();
    fireEvent.change(within(row('global')).getByLabelText('Price ₱'), { target: { value: '111' } });
    mocks.query.mockImplementation(query => query.operation === 'upsert' ? Promise.reject(new Error('Save failed')) : undefined);
    fireEvent.click(within(row('global')).getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    const reload = deferred();
    mocks.query.mockImplementation(query => query.table === 'generated_attachment_catalog_settings' ? reload.promise : undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading catalog' }));
    expect(within(row('global')).getByLabelText('Price ₱')).toHaveValue(111);
    await act(async () => { reload.resolve({ data: [{ recipe_key: 'loop', default_price: 5 }], error: null }); });
    expect(within(row('global')).getByLabelText('Price ₱')).toHaveValue(111);
  });

  it('preserves edited overrides when an earlier refresh rejects', async () => {
    await openPanel();
    await chooseShop();
    const refresh = deferred();
    mocks.query.mockImplementation(query => query.table === 'generated_attachment_shop_overrides' ? refresh.promise : undefined);
    let pending: Promise<void> | undefined;
    act(() => { pending = mocks.refresh?.(); });
    fireEvent.change(within(row('override')).getByLabelText('Price override'), { target: { value: '125' } });
    await act(async () => { refresh.reject(new Error('Override refresh unavailable')); await pending; });
    expect(screen.getByRole('alert')).toHaveTextContent('Override refresh unavailable');
    expect(within(row('override')).getByLabelText('Price override')).toHaveValue(125);
  });

  it('does not let an in-flight refresh overwrite a recipe saved while it was loading', async () => {
    await openPanel();
    const refresh = deferred();
    mocks.query.mockImplementation(query => query.table === 'generated_attachment_catalog_settings' && query.operation === 'select' ? refresh.promise : undefined);
    let pending: Promise<void> | undefined;
    act(() => { pending = mocks.refresh?.(); });
    fireEvent.change(within(row('global')).getByLabelText('Price ₱'), { target: { value: '111' } });
    fireEvent.change(within(row('global', 'Bridge')).getByLabelText('Price ₱'), { target: { value: '222' } });
    fireEvent.click(within(row('global')).getByRole('button', { name: 'Save' }));
    await screen.findByText('Global settings saved.');
    await act(async () => { refresh.resolve({ data: [{ recipe_key: 'loop', default_price: 5 }, { recipe_key: 'bridge', default_price: 6 }], error: null }); await pending; });
    expect(within(row('global')).getByLabelText('Price ₱')).toHaveValue(111);
    expect(within(row('global', 'Bridge')).getByLabelText('Price ₱')).toHaveValue(222);
  });
});
