import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SellerDesignDetails from '../SellerDesignDetails';
import type { DesignRequestSnapshotV1 } from '../../../types/designRequest';
import { DEFAULT_ATTACHMENT_TRANSFORM } from '../../freeform/attachments';

const viewerSpies = vi.hoisted(() => ({ reset: vi.fn(), update: vi.fn() }));

vi.mock('../../freeform/FreeformViewer', () => ({
  default: function MockFreeformViewer({ modelFile, onControlsReady }: { modelFile: string; onControlsReady?: (controls: unknown) => void }) {
    useEffect(() => {
      onControlsReady?.({ reset: viewerSpies.reset, update: viewerSpies.update });
    }, [onControlsReady]);
    return <div data-testid="seller-request-viewer">{modelFile === '/broken.glb' ? 'Failed to load model' : 'Interactive model loaded'}</div>;
  },
}));

const snapshot: DesignRequestSnapshotV1 = {
  version: 1,
  model: { id: 'model-1', name: 'Bamboo Vase', file: '/vase.glb', thumbnail: '/vase.png', category: 'Vases' },
  shape: { height: 30, bodyWidth: 22, neckWidth: 14, rimSize: 12, curvature: 55 },
  material: { finish: 'glazed', color: '#C65A2E' },
  decoration: { patternId: 'bamboo', placement: 'upper', scale: 1.2, color: '#315A9F', effect: 'engraved' },
  attachments: [{
    version: 4,
    id: 'bamboo-loop-pair',
    recipeKey: 'bamboo-loop',
    recipeVersion: 1,
    name: 'Bamboo Loop',
    family: 'handle',
    shopId: 'shop-1',
    placements: [
      {
        socket: { id: 'left', name: 'Left handle', family: 'handle', height: .55, azimuth: -90, pairGroup: 'handles' },
        transform: { ...DEFAULT_ATTACHMENT_TRANSFORM, horizontalDegrees: -5, verticalRatio: .1, scaleMultiplier: 1.1, thicknessMultiplier: 1.2 },
      },
      {
        socket: { id: 'right', name: 'Right handle', family: 'handle', height: .55, azimuth: 90, pairGroup: 'handles' },
        transform: { ...DEFAULT_ATTACHMENT_TRANSFORM, horizontalDegrees: 5, verticalRatio: .1, twistDegrees: 10, scaleMultiplier: 1.1, thicknessMultiplier: 1.2 },
      },
    ],
    priceAdjustment: 75,
    productionDaysAdjustment: 2,
  }],
  dimensions: { heightCm: 30, widthCm: 22 },
  estimate: { price: 1450, productionDays: 7 },
};

const props = {
  snapshot,
  requestId: '6159720a-1111-2222-3333-444444444444',
  buyerName: 'Gian Rafael Sunga',
  revision: 2,
  quantity: 3,
  buyerNote: 'Keep the handles symmetrical and use the darker glaze.',
  createdAt: '2026-08-14T06:52:36.000Z',
  updatedAt: '2026-08-14T07:52:36.000Z',
};

beforeEach(() => {
  viewerSpies.reset.mockClear();
  viewerSpies.update.mockClear();
});

describe('SellerDesignDetails', () => {
  it('renders the complete current production snapshot', async () => {
    render(<SellerDesignDetails {...props}><div>Response workflow</div></SellerDesignDetails>);

    expect(await screen.findByTestId('seller-request-viewer')).toBeInTheDocument();
    expect(screen.getByText('Revision 2')).toBeInTheDocument();
    expect(screen.getByText('#6159720A')).toBeInTheDocument();
    expect(screen.getByText('Gian Rafael Sunga')).toBeInTheDocument();
    expect(screen.getAllByText('Bamboo Vase').length).toBeGreaterThan(0);
    expect(screen.getByText('model-1')).toBeInTheDocument();
    expect(screen.getByText('30 cm')).toBeInTheDocument();
    expect(screen.getByText('22 cm')).toBeInTheDocument();
    expect(screen.getByText('14 cm')).toBeInTheDocument();
    expect(screen.getByText('12 cm')).toBeInTheDocument();
    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(screen.getByText('Glossy')).toBeInTheDocument();
    expect(screen.getByText('#C65A2E')).toBeInTheDocument();
    expect(screen.getAllByText('Bamboo')).toHaveLength(2);
    expect(screen.getByText('engraved')).toBeInTheDocument();
    expect(screen.getAllByText('120%').length).toBeGreaterThan(0);
    expect(screen.getByText('Bamboo Loop')).toBeInTheDocument();
    expect(screen.getByText('Left handle')).toBeInTheDocument();
    expect(screen.getByText('Right handle')).toBeInTheDocument();
    expect(screen.getByText('₱150.00 · +2 days')).toBeInTheDocument();
    expect(screen.getByText('₱1,450.00')).toBeInTheDocument();
    expect(screen.getByText(props.buyerNote)).toBeInTheDocument();
    expect(screen.getByText('Response workflow')).toBeInTheDocument();
  });

  it('resets the framed interactive viewer', async () => {
    render(<SellerDesignDetails {...props} />);
    const resetButton = await screen.findByRole('button', { name: 'Reset 3D view' });
    await waitFor(() => expect(resetButton).toBeEnabled());

    fireEvent.click(resetButton);

    expect(viewerSpies.reset).toHaveBeenCalledOnce();
    expect(viewerSpies.update).toHaveBeenCalledOnce();
  });

  it('handles no pattern, no attachments, and a missing model id', () => {
    render(<SellerDesignDetails {...props} snapshot={{
      ...snapshot,
      model: { ...snapshot.model, id: null },
      decoration: { ...snapshot.decoration, patternId: '' },
      attachments: [],
    }} />);

    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.getByText('No pattern selected.')).toBeInTheDocument();
    expect(screen.getByText('No attachments were added to this design.')).toBeInTheDocument();
  });

  it('keeps specifications visible when the model cannot load', async () => {
    render(<SellerDesignDetails {...props} snapshot={{ ...snapshot, model: { ...snapshot.model, file: '/broken.glb' } }} />);

    expect(await screen.findByText('Failed to load model')).toBeInTheDocument();
    expect(screen.getByText('Dimensions and shape')).toBeInTheDocument();
    expect(screen.getByText(props.buyerNote)).toBeInTheDocument();
  });
});
