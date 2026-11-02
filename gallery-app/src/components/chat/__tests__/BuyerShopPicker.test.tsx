import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BuyerNewConversationDialog, type BuyerShop } from '../BuyerChatUI';

function shop(id: string, name: string): BuyerShop {
  return { id, name, email: '', description: '', about: '', banner: '', image: '' };
}

describe('buyer shop picker', () => {
  it('hides blank and unknown shop entries while retaining named shops and their selection', () => {
    const onSelect = vi.fn();
    const named = shop('named', 'Clay House');
    render(<BuyerNewConversationDialog open shops={[
      shop('blank', ''), shop('spaces', '  '), shop('missing', null as unknown as string),
      shop('unknown', ' Unknown Shop '), named,
    ]} search="" getActivity={() => ({ active: false, text: 'Offline' })}
      onSearchChange={vi.fn()} onSelect={onSelect} onClose={vi.fn()} />);
    expect(screen.queryByText(/unknown shop/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2); // Named shop and close.
    fireEvent.click(screen.getByRole('button', { name: /Clay House/ }));
    expect(onSelect).toHaveBeenCalledWith(named);
  });

  it('shows the empty state when only unnamed shops remain', () => {
    render(<BuyerNewConversationDialog open shops={[shop('blank', '')]} search=""
      getActivity={() => ({ active: false, text: 'Offline' })}
      onSearchChange={vi.fn()} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('No shops match your search.')).toBeInTheDocument();
  });
});
