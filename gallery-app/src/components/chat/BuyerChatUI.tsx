import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { getChatMessagePreview } from '../../lib/chatMessages';
import { formatTime } from '../../lib/utils';

export interface BuyerShop {
  id: string;
  name: string;
  email: string;
  description: string;
  about: string;
  banner: string;
  image: string;
}

export interface BuyerConversation {
  id: string;
  shop_id: string;
  shop_name: string;
  buyer_id: string;
  buyer_unread: number;
  artisan_unread: number;
  last_message: string;
  last_message_at: string;
  created_at: string;
}

export interface BuyerMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  image_url?: string | null;
  created_at: string;
}

export interface ShopActivity {
  active: boolean;
  text: string;
}

export interface ShopStats {
  avg: number;
  count: number;
}

interface ShopAvatarProps {
  image?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  decorative?: boolean;
}

export function BuyerShopAvatar({ image, name, size = 'md', decorative = false }: ShopAvatarProps) {
  return (
    <span className={`buyer-chat-avatar buyer-chat-avatar--${size}`} aria-hidden={decorative || undefined}>
      {image ? <img src={image} alt={decorative ? '' : name} /> : <span>{name?.charAt(0) || 'S'}</span>}
    </span>
  );
}

interface ConversationListProps {
  conversations: BuyerConversation[];
  selectedId?: string;
  search: string;
  shopImages: Record<string, string>;
  getActivity: (shopId: string) => ShopActivity;
  onSearchChange: (value: string) => void;
  onSelect: (conversation: BuyerConversation) => void;
  onNewConversation: () => void;
  onDelete: (conversationId: string) => void;
}

export function BuyerConversationList({
  conversations,
  selectedId,
  search,
  shopImages,
  getActivity,
  onSearchChange,
  onSelect,
  onNewConversation,
  onDelete,
}: ConversationListProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = (event: globalThis.KeyboardEvent | MouseEvent) => {
      if (event instanceof globalThis.KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof MouseEvent && (event.target as HTMLElement).closest('[data-conversation-menu]')) return;
      setOpenMenuId(null);
    };
    document.addEventListener('keydown', closeMenu);
    document.addEventListener('mousedown', closeMenu);
    return () => {
      document.removeEventListener('keydown', closeMenu);
      document.removeEventListener('mousedown', closeMenu);
    };
  }, [openMenuId]);

  return (
    <aside className="buyer-chat-sidebar" aria-label="Conversations">
      <div className="buyer-chat-sidebar__header">
        <div>
          <p>Inbox</p>
          <h1>Messages</h1>
        </div>
        <button type="button" className="buyer-chat-new" onClick={onNewConversation} aria-label="Start a new conversation">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      <label className="buyer-chat-search">
        <span className="sr-only">Search conversations</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        <input type="search" placeholder="Search shops" value={search} onChange={event => onSearchChange(event.target.value)} />
      </label>

      <div className="buyer-chat-conversations">
        {conversations.length === 0 ? (
          <div className="buyer-chat-list-empty">
            <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg></span>
            <strong>No conversations</strong>
            <p>Start a conversation with a shop to see it here.</p>
            <button type="button" onClick={onNewConversation}>Message a shop</button>
          </div>
        ) : conversations.map(conversation => {
          const activity = getActivity(conversation.shop_id);
          const menuOpen = openMenuId === conversation.id;
          return (
            <article className={`buyer-chat-conversation${selectedId === conversation.id ? ' is-active' : ''}`} key={conversation.id}>
              <button type="button" className="buyer-chat-conversation__select" onClick={() => onSelect(conversation)}>
                <span className="buyer-chat-conversation__avatar">
                  <BuyerShopAvatar image={shopImages[conversation.shop_id]} name={conversation.shop_name} decorative />
                  <i className={activity.active ? 'is-online' : ''} aria-hidden="true" />
                </span>
                <span className="buyer-chat-conversation__copy">
                  <span className="buyer-chat-conversation__topline">
                    <strong>{conversation.shop_name}</strong>
                    <time dateTime={conversation.last_message_at}>{formatTime(conversation.last_message_at)}</time>
                  </span>
                  <span className="buyer-chat-conversation__preview">{getChatMessagePreview(conversation.last_message) || 'Start a conversation'}</span>
                </span>
              </button>
              {conversation.buyer_unread > 0 ? (
                <span className="buyer-chat-unread" aria-label={`${conversation.buyer_unread} unread messages`}>
                  {conversation.buyer_unread > 99 ? '99+' : conversation.buyer_unread}
                </span>
              ) : null}
              <div className="buyer-chat-conversation__menu" data-conversation-menu>
                <button
                  type="button"
                  aria-label={`More actions for ${conversation.shop_name}`}
                  aria-expanded={menuOpen}
                  onClick={() => setOpenMenuId(menuOpen ? null : conversation.id)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
                </button>
                {menuOpen ? (
                  <div role="menu" className="buyer-chat-conversation__popover">
                    <button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); onDelete(conversation.id); }}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6" /></svg>
                      Delete conversation
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </aside>
  );
}

interface ChatHeaderProps {
  conversation: BuyerConversation;
  image?: string;
  activity: ShopActivity;
  stats: ShopStats;
  showBack: boolean;
  onBack: () => void;
  onShowDetails: () => void;
}

export function BuyerChatHeader({ conversation, image, activity, stats, showBack, onBack, onShowDetails }: ChatHeaderProps) {
  return (
    <header className="buyer-chat-header">
      <div className="buyer-chat-header__identity">
        {showBack ? (
          <button type="button" className="buyer-chat-header__back" onClick={onBack} aria-label="Back to conversations">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
        ) : null}
        <span className="buyer-chat-header__avatar">
          <BuyerShopAvatar image={image} name={conversation.shop_name} decorative />
          <i className={activity.active ? 'is-online' : ''} aria-hidden="true" />
        </span>
        <div>
          <h2>{conversation.shop_name}</h2>
          <p className={activity.active ? 'is-online' : ''}>{activity.text || 'Currently offline'}</p>
        </div>
      </div>
      <div className="buyer-chat-header__actions">
        {stats.count > 0 ? (
          <span className="buyer-chat-rating" aria-label={`${stats.avg.toFixed(1)} stars from ${stats.count} reviews`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 6.3 7 .9-5.1 4.9 1.3 6.9-6.2-3.3L5.8 21l1.2-6.9-5-4.9 6.9-.9L12 2Z" /></svg>
            {stats.avg.toFixed(1)} <small>({stats.count})</small>
          </span>
        ) : null}
        <button type="button" className="buyer-chat-info" onClick={onShowDetails} aria-label={`View details for ${conversation.shop_name}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></svg>
        </button>
      </div>
    </header>
  );
}

interface MessageComposerProps {
  value: string;
  imagePreview: string | null;
  pendingImage: File | null;
  uploading: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onValueChange: (value: string) => void;
  onTyping: () => void;
  onPickImage: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: () => void;
  onSend: () => void;
}

export function BuyerMessageComposer({
  value,
  imagePreview,
  pendingImage,
  uploading,
  fileInputRef,
  onValueChange,
  onTyping,
  onPickImage,
  onRemoveImage,
  onSend,
}: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = Boolean(value.trim() || pendingImage) && !uploading;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [value]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className="buyer-chat-composer">
      {imagePreview ? (
        <div className="buyer-chat-composer__preview">
          <img src={imagePreview} alt="Attachment preview" />
          <span>{pendingImage?.name}</span>
          <button type="button" onClick={onRemoveImage} aria-label="Remove image attachment">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ) : null}
      <div className="buyer-chat-composer__row">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickImage} hidden />
        <button type="button" className="buyer-chat-attach" onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label="Attach an image">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 11-9 9a6 6 0 0 1-8-8l9-9a4 4 0 0 1 6 6l-9 9a2 2 0 0 1-3-3l8-8" /></svg>
        </button>
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          placeholder="Write a message..."
          aria-label="Message"
          onChange={event => { onValueChange(event.target.value); onTyping(); }}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="buyer-chat-send" onClick={onSend} disabled={!canSend} aria-label={uploading ? 'Uploading image' : 'Send message'}>
          {uploading ? <span className="buyer-chat-spinner" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></svg>}
        </button>
      </div>
      <p className="buyer-chat-composer__hint">Enter to send. Shift + Enter for a new line</p>
    </div>
  );
}

interface ShopDetailsProps {
  open: boolean;
  mobile: boolean;
  shop: BuyerShop | null;
  activity: ShopActivity;
  onClose: () => void;
}

export function BuyerShopDetails({ open, mobile, shop, activity, onClose }: ShopDetailsProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button')?.focus());

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open || !shop) return null;

  return (
    <div className={`buyer-shop-surface${mobile ? ' is-mobile' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="buyer-shop-panel" role="dialog" aria-modal="true" aria-labelledby="buyer-shop-details-title">
        {mobile ? <span className="buyer-shop-panel__handle" aria-hidden="true" /> : null}
        <div className="buyer-shop-panel__topbar">
          <div><p>Conversation details</p><h2 id="buyer-shop-details-title">Shop information</h2></div>
          <button type="button" onClick={onClose} aria-label="Close shop details"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div className="buyer-shop-panel__scroll">
          <div className="buyer-shop-hero">
            <img src={shop.banner || '/images/vases_collection.png'} alt="" />
            <BuyerShopAvatar image={shop.image} name={shop.name} size="lg" />
          </div>
          <div className="buyer-shop-summary">
            <h3>{shop.name}</h3>
            <p className={activity.active ? 'is-online' : ''}><span />{activity.text || 'Currently offline'}</p>
          </div>
          <section className="buyer-shop-section">
            <h4>About</h4>
            <p>{shop.about || shop.description || 'Traditional Filipino pottery shop dedicated to preserving local craftsmanship.'}</p>
          </section>
          {shop.email ? <section className="buyer-shop-section"><h4>Contact</h4><a href={`mailto:${shop.email}`}>{shop.email}</a></section> : null}
        </div>
        <div className="buyer-shop-panel__footer">
          <Link to={`/shop/${shop.id}`}>View shop page <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></Link>
        </div>
      </div>
    </div>
  );
}

interface NewConversationDialogProps {
  open: boolean;
  shops: BuyerShop[];
  search: string;
  getActivity: (shopId: string) => ShopActivity;
  onSearchChange: (value: string) => void;
  onSelect: (shop: BuyerShop) => void;
  onClose: () => void;
}

export function BuyerNewConversationDialog({ open, shops, search, getActivity, onSearchChange, onSelect, onClose }: NewConversationDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus());

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="buyer-new-chat" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="buyer-new-chat__dialog" role="dialog" aria-modal="true" aria-labelledby="buyer-new-chat-title">
        <div className="buyer-new-chat__header">
          <div><p>New message</p><h2 id="buyer-new-chat-title">Choose a shop</h2></div>
          <button type="button" onClick={onClose} aria-label="Close new conversation dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <label className="buyer-chat-search buyer-new-chat__search">
          <span className="sr-only">Search shops</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input autoFocus type="search" placeholder="Search shops" value={search} onChange={event => onSearchChange(event.target.value)} />
        </label>
        <div className="buyer-new-chat__list">
          {shops.length === 0 ? <p className="buyer-new-chat__empty">No shops match your search.</p> : shops.map(shop => {
            const activity = getActivity(shop.id);
            return (
              <button type="button" key={shop.id} onClick={() => onSelect(shop)}>
                <BuyerShopAvatar image={shop.image} name={shop.name} decorative />
                <span><strong>{shop.name}</strong><small>{shop.description || 'Traditional pottery shop'}</small></span>
                <i className={activity.active ? 'is-online' : ''} aria-label={activity.text || 'Offline'} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
