import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ProductTagsInput from '../ProductTagsInput';
import { resolveProductTags, type ProductTagsDraft } from '../../../lib/productTags';

function Harness({ submit = () => {} }: { submit?: () => void }) {
  const [value, setValue] = useState<ProductTagsDraft>({ tags: [], input: '' });
  return <form onSubmit={event => { event.preventDefault(); submit(); }}>
    <ProductTagsInput value={value} onChange={setValue} />
    <output>{JSON.stringify(resolveProductTags(value).tags)}</output>
  </form>;
}

describe('product tag entry', () => {
  it('adds normalized comma and Enter tags, deduplicates, and removes chips without submitting', () => {
    const submit = vi.fn();
    render(<Harness submit={submit} />);
    const input = screen.getByRole('textbox', { name: 'Tags (optional)' });
    fireEvent.change(input, { target: { value: ' Clay, HAND   made,clay,' } });
    expect(screen.getByRole('button', { name: 'Remove tag hand made' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    fireEvent.change(input, { target: { value: ' Rustic ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('button', { name: 'Remove tag rustic' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag clay' }));
    expect(screen.queryByRole('button', { name: 'Remove tag clay' })).not.toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it('retains invalid input and shows limits without silently losing tags', () => {
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Tags (optional)' });
    fireEvent.change(input, { target: { value: 'a'.repeat(41) } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('a'.repeat(41));
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('40 characters');
    fireEvent.change(input, { target: { value: Array.from({ length: 11 }, (_, i) => `tag${i}`).join(',') } });
    expect(screen.getByRole('alert')).toHaveTextContent('10 tags');
    fireEvent.change(input, { target: { value: Array.from({ length: 10 }, (_, i) => `tag${i}`).join(',') } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
  });

  it('commits on blur and preserves uncommitted text for saving', () => {
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Tags (optional)' });
    fireEvent.change(input, { target: { value: '  Terra   Cotta  ' } });
    expect(screen.getByRole('status')).toHaveTextContent('["terra cotta"]');
    fireEvent.blur(input);
    expect(screen.getByRole('button', { name: 'Remove tag terra cotta' })).toBeInTheDocument();
    expect(input).toHaveValue('');
  });
});
