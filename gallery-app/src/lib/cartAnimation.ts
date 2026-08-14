const FLIGHT_DURATION_MS = 1050;
const ARRIVAL_DURATION_MS = 720;

function centerOf(rect: DOMRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function animateProductToCart(imageUrl: string, root: Document = document): boolean {
  const view = root.defaultView;
  const source = root.querySelector<HTMLElement>('[data-product-cart-source]');
  const target = root.querySelector<HTMLElement>('[data-cart-animation-target]');

  if (!view || !imageUrl || !source || !target) {
    return false;
  }

  const reduceMotion = view.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (sourceRect.width <= 0 || sourceRect.height <= 0 || targetRect.width <= 0 || targetRect.height <= 0) {
    return false;
  }

  const end = centerOf(targetRect);
  const size = Math.min(96, Math.max(58, Math.min(sourceRect.width, sourceRect.height) * 0.2));
  const edgeInset = size / 2 + 12;
  const sourceCenter = centerOf(sourceRect);
  const minimumStartY = Math.max(edgeInset, targetRect.bottom + size / 2 + 16);
  const maximumStartY = Math.max(minimumStartY, view.innerHeight - edgeInset);
  const start = {
    x: clamp(sourceCenter.x, edgeInset, Math.max(edgeInset, view.innerWidth - edgeInset)),
    y: clamp(sourceCenter.y, minimumStartY, maximumStartY),
  };
  const distance = Math.abs(end.x - start.x);
  const visibleArcY = Math.max(edgeInset, targetRect.bottom + size / 2 + 12);
  const midpoint = {
    x: start.x + (end.x - start.x) * 0.58,
    y: Math.max(visibleArcY, Math.min(start.y, end.y) - Math.max(80, distance * 0.12)),
  };
  const flight = root.createElement('img');
  flight.src = imageUrl;
  flight.alt = '';
  flight.setAttribute('aria-hidden', 'true');
  flight.className = reduceMotion ? 'cart-flight-item cart-flight-item--reduced' : 'cart-flight-item';
  flight.style.cssText = [
    `--cart-flight-start-x:${start.x}px`,
    `--cart-flight-start-y:${start.y}px`,
    `--cart-flight-mid-x:${midpoint.x}px`,
    `--cart-flight-mid-y:${midpoint.y}px`,
    `--cart-flight-end-x:${end.x}px`,
    `--cart-flight-end-y:${end.y}px`,
    `--cart-flight-size:${size}px`,
  ].join(';');

  root.body.appendChild(flight);
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    flight.remove();

    const arrivalClass = reduceMotion ? 'cart-target-arrival--reduced' : 'cart-target-arrival';
    target.classList.remove('cart-target-arrival', 'cart-target-arrival--reduced');
    void target.offsetWidth;
    target.classList.add(arrivalClass);

    const clearArrival = () => target.classList.remove(arrivalClass);
    target.addEventListener('animationend', clearArrival, { once: true });
    view.setTimeout(clearArrival, ARRIVAL_DURATION_MS + 100);
  };

  flight.addEventListener('animationend', finish, { once: true });
  view.setTimeout(finish, FLIGHT_DURATION_MS + 150);
  return true;
}
