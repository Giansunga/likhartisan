import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SellerConfirmDialog, SellerOverlay } from '../Overlay';

describe('SellerOverlay', () => {
  it('labels the dialog and closes on Escape', () => {
    const onClose = vi.fn();
    render(<SellerOverlay open title="Edit listing" description="Update details" onClose={onClose}><button>Focusable</button></SellerOverlay>);
    expect(screen.getByRole('dialog', { name: 'Edit listing' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not dismiss a busy dialog', () => {
    const onClose = vi.fn();
    render(<SellerOverlay open busy title="Saving" onClose={onClose}><span>Please wait</span></SellerOverlay>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('runs a destructive confirmation explicitly', () => {
    const onConfirm = vi.fn();
    render(<SellerConfirmDialog open title="Archive listing?" description="It will be hidden." confirmLabel="Archive listing" onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive listing' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
