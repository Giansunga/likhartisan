import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FreeformPage from '../FreeformPage';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: {
        id: 'model-1', file_url: '/models/vase.glb', base_height_in: 10, base_body_width_in: 8,
        base_neck_width_in: 5, base_rim_size_in: 4, base_price_php: 1250, base_production_days: 5,
      } })) })),
    })),
  })), rpc: vi.fn() },
}));

vi.mock('../../components/freeform/FreeformViewer', () => ({
  default: () => <div data-testid="freeform-viewer" />,
}));

vi.mock('../../components/freeform/ModelTab', () => ({
  default: () => <div>Model choices</div>,
}));

vi.mock('../../components/freeform/ShapeTab', () => ({
  default: ({ shapeParams, baseShape, onChange }: {
    shapeParams: { height: number; bodyWidth: number; neckWidth: number; rimSize: number; curvature: number; unit: 'in' };
    baseShape: typeof shapeParams;
    onChange: (value: typeof shapeParams) => void;
  }) => <div>Shape choices
    <button onClick={() => onChange({ ...shapeParams, height: shapeParams.height + 2 })}>Grow height</button>
    <button onClick={() => onChange(baseShape)}>Reset Shape</button>
  </div>,
}));

vi.mock('../../components/freeform/MaterialTab', () => ({
  default: () => <div>Material choices</div>,
}));

vi.mock('../../components/freeform/DecorTab', () => ({
  default: () => <div>Pattern choices</div>,
}));

vi.mock('../../components/freeform/AttachmentTab', () => ({
  default: () => <div>Attachment choices</div>,
}));

vi.mock('../../components/freeform/ShopSelectModal', () => ({
  default: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Select a Shop" /> : null,
}));

vi.mock('../../components/freeform/SavedDesignsModal', () => ({
  default: () => null,
}));

vi.mock('../../components/freeform/SendDesignRequestModal', () => ({
  default: () => null,
}));

describe('FreeformPage send-to-shop flow', () => {
  function expectNextActionEnabled() {
    const nextButtons = screen.getAllByRole('button', { name: 'Next' });
    expect(nextButtons.length).toBeGreaterThan(0);
    nextButtons.forEach((button) => expect(button).toBeEnabled());
  }

  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('opens the shop selector on a fresh Freeform entry', async () => {
    render(
      <MemoryRouter initialEntries={['/freeform']}>
        <FreeformPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('dialog', { name: 'Select a Shop' })).toBeInTheDocument();
  });

  it('only shows Send to Shop on Review and hides it again when navigating backward', async () => {
    render(
      <MemoryRouter initialEntries={[{
        pathname: '/freeform',
        state: { modelUrl: '/models/vase.glb', modelName: 'Test Vase', modelCategory: 'Vase' },
      }]}
      >
        <FreeformPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getAllByText('Test Vase').length).toBeGreaterThan(0));

    const stepNames = ['Shape', 'Material', 'Pattern', 'Attachment'];
    expect(screen.queryByRole('button', { name: /Send to Shop/i })).not.toBeInTheDocument();
    expectNextActionEnabled();

    for (const stepName of stepNames) {
      const stepButton = screen.getByRole('button', { name: new RegExp(`\\b${stepName}\\b`) });
      fireEvent.click(stepButton);
      await waitFor(() => expect(stepButton).toHaveAttribute('aria-current', 'step'));
      expect(screen.queryByRole('button', { name: /Send to Shop/i })).not.toBeInTheDocument();
      expectNextActionEnabled();
    }

    const reviewButton = screen.getByRole('button', { name: /\bReview\b/ });
    fireEvent.click(reviewButton);
    await waitFor(() => expect(reviewButton).toHaveAttribute('aria-current', 'step'));
    expect(screen.getByRole('button', { name: 'Send to Shop' })).toBeEnabled();

    const attachmentButton = screen.getByRole('button', { name: /\bAttachment\b/ });
    fireEvent.click(attachmentButton);
    await waitFor(() => expect(attachmentButton).toHaveAttribute('aria-current', 'step'));
    expect(screen.queryByRole('button', { name: /Send to Shop/i })).not.toBeInTheDocument();
    expectNextActionEnabled();
  });

  it('starts from the model baseline and both resets restore its estimate', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MemoryRouter initialEntries={[{ pathname: '/freeform', state: {
      modelUrl: '/models/vase.glb', modelName: 'Test Vase', modelCategory: 'Vase', modelId: 'model-1',
    } }]}><FreeformPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getAllByText('₱1,250.00').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/H 10.00 in/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Shape Customize shape/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Grow height' }));
    expect(screen.getAllByText('₱1,410.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/6 Days/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Shape' }));
    expect(screen.getAllByText('₱1,250.00').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Grow height' }));
    fireEvent.click(screen.getByRole('button', { name: /Reset Design/i }));
    expect(screen.getAllByText('₱1,250.00').length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });

  it('keeps one viewer mounted and returns mobile controls to the top on step change', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width: 767px'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    HTMLElement.prototype.scrollTo = vi.fn();
    render(<MemoryRouter initialEntries={[{ pathname: '/freeform', state: {
      modelUrl: '/models/vase.glb', modelName: 'Test Vase', modelCategory: 'Vase', modelId: 'model-1',
    } }]}><FreeformPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getAllByText('Test Vase').length).toBeGreaterThan(0));
    const viewer = screen.getByTestId('freeform-viewer');
    const controls = document.querySelector('.freeform-sidebar-inner') as HTMLElement;
    fireEvent.click(screen.getByRole('button', { name: /Shape Customize shape/i }));

    expect(screen.getByTestId('freeform-viewer')).toBe(viewer);
    expect(controls.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
    expect(document.activeElement).toHaveClass('freeform-tab-section');
  });
});
