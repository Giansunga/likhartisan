import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Featured3DPage from '../Featured3DPage';
import type { LandingFeature } from '../../../lib/landing3dFeature';

const state = vi.hoisted(() => ({
  models: [] as Record<string, unknown>[],
  setting: null as Record<string, unknown> | null,
  saved: null as Record<string, unknown> | null,
  saveError: null as { message: string } | null,
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: { from(table: string) {
    if (table === 'models_3d') return { select: () => ({
      order: async () => ({ data: state.models, error: null }),
      eq: (key: string, id: string) => ({ maybeSingle: async () => ({ data: key === 'id' ? state.models.find((entry) => entry.id === id) || null : null, error: null }) }),
    }) };
    if (table === 'shops') return { select: () => ({ order: async () => ({ data: [{ id: 'shop-1', name: 'Clay Shop' }], error: null }) }) };
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.setting, error: null }) }) }),
      upsert: (value: Record<string, unknown>) => {
        state.saved = value;
        return { select: () => ({ single: async () => ({ data: state.saveError ? null : { model_id: value.model_id }, error: state.saveError }) }) };
      },
    };
  } },
}));
vi.mock('../../../components/freeform/FreeformViewer', () => ({ default: ({ modelFile }: { modelFile: string }) => <div>Viewer: {modelFile}</div> }));
vi.mock('../../../components/freeform/ShapeTab', () => ({ default: ({ shapeParams, onChange }: { shapeParams: { height: number }; onChange: (value: unknown) => void }) => <button onClick={() => onChange({ ...shapeParams, height: shapeParams.height + 1 })}>Height: {shapeParams.height}</button> }));
vi.mock('../../../components/freeform/MaterialTab', () => ({ default: ({ materialParams, onChange }: { materialParams: { finish: string; color: string }; onChange: (value: unknown) => void }) => <button onClick={() => onChange({ ...materialParams, color: '#123456' })}>Finish: {materialParams.finish}</button> }));
vi.mock('../../../components/freeform/DecorTab', () => ({ default: () => <div>Pattern editor</div> }));
vi.mock('../../../components/freeform/AttachmentTab', () => ({ default: () => <div>Attachment editor</div> }));

const model = (id: string, height: number) => ({
  id, name: id, category: 'Vase', status: 'active', file_url: `https://example.com/${id}.glb`, thumbnail: '', shop_id: 'shop-1',
  base_height_in: height, base_body_width_in: 8, base_neck_width_in: 5, base_rim_size_in: 6,
  base_price_php: 500, base_production_days: 7,
});

beforeEach(() => {
  state.models = [model('model-one', 12), model('model-two', 14), { ...model('archived', 10), status: 'archived' }];
  state.setting = null;
  state.saved = null;
  state.saveError = null;
});

describe('Featured 3D Preview admin page', () => {
  it('filters eligible models, resets stage shape on model change, and publishes all stages', async () => {
    render(<MemoryRouter><Featured3DPage /></MemoryRouter>);
    const select = await screen.findByRole('combobox', { name: 'Featured model' });
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('Height: 12')).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'model-two' } });
    expect(screen.getByText('Height: 14')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Finish' }));
    expect(screen.getByRole('button', { name: 'First finish' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Second finish' }));
    expect(screen.getByText('Finish: matte')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Decorate' }));
    expect(screen.getByText('Pattern editor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.getByText('Attachment editor')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save and Publish' }));
    await waitFor(() => expect(state.saved).not.toBeNull());
    expect(state.saved?.model_id).toBe('model-two');
    expect((state.saved?.visual_keyframes as LandingFeature).stages.details.shape.baseline?.height).toBe(14);
    expect(await screen.findByText(/Published. Visitors will see/)).toBeInTheDocument();
  });

  it('keeps failed saves unpublished and reports the error', async () => {
    state.saveError = { message: 'Permission denied' };
    render(<MemoryRouter><Featured3DPage /></MemoryRouter>);
    await screen.findByRole('combobox', { name: 'Featured model' });
    fireEvent.click(screen.getByRole('button', { name: 'Save and Publish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    expect(screen.getByText(/No published setting yet/)).toBeInTheDocument();
  });

  it('does not publish a model that was archived after the editor loaded', async () => {
    render(<MemoryRouter><Featured3DPage /></MemoryRouter>);
    await screen.findByRole('combobox', { name: 'Featured model' });
    state.models[0] = { ...state.models[0], status: 'archived' };
    fireEvent.click(screen.getByRole('button', { name: 'Save and Publish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer eligible');
    expect(state.saved).toBeNull();
  });
});
