import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../chat/LikhAIConversation', () => ({
  default: () => <div>Conversation</div>,
}));

import LikhAIDock from '../LikhAIDock';

describe('LikhAIDock', () => {
  it('opens the floating conversation without a full-page link and can close again', () => {
    const { container } = render(<MemoryRouter><LikhAIDock /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Open LikhAI customer support' }));

    expect(screen.getByRole('complementary', { name: 'LikhAI customer support' })).toBeInTheDocument();
    expect(container.querySelector('img.likhai-dock__brand-icon')).toHaveAttribute('src', '/images/likhai-logo.png');
    expect(screen.getByText('Customer Support')).toBeInTheDocument();
    expect(screen.queryByText('Grounded support')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open LikhAI full page' })).not.toBeInTheDocument();
    expect(screen.getByText('Conversation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close LikhAI' }));

    expect(screen.queryByRole('complementary', { name: 'LikhAI customer support' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open LikhAI customer support' })).toBeInTheDocument();
  });
});
