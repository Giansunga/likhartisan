import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import AttachmentTab from '../AttachmentTab';
import type { AttachmentSelection, GeneratedAttachmentSocket } from '../attachments';

vi.mock('../../../lib/supabase', () => {
  type QueryMock = PromiseLike<{ data: unknown[]; error: null }> & { select: () => QueryMock; eq: () => QueryMock; order: () => QueryMock };
  const makeQuery = (data: unknown[]) => {
    const result = { data, error: null };
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    } as QueryMock;
    return query;
  };
  return { supabase: { from: (table: string) => makeQuery(table === 'generated_attachment_catalog_settings' ? [{ recipe_key: 'bamboo-loop', active: true, default_price: 100, default_production_days: 1 }] : []) } };
});

const sockets: GeneratedAttachmentSocket[] = [
  { id: 'left', name: 'Left', family: 'handle', height: 0.5, azimuth: -90, pairGroup: 'pair', maxWidthRatio: 0.3, maxHeightRatio: 0.3 },
  { id: 'right', name: 'Right', family: 'handle', height: 0.5, azimuth: 90, pairGroup: 'pair', maxWidthRatio: 0.3, maxHeightRatio: 0.3 },
];

describe('AttachmentTab guided workflow', () => {
  it('advances through selection and placement, then exposes independent controls', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<AttachmentTab shopId={null} modelId="model-1" sockets={sockets} modelHeightCm={25} value={[]} onChange={onChange} />);
    const attachmentCard = await screen.findByRole('button', { name: /Bamboo Loop/ });
    expect(screen.getByRole('button', { name: /Choose Attachment/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Choose Position/ })).toBeDisabled();

    fireEvent.click(attachmentCard);
    expect(screen.getByRole('button', { name: /Choose Position.*Select a socket/ })).toHaveAttribute('aria-expanded', 'true');
    const pairButton = screen.getByRole('button', { name: 'Pair' });
    expect(pairButton).toHaveAttribute('aria-pressed', 'false');
    expect(pairButton).not.toHaveClass('selected');
    fireEvent.click(pairButton);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const selection = onChange.mock.calls.at(-1)![0][0];
    expect(selection).toMatchObject({ version: 4, recipeKey: 'bamboo-loop', family: 'handle' });
    expect(selection.placements).toHaveLength(2);

    function Harness() {
      const [value, setValue] = useState<AttachmentSelection[]>([selection]);
      return <AttachmentTab shopId={null} modelId="model-1" sockets={sockets} modelHeightCm={25} value={value} onChange={(next) => { onChange(next); setValue(next); }} />;
    }
    rerender(<Harness />);
    await waitFor(() => expect(screen.queryByText(/Analyzing compatible attachments/)).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Choose Position/ }));
    expect(screen.getByRole('button', { name: 'Pair' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pair' })).toHaveClass('selected');
    fireEvent.click(screen.getByRole('button', { name: /Adjust Placement/ }));
    expect(screen.getByRole('button', { name: /Adjust Placement.*1 selected attachment/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tab', { name: 'Left' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Right' })).toBeInTheDocument();
    expect(screen.getByLabelText('Horizontal Position')).toBeInTheDocument();
    expect(screen.getByLabelText('Vertical Position')).toBeInTheDocument();
    expect(screen.getByLabelText('Depth / Surface Offset')).toBeInTheDocument();
    expect(screen.getByLabelText('Rotation')).toBeInTheDocument();
    expect(screen.getByLabelText('Scale')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Rotation'), { target: { value: '45' } });
    await waitFor(() => expect(screen.getByText('45°')).toBeInTheDocument());
    expect(onChange.mock.calls.some(([next]) => next[0].placements.some((placement: AttachmentSelection['placements'][number]) => placement.transform.twistDegrees === 45))).toBe(true);

    const adjustmentCard = screen.getByRole('button', { name: /Bamboo Loop.*Left.*Right/ });
    fireEvent.click(adjustmentCard);
    expect(adjustmentCard).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Rotation')).not.toBeVisible();
    fireEvent.click(adjustmentCard);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('button', { name: /Choose Position/ })).toHaveAttribute('aria-expanded', 'true');
  });
});
