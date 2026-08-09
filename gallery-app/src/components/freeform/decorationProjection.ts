export type DecorationProjection = {
  minY: number;
  height: number;
  repeat: number;
};

type ProjectionBounds = {
  minY: number;
  rangeY: number;
  centerY: number;
};

/**
 * Keeps decoration coordinates relative to the live pottery dimensions.
 * This makes vertical placements move with height changes and preserves the
 * apparent motif size around a wider or narrower circumference.
 */
export function getDecorationProjection(
  bounds: ProjectionBounds,
  heightScale: number,
  bodyWidth: number,
  patternScale: number,
): DecorationProjection {
  const safeHeightScale = Math.max(heightScale, 0.0001);
  const safePatternScale = Math.max(patternScale, 0.0001);
  const safeBodyWidth = Math.max(bodyWidth, 0.0001);

  return {
    minY: bounds.centerY + (bounds.minY - bounds.centerY) * safeHeightScale,
    height: Math.max(bounds.rangeY * safeHeightScale, 0.0001),
    repeat: Math.max((4 * safeBodyWidth) / 20 / safePatternScale, 0.25),
  };
}
