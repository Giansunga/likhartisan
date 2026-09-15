import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FreeformPage from '../FreeformPage';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('../../components/freeform/FreeformViewer', () => ({
  default: () => <div data-testid="freeform-viewer" />,
}));

vi.mock('../../components/freeform/ModelTab', () => ({
  default: () => <div>Model choices</div>,
}));

vi.mock('../../components/freeform/ShapeTab', () => ({
  default: () => <div>Shape choices</div>,
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
  default: () => null,
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
});
