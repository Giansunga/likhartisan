import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLandingFeature, type LandingModel } from '../../../lib/landing3dFeature';
import FreeformScrollSection from '../FreeformScrollSection';

const state = vi.hoisted(() => ({
  setting: null as null | Record<string, unknown>,
  settingError: null as null | { message: string },
  selected: null as null | Record<string, unknown>,
  fallback: null as null | Record<string, unknown>,
  fallbackCalls: 0,
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const progress = { get: () => 0 };
  const Block = React.forwardRef<HTMLElement, { children?: React.ReactNode; className?: string; style?: React.CSSProperties; 'aria-hidden'?: boolean }>((props, ref) =>
    React.createElement('div', { ref, className: props.className, style: props.style, 'aria-hidden': props['aria-hidden'] }, props.children));
  return { motion: { section: Block, div: Block }, useScroll: () => ({ scrollYProgress: progress }), useTransform: () => '#fff', useMotionValueEvent: () => {} };
});
vi.mock('../FreeformViewer', () => ({ default: ({ modelFile }: { modelFile: string }) => <div>3D: {modelFile}</div> }));
vi.mock('../../../lib/supabase', () => ({ supabase: { from(table: string) {
  if (table === 'landing_3d_feature') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.setting, error: state.settingError }) }) }) };
  return { select: () => ({
    eq: () => ({ maybeSingle: async () => ({ data: state.selected, error: null }), not: () => ({ not: () => ({ limit: () => ({ maybeSingle: async () => { state.fallbackCalls++; return { data: state.fallback, error: null }; } }) }) }) }),
  }) };
} } }));

const model: LandingModel = {
  id: 'featured-1', name: 'Featured Vase', category: 'Vase', file_url: 'https://example.com/featured.glb', thumbnail: '', shop_id: 'shop-1', status: 'active',
  base_height_in: 12, base_body_width_in: 8, base_neck_width_in: 5, base_rim_size_in: 6,
  base_price_php: 500, base_production_days: 7,
};

function Destination() {
  const location = useLocation();
  return <pre data-testid="destination">{JSON.stringify(location.state)}</pre>;
}

function renderSection() {
  return render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<FreeformScrollSection />} /><Route path="/freeform" element={<Destination />} /></Routes></MemoryRouter>);
}

beforeEach(() => {
  state.setting = null;
  state.settingError = null;
  state.selected = null;
  state.fallback = { ...model, id: 'fallback', file_url: 'https://example.com/fallback.glb' };
  state.fallbackCalls = 0;
  vi.stubGlobal('IntersectionObserver', class {
    private callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) { this.callback = callback; }
    observe() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    disconnect() {}
  });
});

describe('landing featured 3D preview', () => {
  it('uses the published model and carries the final stage into Design Studio', async () => {
    const feature = createLandingFeature(model);
    feature.stages.details.material.color = '#123456';
    state.setting = { model_id: model.id, visual_keyframes: feature };
    state.selected = model;
    renderSection();
    expect(await screen.findByText('3D: https://example.com/featured.glb')).toBeInTheDocument();
    expect(state.fallbackCalls).toBe(0);
    fireEvent.click(screen.getByText('Open Design Studio').closest('button')!);
    const destination = JSON.parse(screen.getByTestId('destination').textContent || '{}');
    expect(destination.modelId).toBe('featured-1');
    expect(destination.shopId).toBe('shop-1');
    expect(destination.featuredLook.material.color).toBe('#123456');
  });

  it('retains the original active-model fallback when settings cannot be loaded', async () => {
    state.settingError = { message: 'Unavailable' };
    renderSection();
    await waitFor(() => expect(state.fallbackCalls).toBe(1));
    expect(await screen.findByText('3D: https://example.com/fallback.glb')).toBeInTheDocument();
  });
});
