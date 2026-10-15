export const MAX_PRODUCT_TAGS = 10;
export const MAX_PRODUCT_TAG_LENGTH = 40;

export interface ProductTagsDraft {
  tags: string[];
  input: string;
}

export function normalizeProductTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((tag): tag is string => typeof tag === 'string')
    .flatMap(tag => tag.split(','))
    .map(tag => tag.trim().replace(/\s+/g, ' ').toLowerCase())
    .filter(Boolean))];
}

export function resolveProductTags(draft: ProductTagsDraft) {
  const tags = normalizeProductTags([...draft.tags, draft.input]);
  const error = tags.some(tag => tag.length > MAX_PRODUCT_TAG_LENGTH)
    ? `Each tag must be ${MAX_PRODUCT_TAG_LENGTH} characters or fewer.`
    : tags.length > MAX_PRODUCT_TAGS ? `Use up to ${MAX_PRODUCT_TAGS} tags per product.` : '';
  return { tags, error };
}
