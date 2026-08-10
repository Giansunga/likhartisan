import { describe, expect, it } from 'vitest';
import { getShopProfileCompletion, makeShopProfileDraft, validateShopProfile } from '../shopProfile';

describe('shop profile helpers', () => {
  it('normalizes optional shop fields into an editable draft', () => {
    expect(makeShopProfileDraft({ id: 'shop-1', name: 'Regala Pottery' })).toEqual({
      name: 'Regala Pottery',
      description: '',
      about: '',
      location: '',
      image: '',
      banner: '',
    });
  });

  it('requires a meaningful shop name and enforces storefront limits', () => {
    const draft = makeShopProfileDraft({ id: 'shop-1', name: ' ' });
    expect(validateShopProfile(draft).name).toContain('at least 2');
    expect(validateShopProfile({ ...draft, name: 'Clay House' })).toEqual({});
    expect(validateShopProfile({ ...draft, name: 'Clay House', description: 'x'.repeat(181) }).description).toContain('180');
  });

  it('calculates profile strength from the six customer-facing essentials', () => {
    const complete = {
      name: 'Regala Pottery',
      description: 'Hand-thrown pottery made for everyday rituals.',
      about: 'Our studio creates small-batch pieces by hand, inspired by local clay and slow living traditions.',
      location: 'Manila, Philippines',
      image: 'profile.jpg',
      banner: 'cover.jpg',
    };
    expect(getShopProfileCompletion(complete)).toMatchObject({ completed: 6, percent: 100 });
    expect(getShopProfileCompletion({ ...complete, image: '', banner: '', location: '' })).toMatchObject({ completed: 3, percent: 50 });
  });
});
