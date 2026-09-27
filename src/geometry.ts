export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Transform { x: number; y: number; scale: number }

export const MIN_SCALE = 0.00001;
export const MAX_SCALE = 32;
export const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

export function fitTransform(content: Size, viewport: Size, padding = 24): Transform {
  const scale = clampScale(Math.min(
    Math.max(1, viewport.width - padding * 2) / Math.max(1, content.width),
    Math.max(1, viewport.height - padding * 2) / Math.max(1, content.height),
    1,
  ));
  return { scale, x: (viewport.width - content.width * scale) / 2, y: (viewport.height - content.height * scale) / 2 };
}

/** Keep the same diagram point under the cursor/fingers while zooming. */
export function zoomAt(transform: Transform, requestedScale: number, point: Point): Transform {
  const scale = clampScale(requestedScale);
  const ratio = scale / transform.scale;
  return { scale, x: point.x - (point.x - transform.x) * ratio, y: point.y - (point.y - transform.y) * ratio };
}

export function pinchTransform(transform: Transform, before: [Point, Point], after: [Point, Point]): Transform {
  const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
  const oldCenter = midpoint(...before);
  const newCenter = midpoint(...after);
  const oldDistance = distance(...before);
  const result = zoomAt(transform, oldDistance < 1 ? transform.scale : transform.scale * distance(...after) / oldDistance, oldCenter);
  result.x += newCenter.x - oldCenter.x;
  result.y += newCenter.y - oldCenter.y;
  return result;
}
