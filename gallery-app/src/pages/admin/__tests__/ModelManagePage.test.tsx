import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModelManagePage from '../ModelManagePage';

const state = vi.hoisted(() => ({
  models: [] as Record<string, unknown>[],
  inserted: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
  uploaded: [] as File[],
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from(table: string) {
      return {
        select() {
          return { order: async () => ({ data: table === 'models_3d' ? state.models : [{ id: 'shop-1', name: 'Pottery Shop' }] }) };
        },
        insert: async (value: Record<string, unknown>) => { state.inserted = value; return { error: null }; },
        update(value: Record<string, unknown>) {
          state.updated = value;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  },
}));
vi.mock('../../../realtime/usePortalRealtimeRefresh', () => ({ usePortalRealtimeRefresh: () => {} }));
vi.mock('../../../lib/r2', () => ({ uploadToR2: async (file: File) => {
  state.uploaded.push(file);
  return 'https://example.com/original.glb';
} }));
vi.mock('../AttachmentManagePanel', () => ({ default: () => null }));

beforeEach(() => {
  state.models = [];
  state.inserted = null;
  state.updated = null;
  state.uploaded = [];
});

describe('admin model form', () => {
  it('uploads the original GLB while saving entered dimensions as the baseline', async () => {
    const { container } = render(<ModelManagePage />);
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
    const { container } = render(<ModelManagePage />);
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
    const { container } = render(<ModelManagePage />);
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
});
