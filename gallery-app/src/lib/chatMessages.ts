export interface ProductInquiryContent {
  productId?: string;
  productName?: string;
  productImage?: string;
  productPrice?: number;
  variantDimensions?: string;
  variantHeight?: string;
  variantOpeningDiameter?: string;
}

export interface ParsedChatMessage {
  text: string;
  product?: ProductInquiryContent;
  design?: Record<string, unknown>;
}

const COMPLETE_CODE_FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
const DESIGN_MESSAGE_TYPES = new Set([
  'design_submission',
  'design_request',
  'design_request_update',
]);

function unwrapJsonObject(rawText: string): Record<string, unknown> | null {
  let candidate: unknown = rawText.trim();

  for (let depth = 0; depth < 3 && typeof candidate === 'string'; depth += 1) {
    const fenced = candidate.match(COMPLETE_CODE_FENCE);
    const jsonText = (fenced?.[1] ?? candidate).trim();
    if (!jsonText) return null;

    try {
      candidate = JSON.parse(jsonText) as unknown;
    } catch {
      return null;
    }
  }

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  return candidate as Record<string, unknown>;
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

export function parseChatMessage(rawText: string | null | undefined): ParsedChatMessage {
  const normalizedText = typeof rawText === 'string' ? rawText : '';
  const payload = unwrapJsonObject(normalizedText);
  if (!payload) return { text: normalizedText };

  const type = optionalString(payload.type);
  const text = optionalString(payload.message) ?? '';

  if ((type && DESIGN_MESSAGE_TYPES.has(type)) || payload.design) {
    return { text, design: payload };
  }

  if (type === 'product_inquiry') {
    return {
      text,
      product: {
        productId: optionalString(payload.productId),
        productName: optionalString(payload.productName),
        productImage: optionalString(payload.productImage),
        productPrice: typeof payload.productPrice === 'number' ? payload.productPrice : undefined,
        variantDimensions: optionalString(payload.variantDimensions),
        variantHeight: optionalString(payload.variantHeight),
        variantOpeningDiameter: optionalString(payload.variantOpeningDiameter),
      },
    };
  }

  return { text: normalizedText };
}

export function getChatMessagePreview(rawText: string | null | undefined): string {
  const content = parseChatMessage(rawText);
  if (content.text.trim()) return content.text.trim();
  if (content.product) {
    return content.product.productName
      ? `Product inquiry about ${content.product.productName}`
      : 'Product inquiry';
  }
  if (content.design) {
    if (content.design.type === 'design_request_update') return 'Custom design update';
    if (content.design.type === 'design_submission') return 'Custom design submitted';
    return 'Custom design request';
  }
  return '';
}
