import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SendDesignRequestModal from '../SendDesignRequestModal';
import type { DesignRequestSnapshotV1 } from '../../../types/designRequest';

vi.mock('../FreeformViewer', () => ({ default: () => <div data-testid="request-viewer">3D preview</div> }));

const snapshot: DesignRequestSnapshotV1 = {
  version: 1,
  model: { id: 'model-1', name: 'Regala Vase', file: '/vase.glb', thumbnail: '', category: 'Vase' },
  shape: { height: 30, bodyWidth: 22, neckWidth: 14, rimSize: 12, curvature: 55 },
  material: { finish: 'raw_clay', color: '#BE734F' },
  decoration: { patternId: 'floral', placement: 'full', scale: 1, color: '#315A9F', effect: 'painted' },
  attachments: [], dimensions: { heightCm: 30, widthCm: 22 }, estimate: { price: 1250, productionDays: 5 },
};

describe('SendDesignRequestModal', () => {
  it('reviews the exact design and submits quantity and note', () => {
    const submit = vi.fn();
    render(<SendDesignRequestModal open shops={[{ id: 'shop-1', name: 'Regala Pottery' }]} selectedShopId="shop-1" snapshot={snapshot} submitting={false} successConversationId={null} onSelectShop={() => {}} onSubmit={submit} onClose={() => {}} onOpenMessages={() => {}} />);
    expect(screen.getByTestId('request-viewer')).toBeInTheDocument();
    expect(screen.getByText('Regala Vase')).toBeInTheDocument();
    expect(screen.getByText('Blue botanical')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Please make three matching pieces.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Request' }));
    expect(submit).toHaveBeenCalledWith(3, 'Please make three matching pieces.');
  });

  it('shows a completion state without resubmitting', () => {
    render(<SendDesignRequestModal open shops={[{ id: 'shop-1', name: 'Regala Pottery' }]} selectedShopId="shop-1" snapshot={snapshot} submitting={false} successConversationId="conversation-1" onSelectShop={() => {}} onSubmit={() => {}} onClose={() => {}} onOpenMessages={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Design sent successfully' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send Request' })).not.toBeInTheDocument();
  });

  it('hydrates revision fields and keeps the original shop locked', () => {
    const submit = vi.fn();
    const selectShop = vi.fn();
    render(<SendDesignRequestModal open revisionMode initialQuantity={4} initialNote="Make the rim wider." shops={[{ id: 'shop-1', name: 'Regala Pottery' }, { id: 'shop-2', name: 'Other Shop' }]} selectedShopId="shop-1" snapshot={snapshot} submitting={false} successConversationId={null} onSelectShop={selectShop} onSubmit={submit} onClose={() => {}} onOpenMessages={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Send revised design' })).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toHaveValue(4);
    expect(screen.getByLabelText(/Note/)).toHaveValue('Make the rim wider.');
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(screen.queryByText('Other Shop')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send Revision' }));
    expect(submit).toHaveBeenCalledWith(4, 'Make the rim wider.');
    expect(selectShop).not.toHaveBeenCalled();
  });
});
