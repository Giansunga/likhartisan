import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PopupHost, { Popup } from '../Popup';
import { confirmAction, dismissPopup, toast, usePopupRequests } from '../../lib/popups';
let pending: ReturnType<typeof usePopupRequests> = [];
function Harness() { const requests = usePopupRequests(); useEffect(() => { pending = requests; }, [requests]); return <PopupHost />; }
afterEach(() => { cleanup(); act(() => pending.forEach(item => dismissPopup(item.id))); pending = []; });
describe('system popups', () => {
  it('requires explicit acceptance and restores focus', async () => {
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    render(<Harness />);
    let result!: Promise<boolean>;
    act(() => { result = confirmAction('Delete this design?'); });
    const dialog = screen.getByRole('dialog');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(dialog); expect(dialog).toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: 'Delete design' }));
    await expect(result).resolves.toBe(true);
    expect(trigger).toHaveFocus(); trigger.remove();
  });
  it('cancels without accepting', async () => {
    render(<Harness />); let result!: Promise<boolean>;
    act(() => { result = confirmAction('Reset your recommendation history?'); });
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    await expect(result).resolves.toBe(false);
  });
  it('queues messages and coalesces identical notifications', async () => {
    render(<Harness />);
    act(() => { toast.success('Saved'); toast.success('Saved'); toast.error('Try again'); });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('serializes declarative confirmations and notifications', async () => {
    render(<><Popup title="Archive listing?" onConfirm={vi.fn()} onCancel={vi.fn()} /><Harness /></>);
    act(() => toast.info('Background update'));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Archive listing?');
  });
  it('blocks repeated submission and dismissal while busy', async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const onCancel = vi.fn();
    render(<Popup title="Delete?" onConfirm={onConfirm} onCancel={onCancel} />);
    const submit = screen.getByRole('button', { name: 'Continue' });
    fireEvent.click(submit); fireEvent.click(submit); fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(onConfirm).toHaveBeenCalledOnce(); expect(onCancel).not.toHaveBeenCalled();
    await act(async () => finish());
  });
  it('preserves form fields and prevents submitting invalid input', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(<Popup title="Reject payment" confirmDisabled onConfirm={onConfirm} onCancel={vi.fn()}><textarea aria-label="Reason" defaultValue="Needs review" /></Popup>);
    expect(screen.getByRole('textbox', { name: 'Reason' })).toHaveValue('Needs review');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<Popup title="Reject payment" busy onConfirm={onConfirm} onCancel={vi.fn()}><textarea aria-label="Reason" defaultValue="Needs review" /></Popup>);
    expect(screen.getByRole('textbox', { name: 'Reason' })).toBeDisabled();
  });
  it('cycles focus within the popup', () => {
    render(<Popup title="Reset?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const submit = screen.getByRole('button', { name: 'Continue' });
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true }); expect(submit).toHaveFocus();
    fireEvent.keyDown(submit, { key: 'Tab' }); expect(cancel).toHaveFocus();
  });
});
