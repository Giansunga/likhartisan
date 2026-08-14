import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { animateProductToCart } from '../cartAnimation';

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
  const matchMedia = vi.fn();

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: matchMedia,
  });

  afterEach(() => {
    document.body.innerHTML = '';
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
    const flight = document.querySelector('.cart-flight-item')!;
    expect(flight).toHaveClass('cart-flight-item--reduced');

    fireEvent.animationEnd(flight);
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

    expect(flight.style.getPropertyValue('--cart-flight-start-y')).toBe('120px');
    expect(flight.style.getPropertyValue('--cart-flight-mid-y')).toBe('116px');
  });
});
