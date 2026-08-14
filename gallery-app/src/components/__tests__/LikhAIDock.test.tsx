import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../chat/LikhAIConversation', () => ({
  default: () => <div>Conversation</div>,
}));

import LikhAIDock from '../LikhAIDock';

describe('LikhAIDock', () => {
  it('opens with a branded icon and no support subtitle', () => {
    const { container } = render(<MemoryRouter><LikhAIDock /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Open LikhAI customer support' }));

    expect(screen.getByRole('complementary', { name: 'LikhAI customer support' })).toBeInTheDocument();
    expect(container.querySelector('img.likhai-dock__brand-icon')).toHaveAttribute('src', '/images/likhai-logo.png');
    expect(screen.getByText('Customer Support')).toBeInTheDocument();
    expect(screen.queryByText('Grounded support')).not.toBeInTheDocument();
  });
});
