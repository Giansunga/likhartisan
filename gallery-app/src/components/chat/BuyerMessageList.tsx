import { useMemo, type RefObject } from 'react';
import { fmt } from '../../lib/utils';
import DesignMessageCard from './DesignMessageCard';
import { BuyerShopAvatar, type BuyerMessage } from './BuyerChatUI';

interface ProductInquiryPayload extends Record<string, unknown> {
  type: 'product_inquiry';
  message?: string;
  productId?: string;
  productImage?: string;
  productName?: string;
  productPrice?: number;
  variantDimensions?: string;
}

interface MessageGroup {
  senderId: string;
  messages: BuyerMessage[];
}

interface BuyerMessageListProps {
  messages: BuyerMessage[];
  userId: string;
  shopName: string;
  shopImage?: string;
  remoteTyping: boolean;
  endRef: RefObject<HTMLDivElement | null>;
}

function parseStructuredMessage(message: BuyerMessage): {
  text: string;
  designData: Record<string, unknown> | null;
  productData: ProductInquiryPayload | null;
} {
  try {
    const payload = JSON.parse(message.text) as Record<string, unknown>;
    const type = payload.type;
    if (type === 'design_submission' || type === 'design_request' || type === 'design_request_update' || payload.design) {
      return { text: typeof payload.message === 'string' ? payload.message : '', designData: payload, productData: null };
    }
    if (type === 'product_inquiry') {
      return {
        text: typeof payload.message === 'string' ? payload.message : '',
        designData: null,
        productData: payload as ProductInquiryPayload,
      };
    }
  } catch {
    // Plain text messages are expected to fail JSON parsing.
  }
  return { text: message.text, designData: null, productData: null };
}

export default function BuyerMessageList({ messages, userId, shopName, shopImage, remoteTyping, endRef }: BuyerMessageListProps) {
  const groups = useMemo(() => messages.reduce<MessageGroup[]>((result, message) => {
    const previous = result[result.length - 1];
    if (previous?.senderId === message.sender_id) previous.messages.push(message);
    else result.push({ senderId: message.sender_id, messages: [message] });
    return result;
  }, []), [messages]);

  return (
    <div className="msg-list buyer-chat-message-list">
      {groups.map(group => {
        const outgoing = group.senderId === userId;
        const direction = outgoing ? 'out' : 'in';
        const lastMessage = group.messages[group.messages.length - 1];
        const timestamp = new Date(lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return (
          <div key={`${group.senderId}-${lastMessage.id}`} className={`msg-group msg-group--${direction}`}>
            {group.messages.map((message, index) => {
              const { text, designData, productData } = parseStructuredMessage(message);
              const isLast = index === group.messages.length - 1;
              return (
                <div key={message.id} className={`msg-row msg-row--${direction} msg-fade-in`}>
                  {!outgoing ? (
                    isLast ? <div className="msg-avatar"><BuyerShopAvatar image={shopImage} name={shopName} size="sm" decorative /></div> : <div className="msg-avatar-spacer" />
                  ) : null}
                  <div className={`msg-bubble-wrap msg-bubble-wrap--${direction}`}>
                    {designData ? <DesignMessageCard data={designData} /> : productData?.productId ? (
                      <a href={`/product/${productData.productId}`} target="_blank" rel="noopener noreferrer" className="chat-product-card">
                        {productData.productImage ? <img src={productData.productImage} alt={productData.productName || 'Product'} className="chat-product-img" /> : null}
                        <div className="chat-product-info">
                          <span className="chat-product-name">{productData.productName || 'Product'}</span>
                          {productData.variantDimensions ? <span className="chat-product-variant">{productData.variantDimensions}</span> : null}
                          <span className="chat-product-price">{fmt(Number(productData.productPrice) || 0)}</span>
                        </div>
                      </a>
                    ) : null}
                    {message.image_url ? (
                      <a href={message.image_url} target="_blank" rel="noopener noreferrer" className="chat-image-bubble">
                        <img src={message.image_url} alt="Message attachment" />
                      </a>
                    ) : null}
                    {text ? <div className={`msg-bubble msg-bubble--${direction}`}>{text}</div> : null}
                  </div>
                </div>
              );
            })}
            <div className={`msg-ts msg-ts--${direction}`}>
              <span>{timestamp}</span>
              {outgoing ? <span className="msg-ts-check" aria-label="Sent"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 6-11 11-5-5" /></svg></span> : null}
            </div>
          </div>
        );
      })}

      {remoteTyping ? (
        <div className="msg-typing-row msg-fade-in">
          <div className="msg-avatar"><BuyerShopAvatar image={shopImage} name={shopName} size="sm" decorative /></div>
          <div className="chat-typing-bubble" aria-label={`${shopName} is typing`}>
            <div className="chat-typing-dots" aria-hidden="true"><span className="chat-typing-dot" /><span className="chat-typing-dot" /><span className="chat-typing-dot" /></div>
          </div>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
