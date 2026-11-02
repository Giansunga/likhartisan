import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PortalRouteBoundary from '../PortalRouteBoundary';
const capture = vi.hoisted(() => vi.fn());
vi.mock('../../lib/sentry', () => ({ captureException: capture }));
describe('portal route recovery', () => {
  it('preserves navigation after a crash and resets on route changes', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Broken(): never { throw new Error('Render failed'); }
    render(<MemoryRouter initialEntries={['/broken']}><Link to="/healthy">Healthy page</Link><PortalRouteBoundary><Routes><Route path="/broken" element={<Broken />} /><Route path="/healthy" element={<p>Healthy content</p>} /></Routes></PortalRouteBoundary></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be displayed');
    expect(capture).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: 'Healthy page' }));
    expect(screen.getByText('Healthy content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    log.mockRestore();
  });
});
