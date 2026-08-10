import { describe, expect, it } from 'vitest';
import { createDesignRequestSnapshot, isDesignRequestMessage } from '../designRequest';

describe('design request snapshots', () => {
  it('creates an immutable versioned copy with exact design values', () => {
    const source = {
      model: { id: 'model-1', name: 'Palayok', file: '/pot.glb', thumbnail: '/pot.png', category: 'Pot' },
      shape: { height: 40, bodyWidth: 32, neckWidth: 12, rimSize: 14, curvature: 72 },
      material: { finish: 'glazed' as const, color: '#315a9f' },
      decoration: { patternId: 'floral', placement: 'full' as const, scale: 1.35, color: '#ffffff', effect: 'painted' as const },
      attachments: [],
      dimensions: { heightCm: 40, widthCm: 32 }, estimate: { price: 1550, productionDays: 7 },
    };
    const snapshot = createDesignRequestSnapshot(source);
    source.shape.height = 10;
    expect(snapshot).toMatchObject({ version: 1, shape: { height: 40 }, material: { finish: 'glazed', color: '#315A9F' }, decoration: { placement: 'full' } });
  });

  it('normalizes unknown finishes and rejects malformed message envelopes', () => {
    const snapshot = createDesignRequestSnapshot({
      model: { id: null, name: 'Pot', file: '/pot.glb', thumbnail: '', category: 'Pot' },
      shape: { height: 25, bodyWidth: 20, neckWidth: 15, rimSize: 12, curvature: 50 },
      material: { finish: 'unknown' as never, color: 'bad' },
      decoration: { patternId: '', placement: 'middle', scale: 1, color: '#7A3E12', effect: 'painted' }, attachments: [],
      dimensions: { heightCm: 25, widthCm: 20 }, estimate: { price: 1250, productionDays: 5 },
    });
    expect(snapshot.material).toEqual({ finish: 'raw_clay', color: '#BE734F' });
    expect(isDesignRequestMessage({ type: 'design_request', version: 1, request_id: 'r1', message: 'Sent' })).toBe(true);
    expect(isDesignRequestMessage({ type: 'design_request', request_id: 'r1' })).toBe(false);
  });
});
