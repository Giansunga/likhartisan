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
