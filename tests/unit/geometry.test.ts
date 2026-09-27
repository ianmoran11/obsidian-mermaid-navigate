import { describe, expect, it } from 'vitest';
import { fitTransform, MAX_SCALE, MIN_SCALE, pinchTransform, zoomAt } from '../../src/geometry';

describe('viewport geometry', () => {
  it('fits and centers a wide diagram with padding', () => {
    expect(fitTransform({ width: 1000, height: 500 }, { width: 548, height: 448 })).toEqual({ scale: 0.5, x: 24, y: 99 });
  });
  it('does not upscale small diagrams on fit', () => {
    expect(fitTransform({ width: 100, height: 100 }, { width: 600, height: 400 })).toEqual({ scale: 1, x: 250, y: 150 });
  });
  it('can fit extremely large diagrams', () => {
    const fit = fitTransform({ width: 100000, height: 50000 }, { width: 400, height: 600 });
    expect(fit.scale * 100000).toBeCloseTo(352);
  });
  it('anchors zoom at the cursor', () => {
    expect(zoomAt({ x: 10, y: 20, scale: 1 }, 2, { x: 100, y: 100 })).toEqual({ x: -80, y: -60, scale: 2 });
  });
  it('clamps zoom using the clamped ratio, not requested ratio', () => {
    const input = { x: 30, y: 40, scale: 1 };
    expect(zoomAt(input, 1e8, { x: 30, y: 40 })).toEqual({ ...input, scale: MAX_SCALE });
    expect(zoomAt(input, 0, { x: 30, y: 40 }).scale).toBe(MIN_SCALE);
  });
  it('pinches around the midpoint while translating it', () => {
    expect(pinchTransform({ x: 0, y: 0, scale: 1 }, [{ x: 0, y: 50 }, { x: 100, y: 50 }], [{ x: 20, y: 70 }, { x: 220, y: 70 }])).toEqual({ x: 20, y: -30, scale: 2 });
  });
  it('handles coincident fingers without NaN or infinity', () => {
    const result = pinchTransform({ x: 0, y: 0, scale: 1 }, [{ x: 10, y: 10 }, { x: 10, y: 10 }], [{ x: 20, y: 20 }, { x: 30, y: 30 }]);
    expect(result).toEqual({ x: 15, y: 15, scale: 1 });
  });
  it('stays finite when a hidden viewport has zero dimensions', () => {
    expect(Object.values(fitTransform({ width: 0, height: 0 }, { width: 0, height: 0 })).every(Number.isFinite)).toBe(true);
  });
});
