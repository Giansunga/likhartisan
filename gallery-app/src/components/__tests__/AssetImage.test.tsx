import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import AssetImage from '../AssetImage';
import { R2_ORIGIN } from '../../lib/assetDelivery';

it('uses same-origin delivery and a local fallback without repeated error callbacks', () => {
  const error = vi.fn();
  const { rerender } = render(<AssetImage src={`${R2_ORIGIN}/products/photo.jpg`} alt="Pot" onError={error} />);
  const image = screen.getByAltText('Pot');
  expect(image).toHaveAttribute('src', '/media/r2/products/photo.jpg');
  fireEvent.error(image);
  expect(image).toHaveAttribute('src', '/images/media-unavailable.svg');
  fireEvent.error(image);
  expect(error).toHaveBeenCalledTimes(1);
  rerender(<AssetImage src={`${R2_ORIGIN}/products/new.jpg`} alt="Pot" onError={error} />);
  expect(screen.getByAltText('Pot')).toHaveAttribute('src', '/media/r2/products/new.jpg');
});

it.each([undefined, '', '   '])('uses the local image for an empty source (%s)', (src) => {
  render(<AssetImage src={src} alt="Missing pottery" />);
  expect(screen.getByAltText('Missing pottery')).toHaveAttribute('src', '/images/media-unavailable.svg');
});

it('clears responsive sources on failure so the browser can display the fallback', () => {
  render(<AssetImage src="/photo.jpg" srcSet="/photo-large.jpg 2x" alt="Responsive pottery" />);
  const image = screen.getByAltText('Responsive pottery');
  fireEvent.error(image);
  expect(image).toHaveAttribute('src', '/images/media-unavailable.svg');
  expect(image).not.toHaveAttribute('srcset');
});
