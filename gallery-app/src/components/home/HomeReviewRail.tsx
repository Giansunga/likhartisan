import { ArrowLeft, ArrowRight, Star } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface HomeReview {
  id: string;
  userName: string;
  rating: number;
  body: string;
  productName: string;
  createdAt: string;
}

interface HomeReviewRailProps {
  reviews: HomeReview[];
}

export default function HomeReviewRail({ reviews }: HomeReviewRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const updateEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setEdges({ start: rail.scrollLeft <= 2, end: rail.scrollLeft >= max - 2 });
  }, []);

  useEffect(() => {
    updateEdges();
    const rail = railRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [reviews.length, updateEdges]);

  const move = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollBy({ left: direction * Math.max(rail.clientWidth * .78, 290), behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  if (!reviews.length) return null;

  return (
    <section className="home-section home-reviews" aria-labelledby="home-reviews-title">
      <div className="home-container">
        <div className="home-section-heading home-section-heading--split">
          <div><span>Reader notes · Issue 01</span><h2 id="home-reviews-title">Notes from the <em>community</em></h2></div>
          <div className="home-rail-controls" aria-label="Customer review carousel controls">
            <button type="button" aria-label="Show previous reviews" onClick={() => move(-1)} disabled={edges.start}><ArrowLeft aria-hidden="true" /></button>
            <button type="button" aria-label="Show next reviews" onClick={() => move(1)} disabled={edges.end}><ArrowRight aria-hidden="true" /></button>
          </div>
        </div>
        <div className="home-review-rail" ref={railRef} onScroll={updateEdges} tabIndex={0} aria-label="Customer reviews">
          {reviews.map((review, index) => <article className="home-review-card" key={review.id}>
            <div className="home-review-card__topline"><span>Letter {String(index + 1).padStart(2, '0')}</span><div className="home-review-card__stars" aria-label={`${review.rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map(star => <Star key={star} aria-hidden="true" fill={star <= review.rating ? 'currentColor' : 'none'} />)}</div></div>
            <blockquote>“{review.body}”</blockquote>
            <footer><span>{review.userName.charAt(0).toUpperCase()}</span><div><strong>{review.userName}</strong><small>{review.productName}</small></div></footer>
          </article>)}
        </div>
      </div>
    </section>
  );
}
