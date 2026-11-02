import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ModelManagePage from '../ModelManagePage';

const state = vi.hoisted(() => ({
  models: [] as Record<string, unknown>[],
  inserted: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
  uploaded: [] as File[],
  featuredModelId: null as string | null,
  loadModels: vi.fn(),
  loadShops: vi.fn(),
  write: vi.fn(),
  remove: vi.fn(),
  confirm: vi.fn(),
  refreshModels: null as (() => Promise<void>) | null,
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from(table: string) {
      if (table === 'landing_3d_feature') return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.featuredModelId ? { model_id: state.featuredModelId } : null, error: null }) }) }),
      };
      return {
        select() {
          return { order: () => table === 'models_3d' ? state.loadModels() : state.loadShops() };
        },
        insert: (value: Record<string, unknown>) => {
          state.inserted = value;
          return { select: () => ({ single: () => state.write('new-model', value) }) };
        },
        update(value: Record<string, unknown>) {
          state.updated = value;
          return { eq: (_key: string, id: string) => ({ select: () => ({ maybeSingle: () => state.write(id, value) }) }) };
        },
        delete: () => ({ eq: (_key: string, id: string) => ({ select: () => ({ maybeSingle: () => state.remove(id) }) }) }),
      };
    },
  },
}));
vi.mock('../../../realtime/usePortalRealtimeRefresh', () => ({ usePortalRealtimeRefresh: (tables: string[], refresh: () => Promise<void>) => {
  if (tables.includes('models_3d')) state.refreshModels = refresh;
} }));
vi.mock('../../../lib/popups', () => ({ confirmAction: state.confirm }));
vi.mock('../../../lib/r2', () => ({ uploadToR2: async (file: File) => {
  state.uploaded.push(file);
  return 'https://example.com/original.glb';
} }));
vi.mock('../AttachmentManagePanel', () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  state.models = [];
  state.inserted = null;
  state.updated = null;
  state.uploaded = [];
  state.featuredModelId = null;
  state.refreshModels = null;
  state.loadModels.mockImplementation(async () => ({ data: state.models, error: null }));
  state.loadShops.mockResolvedValue({ data: [{ id: 'shop-1', name: 'Pottery Shop' }], error: null });
  state.write.mockImplementation(async (id: string, value: Record<string, unknown>) => ({ data: { ...model(), ...value, id: id === 'new-model' ? 'created-model' : id }, error: null }));
  state.remove.mockImplementation(async (id: string) => ({ data: { id }, error: null }));
  state.confirm.mockResolvedValue(true);
});

function model() {
  return { id: 'model-1', name: 'Wave Pot', category: 'Vase', shop_id: 'shop-1',
    status: 'active', file_url: 'https://example.com/original.glb', thumbnail: '', created_at: '',
    base_height_in: 13, base_body_width_in: 14, base_neck_width_in: 8, base_rim_size_in: 10,
    base_price_php: 180, base_production_days: 30 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { resolve, promise };
}

describe('admin model form', () => {
  it('uploads the original GLB while saving entered dimensions as the baseline', async () => {
    const { container } = render(<MemoryRouter><ModelManagePage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Upload Model' }));
    const form = container.querySelector('form')!;
    fireEvent.change(within(form).getByPlaceholderText('e.g. Classic Vase'), { target: { value: 'Wave Pot' } });
    for (const [label, value] of [['Height', '13'], ['Body width', '14'], ['Neck width', '8'], ['Rim size', '10'],
      ['Base price (₱) *', '180'], ['Base production (days) *', '30']]) {
      fireEvent.change(within(form).getByLabelText(label), { target: { value } });
    }
    await screen.findByRole('option', { name: 'Pottery Shop' });
    fireEvent.change(form.querySelector('select[required]')!, { target: { value: 'shop-1' } });
    const file = new File(['glb'], 'pot.glb', { type: 'model/gltf-binary' });
    fireEvent.change(form.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.click(within(form).getByRole('button', { name: 'Upload Model' }));
    await waitFor(() => expect(state.inserted).not.toBeNull());
    expect(state.uploaded).toEqual([file]);
    expect(state.inserted).toMatchObject({
      name: 'Wave Pot', file_url: 'https://example.com/original.glb',
      base_height_in: 13, base_body_width_in: 14, base_neck_width_in: 8, base_rim_size_in: 10,
      base_price_php: 180, base_production_days: 30,
    });
  });

  it('preserves the current GLB when editing other model details', async () => {
    state.models = [{ id: 'model-1', name: 'Wave Pot', category: 'Vase', shop_id: 'shop-1',
      status: 'active', file_url: 'https://example.com/original.glb', thumbnail: '', created_at: '',
      base_height_in: 13, base_body_width_in: 14, base_neck_width_in: 8, base_rim_size_in: 10,
      base_price_php: 180, base_production_days: 30 }];
    const { container } = render(<MemoryRouter><ModelManagePage /></MemoryRouter>);
    await screen.findByText('Wave Pot');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const form = container.querySelector('form')!;
    fireEvent.change(within(form).getByPlaceholderText('e.g. Classic Vase'), { target: { value: 'Wave Pot Updated' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(state.updated).not.toBeNull());
    expect(state.uploaded).toHaveLength(0);
    expect(state.updated?.file_url).toBeUndefined();
    expect(state.updated?.base_neck_width_in).toBe(8);
  });

  it('updates base measurements without fetching or replacing the existing GLB', async () => {
    state.models = [{ id: 'model-1', name: 'Wave Pot', category: 'Vase', shop_id: 'shop-1',
      status: 'active', file_url: 'https://example.com/original.glb', thumbnail: '', created_at: '',
      base_height_in: 13, base_body_width_in: 14, base_neck_width_in: 8, base_rim_size_in: 10,
      base_price_php: 180, base_production_days: 30 }];
    const { container } = render(<MemoryRouter><ModelManagePage /></MemoryRouter>);
    await screen.findByText('Wave Pot');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const form = container.querySelector('form')!;
    fireEvent.change(within(form).getByLabelText('Height'), { target: { value: '15' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(state.updated).not.toBeNull());
    expect(state.updated?.base_height_in).toBe(15);
    expect(state.updated?.file_url).toBeUndefined();
    expect(state.uploaded).toHaveLength(0);
  });

  it('blocks archiving or deleting the published featured model', async () => {
    state.models = [{ id: 'model-1', name: 'Wave Pot', category: 'Vase', shop_id: 'shop-1',
      status: 'active', file_url: 'https://example.com/original.glb', thumbnail: '', created_at: '',
      base_height_in: 13, base_body_width_in: 14, base_neck_width_in: 8, base_rim_size_in: 10,
      base_price_php: 180, base_production_days: 30 }];
    state.featuredModelId = 'model-1';
    render(<MemoryRouter><ModelManagePage /></MemoryRouter>);
    await screen.findByText('Wave Pot');
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Publish a different featured model');
    expect(state.updated).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(state.updated).toBeNull();
  });

  it.each(['returned error', 'rejected promise'])('recovers model loading after a %s', async failure => {
    if (failure === 'returned error') state.loadModels.mockResolvedValueOnce({ data: null, error: { message: 'Models unavailable' } });
    else state.loadModels.mockRejectedValueOnce(new Error('Models unavailable'));
    state.models = [model()];
    render(<MemoryRouter><ModelManagePage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Models unavailable');
    expect(screen.queryByText('No models uploaded')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry models' }));
    expect(await screen.findByText('Wave Pot')).toBeInTheDocument();
  });

  it('shows shop loading failure with retry rather than silently leaving the selector empty', async () => {
    state.loadShops.mockRejectedValueOnce(new Error('Shops unavailable'));
    render(<MemoryRouter><ModelManagePage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Shops unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry shops' }));
    await waitFor(() => expect(screen.queryByText('Shops unavailable')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Upload Model' }));
    expect(screen.getByRole('option', { name: 'Pottery Shop' })).toBeInTheDocument();
  });

  it('keeps the editor and draft open when an update matches zero rows', async () => {
    state.models = [model()];
    state.write.mockResolvedValue({ data: null, error: null });
    const { container } = render(<MemoryRouter><ModelManagePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Classic Vase'), { target: { value: 'Unsaved name' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Model could not be saved');
    expect(screen.getByPlaceholderText('e.g. Classic Vase')).toHaveValue('Unsaved name');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
    expect(screen.getByText('Wave Pot')).toBeInTheDocument();
  });

  it.each(['Archive', 'Delete'])('keeps the model and reports failure when %s affects zero rows', async action => {
    state.models = [model()];
    state.write.mockResolvedValue({ data: null, error: null });
    state.remove.mockResolvedValue({ data: null, error: null });
    render(<MemoryRouter><ModelManagePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: action }));
    expect(await screen.findByRole('alert')).toHaveTextContent(action === 'Archive' ? 'Model could not be updated' : 'Model could not be deleted');
    expect(screen.getByText('Wave Pot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: action })).toBeEnabled();
  });

  it.each(['Archive', 'Delete'])('catches a rejected %s and releases its buttons', async action => {
    state.models = [model()];
    state.write.mockRejectedValue(new Error('Permission unavailable'));
    state.remove.mockRejectedValue(new Error('Permission unavailable'));
    render(<MemoryRouter><ModelManagePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: action }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission unavailable');
    expect(screen.getByRole('button', { name: action })).toBeEnabled();
  });

  it('blocks duplicate form submits and closing while the model is saving', async () => {
    state.models = [model()];
    const save = deferred<{ data: Record<string, unknown>; error: null }>();
    state.write.mockReturnValue(save.promise);
    const { container } = render(<MemoryRouter><ModelManagePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(state.write).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close model editor' })).toBeDisabled();
    await act(async () => { save.resolve({ data: { ...model(), name: 'Confirmed model' }, error: null }); });
    expect(screen.getByText('Confirmed model')).toBeInTheDocument();
    expect(container.querySelector('form')).toBeNull();
  });

  it('ignores an older model load after a confirmed edit', async () => {
    state.models = [model()];
    const { container } = render(<MemoryRouter><ModelManagePage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const load = deferred<{ data: Record<string, unknown>[]; error: null }>();
    state.loadModels.mockReturnValueOnce(load.promise);
    let refreshing: Promise<void> | undefined;
    act(() => { refreshing = state.refreshModels?.(); });
    fireEvent.change(screen.getByPlaceholderText('e.g. Classic Vase'), { target: { value: 'Saved new name' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(container.querySelector('form')).toBeNull());
    await act(async () => { load.resolve({ data: [model()], error: null }); await refreshing; });
    expect(screen.getByText('Saved new name')).toBeInTheDocument();
    expect(screen.queryByText('Wave Pot')).not.toBeInTheDocument();
  });
});
