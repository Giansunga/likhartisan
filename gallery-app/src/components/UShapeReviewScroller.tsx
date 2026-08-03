import { useEffect, useRef, useState } from 'react';

interface Review {
  id: string;
  userName: string;
  rating: number;
  body: string;
  productName: string;
  createdAt?: string;
}

interface UShapeReviewScrollerProps {
  reviews: Review[];
}

export default function UShapeReviewScroller({ reviews }: UShapeReviewScrollerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1400);
  const offsetRef = useRef(0);
  const [, setRenderTrigger] = useState(0);

  // Responsive container measuring for full viewport width tracking
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cardWidth = 320;
  const cardGap = 24;
  const totalItemWidth = cardWidth + cardGap;

  // Calculate dynamic card duplication to guarantee 100% infinite coverage on ultra-wide & 4K displays
  const displayItems: Review[] = [];
  if (reviews.length > 0) {
    const minNeededCards = Math.ceil((containerWidth || 1920) / totalItemWidth) + 6;
    const multiplier = Math.max(6, Math.ceil(minNeededCards / reviews.length));
    for (let m = 0; m < multiplier; m++) {
      displayItems.push(...reviews);
    }
  }

  const totalLoopWidth = displayItems.length * totalItemWidth;

  // 60fps continuous non-stop animation loop
  useEffect(() => {
    if (displayItems.length === 0 || totalLoopWidth === 0) return;

    let animId: number;
    let lastTime: number | null = null;
    const speed = 0.045; // px per millisecond (~45px/sec smooth linear glide)

    const step = (time: number) => {
      if (lastTime !== null) {
        const delta = time - lastTime;
        offsetRef.current = (offsetRef.current + delta * speed) % totalLoopWidth;
        setRenderTrigger(prev => (prev + 1) % 100000);
      }
      lastTime = time;
      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [displayItems.length, totalLoopWidth]);

  if (displayItems.length === 0) return null;

  const halfContainer = containerWidth / 2;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden py-6 select-none"
      style={{
        height: '450px',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 80px, black calc(100% - 80px), transparent 100%)',
        maskImage: 'linear-gradient(to right, transparent 0%, black 80px, black calc(100% - 80px), transparent 100%)',
      }}
    >
      <div className="absolute inset-0 w-full h-full">
        {displayItems.map((rev, index) => {
          // Calculate horizontal position across full viewport width
          let rawX = index * totalItemWidth - offsetRef.current;
          
          // Wrap position inside visible bounds + buffer for seamless infinite loop
          while (rawX < -totalItemWidth * 2) {
            rawX += totalLoopWidth;
          }
          while (rawX > containerWidth + totalItemWidth) {
            rawX -= totalLoopWidth;
          }

          const cardCenterX = rawX + cardWidth / 2;
          
          // Normalized distance from screen center: -1 (far left) to 0 (center) to +1 (far right)
          const normDist = (cardCenterX - halfContainer) / (halfContainer || 1);
          const clampedDist = Math.max(-1.4, Math.min(1.4, normDist));

          // ── U-Shape Curve Mathematics ──
          // y = (1 - normDist^2) * 80px
          // At screen center (normDist = 0): translateY = +80px (dips down into bottom of U)
          // At screen sides (normDist = ±1): translateY = 0px (high up at left/right edges)
          const translateY = Math.max(0, (1 - clampedDist * clampedDist) * 80);
          const scale = Math.max(0.84, 1.06 - Math.abs(clampedDist) * 0.14);
          
          // Fade cards gracefully as they approach screen bounds
          const absDist = Math.abs(clampedDist);
          const opacity = absDist > 1.15 ? Math.max(0, 1 - (absDist - 1.15) * 4) : 1;

          return (
            <div
              key={`${rev.id}-${index}`}
              className="absolute top-4 left-0 transition-shadow duration-300"
              style={{
                width: `${cardWidth}px`,
                transform: `translate3d(${rawX}px, ${translateY}px, 0) scale(${scale})`,
                transformOrigin: 'center center',
                opacity,
                zIndex: Math.round((1.5 - Math.abs(clampedDist)) * 100),
                willChange: 'transform, opacity',
              }}
            >
              <div
                className="bg-white border border-[#E8E0D8] rounded-[16px] p-6 flex flex-col gap-3 transition-all duration-300 hover:border-primary/40 hover:-translate-y-1"
                style={{
                  boxShadow:
                    Math.abs(clampedDist) < 0.3
                      ? '0 14px 36px rgba(130, 62, 11, 0.16)'
                      : '0 4px 18px rgba(0, 0, 0, 0.06)',
                }}
              >
                {/* User Header */}
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-cream-tertiary flex items-center justify-center flex-shrink-0 border border-primary/10">
                    <span className="font-bold text-[0.9rem] text-primary">
                      {rev.userName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-semibold text-[0.92rem] text-brown-dark font-sans leading-tight">
                      {rev.userName}
                    </span>
                    <span className="text-[0.78rem] text-accent font-medium font-sans">
                      {rev.productName}
                    </span>
                  </div>
                </div>

                {/* Rating Stars */}
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <svg
                      key={star}
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill={star <= rev.rating ? '#F59E0B' : 'none'}
                      stroke={star <= rev.rating ? '#F59E0B' : '#D1D5DB'}
                      strokeWidth="1.5"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  ))}
                </div>

                {/* Review Body */}
                <div className="relative pt-1">
                  <span className="absolute -top-2 -left-1 font-serif text-[2.2rem] text-accent opacity-25 leading-none">
                    &ldquo;
                  </span>
                  <p className="text-[0.86rem] text-[#555] leading-[1.65] font-sans pt-2 line-clamp-4">
                    {rev.body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
