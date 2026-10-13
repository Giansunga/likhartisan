import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { animateProductToCart, cancelCartAnimation } from '../cartAnimation';

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
  toJSON: () => ({}),
});

describe('animateProductToCart', () => {
  it('starts near the clicked button when media is offscreen and replaces earlier flights', () => {
    vi.useFakeTimers();
    matchMedia.mockReturnValue({ matches: false });
    document.body.innerHTML = '<div data-product-cart-source></div><a data-cart-animation-target></a><button>Add</button>';
    const source = document.querySelector<HTMLElement>('[data-product-cart-source]')!;
    const target = document.querySelector<HTMLElement>('[data-cart-animation-target]')!;
    const button = document.querySelector('button')!;
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(rect(100, -500, 400, 400));
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(900, 20, 44, 44));
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(rect(500, 500, 200, 50));
    animateProductToCart('/one.jpg', document, button);
    expect(document.querySelector<HTMLElement>('.cart-flight-item')!.style.getPropertyValue('--cart-flight-start-y')).toBe('525px');
    expect(document.querySelector<HTMLElement>('.cart-flight-item')!.style.getPropertyValue('--cart-flight-size')).toBe('120px');
    animateProductToCart('/two.jpg', document, button);
    expect(document.querySelectorAll('.cart-flight-item')).toHaveLength(1);
    vi.advanceTimersByTime(1350);
    expect(document.querySelector('.cart-added-badge')).toHaveTextContent('+1');
    cancelCartAnimation();
    expect(document.querySelector('.cart-added-badge')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  const matchMedia = vi.fn();

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: matchMedia,
  });

  afterEach(() => {
    cancelCartAnimation();
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('flies an accessible-hidden product thumbnail into the cart and pulses the target', () => {
    matchMedia.mockReturnValue({ matches: false } as MediaQueryList);
    document.body.innerHTML = '<div data-product-cart-source></div><a data-cart-animation-target></a>';
    const source = document.querySelector<HTMLElement>('[data-product-cart-source]')!;
    const target = document.querySelector<HTMLElement>('[data-cart-animation-target]')!;
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(rect(100, 240, 400, 400));
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(900, 20, 44, 44));

    expect(animateProductToCart('/images/pot.jpg')).toBe(true);

    const flight = document.querySelector<HTMLImageElement>('.cart-flight-item')!;
    expect(flight).toHaveAttribute('src', '/images/pot.jpg');
    expect(flight).toHaveAttribute('aria-hidden', 'true');
    expect(flight.style.getPropertyValue('--cart-flight-end-x')).toBe('922px');

    fireEvent.animationEnd(flight);
    expect(flight).not.toBeInTheDocument();
    expect(target).toHaveClass('cart-target-arrival');
  });

  it('uses a non-traveling feedback animation when reduced motion is requested', () => {
    matchMedia.mockReturnValue({ matches: true } as MediaQueryList);
    document.body.innerHTML = '<div data-product-cart-source></div><a data-cart-animation-target></a>';
    const source = document.querySelector<HTMLElement>('[data-product-cart-source]')!;
    const target = document.querySelector<HTMLElement>('[data-cart-animation-target]')!;
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(rect(100, 240, 400, 400));
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(900, 20, 44, 44));

    expect(animateProductToCart('/images/pot.jpg')).toBe(true);
    expect(document.querySelector('.cart-flight-item')).toBeNull();
    expect(document.querySelector('.cart-added-badge')).toHaveTextContent('+1');
    expect(target).toHaveClass('cart-target-arrival--reduced');
  });

  it('keeps the flight path visible when the product viewer is above the viewport', () => {
    matchMedia.mockReturnValue({ matches: false } as MediaQueryList);
    document.body.innerHTML = '<div data-product-cart-source></div><a data-cart-animation-target></a>';
    const source = document.querySelector<HTMLElement>('[data-product-cart-source]')!;
    const target = document.querySelector<HTMLElement>('[data-cart-animation-target]')!;
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue(rect(100, -400, 400, 400));
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(900, 20, 44, 44));

    expect(animateProductToCart('/images/pot.jpg')).toBe(true);
    const flight = document.querySelector<HTMLElement>('.cart-flight-item')!;

    expect(flight.style.getPropertyValue('--cart-flight-start-y')).toBe('140px');
    expect(flight.style.getPropertyValue('--cart-flight-mid-y')).toBe('136px');
  });
});
