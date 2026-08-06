const BASE = '/assets/themes/christmas';

export default function ChristmasBackgroundDecals() {
  return (
    <div className="christmas-background-decals" aria-hidden="true">
      <img src={`${BASE}/christmas-snowflakes.png`} className="christmas-decal christmas-snowflakes-top-left" alt="" draggable={false} loading="lazy" decoding="async" />
      <img src={`${BASE}/christmas-pine-corner.png`} className="christmas-decal christmas-pine-left" alt="" draggable={false} loading="lazy" decoding="async" />
      <img src={`${BASE}/christmas-hanging-ornaments.png`} className="christmas-decal christmas-ornaments-right" alt="" draggable={false} loading="lazy" decoding="async" />
      <img src={`${BASE}/christmas-snowflakes.png`} className="christmas-decal christmas-snowflakes-right" alt="" draggable={false} loading="lazy" decoding="async" />
      <img src={`${BASE}/christmas-ribbon.png`} className="christmas-decal christmas-ribbon-right" alt="" draggable={false} loading="lazy" decoding="async" />
      <img src={`${BASE}/christmas-holly.png`} className="christmas-decal christmas-holly-heading" alt="" draggable={false} loading="lazy" decoding="async" />
      <img src={`${BASE}/christmas-ornament-corner.png`} className="christmas-decal christmas-ornament-bottom-right" alt="" draggable={false} loading="lazy" decoding="async" />
    </div>
  );
}