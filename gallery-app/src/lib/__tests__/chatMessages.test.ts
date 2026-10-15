import { describe, expect, it } from 'vitest';
import { getChatMessagePreview, latestDesignMessageIds, parseChatMessage } from '../chatMessages';

const productInquiry = {
  type: 'product_inquiry',
  message: 'Is the large size available?',
  productId: 'vase-1',
  productName: 'Sandstone Vase',
  productPrice: 1250,
  variantDimensions: 'Large · 30 cm',
};

describe('chat message formatting', () => {
  it('finds the newest design message per request without treating ordinary, product or legacy messages as updates', () => {
    const event = (request: string) => JSON.stringify({ type: 'design_request_update', version: 1, request_id: request });
    expect([...latestDesignMessageIds([
      { id: 'a', text: event('request-1') },
      { id: 'b', text: event('request-2') },
      { id: 'c', text: `\`\`\`json\n${event('request-1')}\n\`\`\`` },
      { id: 'd', text: 'Ordinary message' },
      { id: 'e', text: JSON.stringify(productInquiry) },
      { id: 'f', text: JSON.stringify({ type: 'design_submission', design: { model: 'Legacy design' } }) },
    ])]).toEqual([['request-1', 'c'], ['request-2', 'b']]);
  });
  it('leaves ordinary messages unchanged', () => {
    expect(parseChatMessage('Hello there')).toEqual({ text: 'Hello there' });
    expect(parseChatMessage('{not valid JSON')).toEqual({ text: '{not valid JSON' });
  });

  it('turns product inquiry payloads into readable message content', () => {
    expect(parseChatMessage(JSON.stringify(productInquiry))).toEqual({
      text: 'Is the large size available?',
      product: {
        productId: 'vase-1',
        productName: 'Sandstone Vase',
        productImage: undefined,
        productPrice: 1250,
        variantDimensions: 'Large · 30 cm',
        variantHeight: undefined,
        variantOpeningDiameter: undefined,
      },
    });
  });

  it('handles structured messages wrapped in a Markdown code fence', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(productInquiry)}\n\`\`\``;
    expect(parseChatMessage(fenced).text).toBe('Is the large size available?');
    expect(getChatMessagePreview(fenced)).toBe('Is the large size available?');
  });

  it('handles legacy payloads that were JSON encoded twice', () => {
    const doubleEncoded = JSON.stringify(JSON.stringify(productInquiry));
    expect(parseChatMessage(doubleEncoded).product?.productId).toBe('vase-1');
    expect(getChatMessagePreview(doubleEncoded)).toBe('Is the large size available?');
  });

  it('formats design events and payloads without a message for inbox previews', () => {
    const designUpdate = JSON.stringify({ type: 'design_request_update', request_id: 'request-1' });
    expect(parseChatMessage(designUpdate).design).toMatchObject({ request_id: 'request-1' });
    expect(getChatMessagePreview(designUpdate)).toBe('Custom design update');

    const productWithoutMessage = JSON.stringify({ type: 'product_inquiry', productName: 'Clay Cup' });
    expect(getChatMessagePreview(productWithoutMessage)).toBe('Product inquiry about Clay Cup');
  });

  it('preserves unknown JSON that a user intentionally sends', () => {
    const unknownJson = '{"status":"okay"}';
    expect(parseChatMessage(unknownJson)).toEqual({ text: unknownJson });
    expect(getChatMessagePreview(unknownJson)).toBe(unknownJson);
    expect(getChatMessagePreview(null)).toBe('');
  });
});
