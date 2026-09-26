import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MaterialTab from '../MaterialTab';
import { normalizeMaterialParams } from '../materials';

describe('Terracotta color', () => {
  it('normalizes saved custom colors to the fixed clay color', () => {
    expect(normalizeMaterialParams({ finish: 'raw_clay', color: '#FF0000' })).toEqual({ finish: 'raw_clay', color: '#BE734F' });
    expect(normalizeMaterialParams({ finish: 'glazed', color: '#FF0000' })).toEqual({ finish: 'glazed', color: '#FF0000' });
  });

  it('disables all color controls until another finish is selected', () => {
    const onChange = vi.fn();
    const { rerender } = render(<MaterialTab materialParams={{ finish: 'raw_clay', color: '#BE734F' }} onChange={onChange} />);
    expect(screen.queryByText('Terracotta has a fixed natural clay color.')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^#[0-9A-F]{6}$/i }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(document.querySelector('input[type="color"]')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Glossy' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ finish: 'glazed' }));
    rerender(<MaterialTab materialParams={{ finish: 'glazed', color: '#BE734F' }} onChange={onChange} />);
    expect(screen.getByRole('textbox')).toBeEnabled();
  });
});
