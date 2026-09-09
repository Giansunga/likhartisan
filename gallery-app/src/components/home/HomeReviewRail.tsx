import { Star } from 'lucide-react';
import { useState } from 'react';

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
  const [isPaused, setIsPaused] = useState(false);

  if (!reviews.length) return null;

  // Duplicate items to ensure a seamless, gapless infinite scrolling track
  const baseItems = reviews.length < 6
    ? Array.from({ length: Math.ceil(6 / reviews.length) }, () => reviews).flat()
    : reviews;
  const displayItems = [...baseItems, ...baseItems];

  const resumeWhenFocusLeaves = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsPaused(false);
    }
  };

  return (
    <section className="home-section home-reviews" aria-labelledby="home-reviews-title">
      <div className="home-container">
        <div className="home-section-heading home-section-heading--split">
          <div>
            <h2 id="home-reviews-title">Reviews from the <em>community</em></h2>
          </div>
        </div>
        <div
          className="home-review-viewport"
          aria-label="Customer reviews carousel"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onFocusCapture={() => setIsPaused(true)}
          onBlurCapture={resumeWhenFocusLeaves}
        >
          <div
            className="home-review-track"
            data-paused={isPaused}
            style={{
              animationPlayState: isPaused ? 'paused' : 'running',
            }}
          >
            {displayItems.map((review, index) => (
              <article
                className="home-review-card"
                key={`${review.id}-${index}`}
                aria-hidden={index >= baseItems.length ? true : undefined}
              >
                <div className="home-review-card__topline">
                  <span>Review {String((index % reviews.length) + 1).padStart(2, '0')}</span>
                  <div className="home-review-card__stars" aria-label={`${review.rating} out of 5 stars`}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star
                        key={star}
                        aria-hidden="true"
                        fill={star <= review.rating ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth={star <= review.rating ? 0 : 1.5}
                      />
                    ))}
                  </div>
                </div>
                <blockquote>“{review.body}”</blockquote>
                <footer>
                  <span>{review.userName.charAt(0).toUpperCase()}</span>
                  <div>
                    <strong>{review.userName}</strong>
                    <small>{review.productName}</small>
                  </div>
                </footer>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

