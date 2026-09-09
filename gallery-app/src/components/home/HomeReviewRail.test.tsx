import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomeReviewRail, { type HomeReview } from './HomeReviewRail';

const reviews: HomeReview[] = [
  { id: 'one', userName: 'Maria Santos', rating: 5, body: 'Beautiful vase.', productName: 'Malaking Vase', createdAt: '' },
  { id: 'two', userName: 'Juan Dela Cruz', rating: 5, body: 'Amazing shop.', productName: 'Clay Planter', createdAt: '' },
  { id: 'three', userName: 'Ana Reyes', rating: 4, body: 'Lovely craft.', productName: 'Tea Light Holder', createdAt: '' },
];

function renderRail(items = reviews) {
  render(<HomeReviewRail reviews={items} />);
  const viewport = screen.getByLabelText('Customer reviews carousel');
  const track = viewport.querySelector('.home-review-track') as HTMLDivElement;
  return { viewport, track };
}

describe('HomeReviewRail', () => {
  it('renders review cards with star ratings and reviewer details', () => {
    const { viewport, track } = renderRail();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(viewport).not.toHaveAttribute('tabindex');
    expect(track).toHaveAttribute('data-paused', 'false');
    expect(screen.getAllByText('Maria Santos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Malaking Vase').length).toBeGreaterThan(0);
  });

  it('pauses marquee on hover and resumes when mouse leaves', () => {
    const { viewport, track } = renderRail();
    expect(track).toHaveAttribute('data-paused', 'false');
    expect(track.style.animationPlayState).toBe('running');

    fireEvent.mouseEnter(viewport);
    expect(track).toHaveAttribute('data-paused', 'true');
    expect(track.style.animationPlayState).toBe('paused');

    fireEvent.mouseLeave(viewport);
    expect(track).toHaveAttribute('data-paused', 'false');
    expect(track.style.animationPlayState).toBe('running');
  });

  it('pauses on focus and resumes when blur occurs', () => {
    const { viewport, track } = renderRail();
    fireEvent.focus(viewport);
    expect(track).toHaveAttribute('data-paused', 'true');

    fireEvent.blur(viewport, { relatedTarget: document.body });
    expect(track).toHaveAttribute('data-paused', 'false');
  });

  it('renders nothing when review list is empty', () => {
    const { container } = render(<HomeReviewRail reviews={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

