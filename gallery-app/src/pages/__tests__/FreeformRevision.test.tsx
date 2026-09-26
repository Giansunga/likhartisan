import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FreeformPage from '../FreeformPage';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async () => ({ data: { conversation_id: 'conversation-1' }, error: null })),
  user: { id: 'buyer-1' },
}));

const originalAttachment = vi.hoisted(() => ({
  version: 4, id: 'bamboo-left', recipeKey: 'bamboo-loop', recipeVersion: 1,
  name: 'Bamboo Loop', family: 'handle', style: 'filipino', priceAdjustment: 100,
  productionDaysAdjustment: 1,
  placements: [{
    socket: { id: 'auto-handle-left', name: 'Left', family: 'handle', height: 0.5, azimuth: -90, pairGroup: null },
    transform: { horizontalDegrees: 0, verticalRatio: 0, surfaceOffsetRatio: 0.006, twistDegrees: 0, scaleMultiplier: 1, thicknessMultiplier: 1 },
  }],
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock('../../lib/supabase', () => {
  const model = {
    id: 'model-1', file_url: '/models/vase.glb', base_height_in: 10, base_body_width_in: 8,
    base_neck_width_in: 5, base_rim_size_in: 4, base_price_php: 1250, base_production_days: 5,
  };
  const request = {
    id: 'request-1', buyer_id: 'buyer-1', shop_id: 'shop-1', quantity: 1,
    buyer_note: 'Please revise the handle', status: 'changes_requested',
    shops: { id: 'shop-1', name: 'Test Shop' },
    design_snapshot: {
      version: 1,
      model: { id: 'model-1', name: 'Test Vase', file: '/models/vase.glb', thumbnail: '', category: 'Vase' },
      shape: { height: 10, bodyWidth: 8, neckWidth: 5, rimSize: 4, curvature: 50, unit: 'in' },
      material: { finish: 'raw_clay', color: '#FFFFFF' },
      decoration: { patternId: '', placement: 'middle', scale: 1, color: '#7A3E12', effect: 'painted' },
      attachments: [originalAttachment],
      dimensions: { heightIn: 10, widthIn: 8, unit: 'in' },
      estimate: { price: 1350, productionDays: 6 },
    },
  };
  const from = (table: string) => {
    const data = table === 'models_3d' ? model : table === 'design_requests' ? request : [{ id: 'shop-1', name: 'Test Shop' }];
    const query = {
      select: () => query, eq: () => query, order: () => query,
      maybeSingle: async () => ({ data, error: null }),
      limit: async () => ({ data: [data].flat(), error: null }),
      then: (resolve: (value: { data: unknown; error: null }) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
    };
    return query;
  };
  return { supabase: { from, rpc: mocks.rpc } };
});
vi.mock('../../components/freeform/FreeformViewer', () => ({ default: () => <div data-testid="freeform-viewer" /> }));
vi.mock('../../components/freeform/ModelTab', () => ({ default: () => <div>Model choices</div> }));
vi.mock('../../components/freeform/ShapeTab', () => ({ default: () => <div>Shape choices</div> }));
vi.mock('../../components/freeform/MaterialTab', () => ({ default: () => <div>Material choices</div> }));
vi.mock('../../components/freeform/DecorTab', () => ({ default: () => <div>Pattern choices</div> }));
vi.mock('../../components/freeform/AttachmentTab', () => ({
  default: ({ onChange }: { onChange: (value: []) => void }) => <button onClick={() => onChange([])}>Remove attachment</button>,
}));
vi.mock('../../components/freeform/ShopSelectModal', () => ({ default: () => null }));
vi.mock('../../components/freeform/SavedDesignsModal', () => ({ default: () => null }));
vi.mock('../../components/freeform/SendDesignRequestModal', () => ({
  default: ({ open, revisionMode, snapshot, onSubmit }: {
    open: boolean; revisionMode: boolean; snapshot: { attachments: unknown[] }; onSubmit: (quantity: number, note: string) => void;
  }) => open ? <div role="dialog" aria-label="Send revision">
    <span>{revisionMode ? 'Revision' : 'New request'} · {snapshot.attachments.length} attachments</span>
    <button onClick={() => onSubmit(100, 'Revised attachment')}>Submit revision</button>
  </div> : null,
}));

describe('buyer revision', () => {
  beforeEach(() => {
    mocks.rpc.mockClear();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('lets the buyer change attachments, advance, and send the same request back to its shop', async () => {
    render(<MemoryRouter initialEntries={['/freeform?revise=1&requestId=request-1']}><FreeformPage /></MemoryRouter>);
    const attachmentStep = await screen.findByRole('button', { name: /Attachment.*Add 3D details/i });
    await waitFor(() => expect(screen.getByRole('button', { name: /Review Review & share/i })).toHaveAttribute('aria-current', 'step'));
    fireEvent.click(attachmentStep);
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }));
    await waitFor(() => screen.getAllByRole('button', { name: 'Next' }).forEach((button) => expect(button).toBeEnabled()));
    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Send to Shop' }));
    expect(await screen.findByRole('dialog', { name: 'Send revision' })).toHaveTextContent('Revision · 0 attachments');
    fireEvent.click(screen.getByRole('button', { name: 'Submit revision' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('revise_design_request', expect.objectContaining({
      p_request_id: 'request-1',
      p_quantity: 100,
      p_design_snapshot: expect.objectContaining({ attachments: [], material: { finish: 'raw_clay', color: '#BE734F' } }),
    })));
  });
});
