import { describe, expect, it } from 'vitest';
import { emptyAddressParts, formattedAddress, readAddressParts, validAddressCoordinates } from '../profileAddress';
import { profileReturnFromState } from '../profileNavigation';
describe('profile address compatibility', () => {
  it('accepts NCR without a province and stores the dataset version', () => {
    const parts = { ...emptyAddressParts(), region: { code: '13', name: 'NCR' }, city: { code: '13806', name: 'Manila' }, barangay: { code: '138060001', name: 'Barangay 1' }, street: '12 Main St' };
    expect(readAddressParts(parts)).toEqual(parts);
    expect(formattedAddress(parts)).toBe('12 Main St, Barangay 1, Manila, NCR, Philippines');
    expect(readAddressParts({ address: 'Legacy text' })).toBeNull();
  });
  it('rejects missing, invalid and placeholder pins', () => {
    for (const point of [[null, 120], ['', 120], [undefined, 120], [NaN, 120], [91, 120], [15, 181], [0, 0]]) expect(validAddressCoordinates(...point as [unknown, unknown])).toBeNull();
    expect(validAddressCoordinates('15.1', '120.1')).toEqual({ lat: 15.1, lng: 120.1 });
  });
  it('only resumes known shopping pages', () => {
    expect(profileReturnFromState({ profileReturn: { pathname: 'https://example.com' } })).toBeNull();
    const state = { profileReturn: { pathname: '/checkout', state: { deliveryOption: 'pickup', buyNowItem: { productId: 'p1' } } } };
    expect(profileReturnFromState(state)).toEqual(state.profileReturn);
  });
});
