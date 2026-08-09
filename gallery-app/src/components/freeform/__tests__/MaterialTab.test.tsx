import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MaterialTab from '../MaterialTab';

describe('MaterialTab', () => {
  it('changes the finish without overwriting the selected color', () => {
    const onChange = vi.fn();
    render(<MaterialTab materialParams={{ finish: 'raw_clay', color: '#228B22' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Glossy' }));
    expect(onChange).toHaveBeenLastCalledWith({ finish: 'glazed', color: '#228B22' });
  });

  it('applies the terracotta pigment when Terracotta is selected', () => {
    const onChange = vi.fn();
    render(<MaterialTab materialParams={{ finish: 'matte', color: '#228B22' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Terracotta' }));
    expect(onChange).toHaveBeenLastCalledWith({ finish: 'raw_clay', color: '#BE734F' });
  });
});
