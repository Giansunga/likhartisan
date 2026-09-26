import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../../contexts/AuthContext';
import { useSavedDesigns, type SavedDesign } from '../../../hooks/useSavedDesigns';
import SavedDesignsModal from '../SavedDesignsModal';

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../../hooks/useSavedDesigns', () => ({ useSavedDesigns: vi.fn() }));

const firstDesign: SavedDesign = {
  id: 'design-1', name: 'Nays', shop_id: 'shop-1', model_name: 'Single Jarlet', model_file: '/jarlet.glb',
  shape_params: {}, material_params: { finish: 'terracotta', color: '#BE734F' }, thumbnail: '/jarlet.png',
  created_at: '2026-09-23T00:00:00Z', shops: { id: 'shop-1', name: 'Princess Michael Pots' },
};
const secondDesign: SavedDesign = {
  ...firstDesign, id: 'design-2', name: 'Garden planter', shop_id: 'shop-2', model_name: 'Planter',
  shops: { id: 'shop-2', name: 'Sosima Gomez Pottery' },
};

const fetchDesigns = vi.fn(async () => {});
const renameDesign = vi.fn(async () => true);
const deleteDesign = vi.fn(async () => true);

function setDesigns(designs: SavedDesign[], loading = false) {
  vi.mocked(useSavedDesigns).mockReturnValue({ designs, loading, fetchDesigns, renameDesign, deleteDesign });
}

function showModal(currentShopId = 'shop-1') {
  const onClose = vi.fn();
  const onLoad = vi.fn();
  render(<SavedDesignsModal open currentShopId={currentShopId} onClose={onClose} onLoad={onLoad} />);
  return { onClose, onLoad };
}

describe('SavedDesignsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } as ReturnType<typeof useAuth>['user'], session: null, loading: false, getAccessToken: vi.fn() });
  });

  it('shows one design without unnecessary search and shop filters', () => {
    setDesigns([firstDesign]);
    const { onLoad } = showModal('different-shop');

    expect(screen.getByRole('dialog', { name: 'Load Saved Design' })).toBeInTheDocument();
    expect(screen.getByText('1 saved design')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All shops' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load design' }));
    expect(onLoad).toHaveBeenCalledWith(firstDesign);
  });

  it('reenables Load when the parent cancels a design switch', async () => {
    setDesigns([firstDesign]);
    showModal();
    const loadButton = screen.getByRole('button', { name: 'Load design' });
    fireEvent.click(loadButton);
    await waitFor(() => expect(loadButton).toBeEnabled());
    expect(loadButton).toHaveTextContent('Load design');
  });

  it('keeps search, shop filtering, and rename available for multiple designs', async () => {
    setDesigns([firstDesign, secondDesign]);
    showModal();

    fireEvent.click(screen.getByRole('button', { name: 'All shops' }));
    expect(screen.getByText('Nays')).toBeInTheDocument();
    expect(screen.getByText('Garden planter')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search saved designs' }), { target: { value: 'garden' } });
    expect(screen.queryByText('Nays')).not.toBeInTheDocument();
    expect(screen.getByText('Garden planter')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Garden planter' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New name for Garden planter' }), { target: { value: 'New planter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(renameDesign).toHaveBeenCalledWith('design-2', 'New planter'));
  });

  it('explains the empty state and returns to the editor', () => {
    setDesigns([]);
    const { onClose } = showModal();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByText('Your first design starts here')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue designing' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows loading before an empty result', () => {
    setDesigns([], true);
    showModal();
    expect(screen.getByRole('status')).toHaveTextContent('Loading your designs');
    expect(screen.queryByText('Your first design starts here')).not.toBeInTheDocument();
  });

  it('offers sign-in when a guest opens saved designs', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, session: null, loading: false, getAccessToken: vi.fn() });
    setDesigns([]);
    const onOpenAuth = vi.fn();
    window.addEventListener('open-auth', onOpenAuth);
    const { onClose } = showModal();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onClose).toHaveBeenCalled();
    expect(onOpenAuth).toHaveBeenCalled();
    window.removeEventListener('open-auth', onOpenAuth);
  });
});
