import { resolveAssetUrl } from './assetDelivery';
const FLIGHT_DURATION_MS = 1200;
const ARRIVAL_DURATION_MS = 900;
const activeAnimations = new WeakMap<Document, () => void>();

function centerOf(rect: DOMRect) { return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(Math.max(value, minimum), maximum); }
export function cancelCartAnimation(root: Document = document) {
  activeAnimations.get(root)?.();
  activeAnimations.delete(root);
}

export function animateProductToCart(imageUrl: string, root: Document = document, origin?: HTMLElement): boolean {
  cancelCartAnimation(root);
  const view = root.defaultView;
  const source = root.querySelector<HTMLElement>('[data-product-cart-source]');
  const target = [...root.querySelectorAll<HTMLElement>('[data-cart-animation-target]')].find(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < (view?.innerHeight ?? 0);
  });
  if (!view || !imageUrl || (!source && !origin) || !target) return false;
  const reduceMotion = view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targetRect = target.getBoundingClientRect();
  const mediaRect = source?.getBoundingClientRect();
  const mediaVisible = mediaRect && mediaRect.width > 0 && mediaRect.height > 0 && mediaRect.bottom > 0 && mediaRect.top < view.innerHeight;
  const sourceRect = mediaVisible ? mediaRect : origin?.getBoundingClientRect() ?? mediaRect;
  if (!sourceRect || sourceRect.width <= 0 || sourceRect.height <= 0) return false;
  const end = centerOf(targetRect);
  const size = view.innerWidth <= 768 ? 88 : 120;
  const edgeInset = size / 2 + 12;
  const sourceCenter = centerOf(sourceRect);
  const minimumStartY = Math.max(edgeInset, targetRect.bottom + size / 2 + 16);
  const maximumStartY = Math.max(minimumStartY, view.innerHeight - edgeInset);
  const start = {
    x: clamp(sourceCenter.x, edgeInset, Math.max(edgeInset, view.innerWidth - edgeInset)),
    y: clamp(sourceCenter.y, minimumStartY, maximumStartY),
  };
  const midpoint = {
    x: start.x + (end.x - start.x) * 0.58,
    y: Math.max(edgeInset, targetRect.bottom + size / 2 + 12),
  };
  let flight: HTMLImageElement | null = null;
  let badge: HTMLSpanElement | null = null;
  const timers: { flight?: number; arrival?: number } = {};
  let cancelled = false;
  let arrived = false;
  const cleanup = () => {
    cancelled = true;
    if (timers.flight !== undefined) view.clearTimeout(timers.flight);
    if (timers.arrival !== undefined) view.clearTimeout(timers.arrival);
    flight?.removeEventListener('animationend', arrive);
    flight?.remove(); badge?.remove();
    target.classList.remove('cart-target-arrival', 'cart-target-arrival--reduced');
    view.removeEventListener('pagehide', cleanup);
    if (activeAnimations.get(root) === cleanup) activeAnimations.delete(root);
  };
  const arrive = () => {
    if (cancelled || arrived) return;
    arrived = true;
    if (timers.flight !== undefined) view.clearTimeout(timers.flight);
    flight?.removeEventListener('animationend', arrive);
    flight?.remove();
    if (!target.isConnected) { cleanup(); return; }
    const arrivalClass = reduceMotion ? 'cart-target-arrival--reduced' : 'cart-target-arrival';
    target.classList.remove('cart-target-arrival', 'cart-target-arrival--reduced');
    void target.offsetWidth;
    target.classList.add(arrivalClass);
    badge = root.createElement('span');
    badge.className = 'cart-added-badge';
    badge.textContent = '+1';
    badge.setAttribute('aria-hidden', 'true');
    badge.style.left = `${clamp(end.x - 16, 4, view.innerWidth - 40)}px`;
    badge.style.top = `${Math.max(4, targetRect.bottom + 6)}px`;
    root.body.appendChild(badge);
    timers.arrival = view.setTimeout(cleanup, ARRIVAL_DURATION_MS);
  };
  activeAnimations.set(root, cleanup);
  view.addEventListener('pagehide', cleanup, { once: true });
  if (reduceMotion) { arrive(); return true; }
  flight = root.createElement('img');
  flight.src = resolveAssetUrl(imageUrl)!; flight.alt = ''; flight.setAttribute('aria-hidden', 'true');
  flight.className = 'cart-flight-item';
  flight.style.cssText = [
    `--cart-flight-start-x:${start.x}px`, `--cart-flight-start-y:${start.y}px`,
    `--cart-flight-mid-x:${midpoint.x}px`, `--cart-flight-mid-y:${midpoint.y}px`,
    `--cart-flight-end-x:${end.x}px`, `--cart-flight-end-y:${end.y}px`, `--cart-flight-size:${size}px`,
  ].join(';');
  root.body.appendChild(flight);
  flight.addEventListener('animationend', arrive, { once: true });
  timers.flight = view.setTimeout(arrive, FLIGHT_DURATION_MS + 150);
  return true;
}
