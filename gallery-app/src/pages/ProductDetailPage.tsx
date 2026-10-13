import { Component, useState, useEffect, useMemo, useRef, Suspense, lazy, type ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { addToCart, getCart, onCartUpdate } from '../data/store';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { SITE_URL } from '../config';
import type { Product, ProductVariation, ProductReview, CartItem } from '../types';
import type { ReactElement } from 'react';
import { mapSupabaseProduct, fmt, fmtRating, formatVariation } from '../lib/utils';
import { normalizeCatalogMeasurement } from '../lib/measurements';
import RecommendationsSection from '../components/RecommendationsSection';
import { animateProductToCart } from '../lib/cartAnimation';
import { useFavorites } from '../hooks/useFavorites';
import { ChevronDown, FileText, Heart, MessageCircle, ShoppingCart, Store } from 'lucide-react';
import ProductFeaturedArtisan from '../components/ProductFeaturedArtisan';
import './ProductDetailPage.css';

function renderStars(rating: number, size = 14): ReactElement[] {
  const stars: ReactElement[] = [];
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.5;
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      stars.push(
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    } else if (i === full && hasHalf) {
      stars.push(
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" stroke="#F59E0B" strokeWidth="1">
          <defs><linearGradient id={`half-${i}`}><stop offset="50%" stopColor="#F59E0B" /><stop offset="50%" stopColor="transparent" /></linearGradient></defs>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill={`url(#half-${i})`} />
        </svg>
      );
    } else {
      stars.push(
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    }
  }
  return stars;
}

const ModelViewer = lazy(() => import('../components/ModelViewer'));

class ProductMediaErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { favorites, toggleFavorite } = useFavorites();
  const [product, setProduct] = useState<Product | null>(null);
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);
  const [allReviews, setAllReviews] = useState<ProductReview[]>([]);
  const [shopImage, setShopImage] = useState('');
  const [shopProductCount, setShopProductCount] = useState(0);
  const [shopRating, setShopRating] = useState({ avg: 0, count: 0 });
  const [soldCount, setSoldCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [askModal, setAskModal] = useState(false);
  const [askSuccess, setAskSuccess] = useState(false);
  const [askMessage, setAskMessage] = useState('');
  const [askSending, setAskSending] = useState(false);
  const [cart, setCart] = useState(getCart);
  const productSectionRef = useRef<HTMLDivElement>(null);
  const [stickyProductId, setStickyProductId] = useState<string | null>(null);
  const productRating = useMemo(() => {
    if (allReviews.length === 0) return { avg: 0, count: 0 };
    const total = allReviews.reduce((s, r) => s + r.rating, 0);
    return { avg: total / allReviews.length, count: allReviews.length };
  }, [allReviews]);

  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const displayPrice = selectedVariation?.price ?? product?.price ?? 0;
  const cartProductId = product?.id ?? '';
  const cartVariationId = selectedVariation?.id ?? '';
  const cartQuantity = cart.find(item => (
    item.productId === cartProductId && (item.variationId ?? '') === cartVariationId
  ))?.qty ?? 0;

  useEffect(() => onCartUpdate(() => setCart(getCart())), []);

  useEffect(() => {
    const section = productSectionRef.current;
    if (loading || !cartProductId || !section || typeof IntersectionObserver === 'undefined') return;
    const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 80;
    const observer = new IntersectionObserver(([entry]) => {
      setStickyProductId(!entry.isIntersecting && entry.boundingClientRect.bottom <= headerHeight && entry.boundingClientRect.top < 0 ? cartProductId : null);
    }, { rootMargin: `-${headerHeight}px 0px 0px 0px`, threshold: 0 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [loading, cartProductId]);

  useEffect(() => {
    if (!product?.image) return;
    const animationImage = new Image();
    animationImage.src = product.image;
  }, [product?.image]);

  async function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!askMessage.trim() || !product) return;
    setAskSending(true);

    if (!user) { toast.error('Please sign in to send a message.'); setAskSending(false); return; }

    const uid = user.id;
    const text = askMessage.trim();
    const productPayload = JSON.stringify({
      type: 'product_inquiry',
      productId: product.id,
      productName: product.name,
      productImage: product.image,
      productDescription: product.description,
      productPrice: displayPrice,
      variantDimensions: selectedVariation?.dimensions || '',
      variantHeight: selectedVariation?.height || '',
      variantOpeningDiameter: selectedVariation?.openingDiameter || '',
      message: text,
    });

    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('buyer_id', uid)
      .eq('shop_id', product.shopId)
      .maybeSingle();

    let convId = existing?.id;

    if (!convId) {
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          buyer_id: uid,
          shop_id: product.shopId,
          shop_name: product.shopName,
          last_message: text,
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (convErr || !newConv) { toast.error('Failed to start conversation.'); setAskSending(false); return; }
      convId = newConv.id;
    } else {
      await supabase
        .from('conversations')
        .update({ last_message: text, last_message_at: new Date().toISOString() })
        .eq('id', convId);
    }

    const { error: msgErr } = await supabase
      .from('messages')
      .insert({ conversation_id: convId, sender_id: uid, text: productPayload });

    setAskSending(false);
    if (msgErr) { toast.error('Failed to send message.'); return; }
    setAskSuccess(true);
  }

  useEffect(() => {
    let active = true;
    async function fetchProduct() {
      setLoading(true);
      setProduct(null);
      setVariations([]);
      setSelectedVariation(null);
      setAllReviews([]);
      setShopImage('');
      setShopProductCount(0);
      setShopRating({ avg: 0, count: 0 });
      setSoldCount(0);
      setAskModal(false);
      setAskSuccess(false);
      setAskMessage('');
      try {
        const { data, error } = await supabase
          .from('products')
            .select('id, name, description, category, price, stock, image, model3d, materials, dimensions, height, opening_diameter, measurement_unit, technique, shop_id, shop_name, featured_artisan_id, status, views, created_at, updated_at')
          .eq('id', id)
          .single();

        if (!active) return;
        if (error) {
          console.error('Product fetch error:', error);
          return;
        }

        if (data) {
          const mapped: Product = mapSupabaseProduct(data);
          setProduct(mapped);

          if (mapped.shopId) {
            const shopId = mapped.shopId;
            // Fetch shop image, product count, and shop product ids in parallel
            const [shopData, countRes, shopProducts] = await Promise.all([
              supabase.from('shops').select('image').eq('id', shopId).single(),
              supabase.from('products').select('id', { count: 'exact', head: true })
                .eq('shop_id', shopId).eq('status', 'active'),
              supabase.from('products').select('id').eq('shop_id', shopId).eq('status', 'active'),
            ]);
            if (!active) return;
            if (shopData.data?.image) setShopImage(shopData.data.image);
            setShopProductCount(countRes.count || 0);
            if (shopProducts.data && shopProducts.data.length > 0) {
              const productIds = shopProducts.data.map(p => p.id);
              const { data: shopReviews } = await supabase
                .from('product_reviews')
                .select('rating')
                .in('product_id', productIds);
              if (!active) return;
              if (shopReviews && shopReviews.length > 0) {
                const avg = shopReviews.reduce((s: number, r) => s + r.rating, 0) / shopReviews.length;
                setShopRating({ avg, count: shopReviews.length });
              }
            }
          }

          if (!active) return;
          // Atomic view increment (avoids read-modify-write race)
          supabase.rpc('increment_views', { p_id: id });

          // Safe server-side sold count (no full-order download / privacy leak)
          const { data: soldRes } = await supabase.rpc('get_product_sold_count', { p_product_id: id });
          if (!active) return;
          setSoldCount(soldRes || 0);

          const { data: varData, error: varErr } = await supabase
            .from('product_variations')
            .select('id, product_id, dimensions, height, opening_diameter, weight_kg, price, stock, sort_order, measurement_unit')
            .eq('product_id', id)
            .order('sort_order');
          if (!active) return;
          if (varErr) console.error('Variations fetch error:', varErr);
          if (varData) {
            const mappedVars = varData.map((v) => ({
              id: v.id, productId: v.product_id,
              dimensions: normalizeCatalogMeasurement(v.dimensions, v.measurement_unit === 'in' ? 'in' : 'cm'),
              height: normalizeCatalogMeasurement(v.height, v.measurement_unit === 'in' ? 'in' : 'cm'),
              openingDiameter: normalizeCatalogMeasurement(v.opening_diameter, v.measurement_unit === 'in' ? 'in' : 'cm'),
              measurementUnit: 'in' as const,
              weightKg: v.weight_kg == null ? undefined : Number(v.weight_kg),
              price: v.price, stock: v.stock, sortOrder: v.sort_order,
            }));
            setVariations(mappedVars);
            if (mappedVars.length > 0) setSelectedVariation(mappedVars[0]);
          }

          const { data: revData } = await supabase
            .from('product_reviews')
            .select('id, product_id, user_id, user_name, rating, title, body, images, seller_service_rating, delivery_service_rating, created_at')
            .eq('product_id', id)
            .order('created_at', { ascending: false });
          if (!active) return;
          if (revData) {
            const mappedRevs = revData.map((r) => ({
              id: r.id, productId: r.product_id, userId: r.user_id,
              userName: r.user_name, rating: r.rating, title: r.title,
              body: r.body, images: r.images || [],
              sellerServiceRating: r.seller_service_rating || 0,
              deliveryServiceRating: r.delivery_service_rating || 0,
              createdAt: r.created_at,
            }));
            setAllReviews(mappedRevs);
          }
        }
      } catch (error) {
        console.error('Product detail load error:', error);
      } finally {
        if (active) setLoading(false);
      }
    }
    void fetchProduct();
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center" style={{ paddingTop: '80px' }}>
        <div role="status" aria-label="Loading product" style={{ width: '40px', height: '40px', border: '3px solid #E8E0D8', borderTopColor: 'var(--primary-color)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center" style={{ paddingTop: '80px' }}>
        <div className="text-center">
          <h2 className="font-serif text-2xl text-primary mb-4">Product not found</h2>
          <Link to="/gallery" className="text-accent hover:text-primary font-semibold">Back to Gallery</Link>
        </div>
      </div>
    );
  }

  const availableStock = Math.max(0, Math.floor(Number(selectedVariation?.stock ?? product.stock) || 0));
  const cartAtStockLimit = availableStock > 0 && cartQuantity >= availableStock;
  const buyDisabled = availableStock === 0 || (variations.length > 0 && !selectedVariation);
  const addDisabled = buyDisabled || cartAtStockLimit;
  const hasValue = (value: string | undefined) => Boolean(value?.trim() && value.trim().toLowerCase() !== 'n/a');
  const dimensions = selectedVariation ? selectedVariation.dimensions : product.dimensions;
  const height = selectedVariation ? selectedVariation.height : product.height;
  const openingDiameter = selectedVariation ? selectedVariation.openingDiameter : product.openingDiameter;
  const weightKg = selectedVariation?.weightKg;
  const sizeLabel = formatVariation(selectedVariation ?? product);
  const specs = [
    { label: 'Dimensions', value: hasValue(dimensions) ? dimensions : [height, openingDiameter].filter(hasValue).join(' × ') },
    { label: 'Weight', value: weightKg != null && Number.isFinite(weightKg) && weightKg > 0 ? `${weightKg} kg` : '' },
    { label: 'Material', value: hasValue(product.materials) ? product.materials : '' },
  ].filter(spec => spec.value);
  const stickyVisible = !isMobile && stickyProductId === product.id;
  const hasCraftDetails = specs.length > 0 || hasValue(height) || hasValue(openingDiameter) || hasValue(product.technique) || hasValue(product.description);

  const handleAddToCart = () => {
    const result = addToCart({
      productId: product.id,
      productName: product.name,
      price: displayPrice,
      image: product.image,
      shopId: product.shopId,
      shopName: product.shopName,
      qty: 1,
      variationId: selectedVariation?.id || '',
      variation: selectedVariation ? formatVariation(selectedVariation) : '',
    }, availableStock);

    if (result.addedQty === 0) {
      toast.info(`Only ${availableStock} available. Your cart already contains the maximum quantity.`);
      return;
    }
    animateProductToCart(product.image);
  };

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    const singleItem: CartItem = {
      productId: product.id,
      productName: product.name,
      price: displayPrice,
      image: product.image,
      shopId: product.shopId,
      shopName: product.shopName,
      qty: 1,
      variationId: selectedVariation?.id || '',
      variation: selectedVariation ? formatVariation(selectedVariation) : '',
    };
    navigate('/checkout', { state: { buyNowItem: singleItem } });
  };

  const handleChatNow = async () => {
    if (!user) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    navigate('/chat');
  };

  const handleAskClick = async () => {
    if (!user) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    setAskModal(true);
  };


  return (
    <div className={`product-detail-page${stickyVisible ? ' product-detail-page--sticky' : ''}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: product.description,
        image: product.image,
        brand: { '@type': 'Brand', name: 'LikhArtisan' },
        offers: {
          '@type': 'Offer',
          priceCurrency: 'PHP',
          price: displayPrice,
          availability: availableStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          url: `${SITE_URL}/product/${product.id}`,
        },
        aggregateRating: productRating.count > 0 ? {
          '@type': 'AggregateRating',
          ratingValue: productRating.avg.toFixed(1),
          reviewCount: productRating.count,
        } : undefined,
      }) }} />
      <div className="pdp-main">
        <div className="pdp-container">
          <nav className="pdp-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link><span aria-hidden="true">/</span>
            <Link to="/gallery">Gallery</Link>
            {product.category && <><span aria-hidden="true">/</span><Link to={`/gallery?category=${encodeURIComponent(product.category)}`}>{product.category}</Link></>}
            <span aria-hidden="true">/</span><span aria-current="page">{product.name}</span>
          </nav>

          {product.shopId && (
            <section className="pdp-shop" aria-label="Product shop">
              <div className="pdp-shop-identity">
                <div className="pdp-shop-avatar">
                  {shopImage ? <img src={shopImage} alt="" /> : <Store aria-hidden="true" />}
                </div>
                <div className="pdp-shop-details">
                  <h2>{product.shopName || 'Shop'}</h2>
                  <div className="pdp-shop-actions">
                    <button type="button" onClick={handleChatNow}><MessageCircle aria-hidden="true" />Chat Now</button>
                    <Link to={`/shop/${product.shopId}`}><Store aria-hidden="true" />View Shop</Link>
                  </div>
                </div>
              </div>
              <dl className="pdp-shop-stats">
                <div><dt>Products</dt><dd>{shopProductCount}</dd></div>
                <div><dt>Ratings</dt><dd className="pdp-shop-rating">
                  {shopRating.count > 0 ? <><span className="pdp-stars" role="img" aria-label={`${fmtRating(shopRating.avg)} out of 5 stars`}>{renderStars(shopRating.avg, 16)}</span><small>{fmtRating(shopRating.avg)} ({shopRating.count})</small></> : <small>No reviews yet</small>}
                </dd></div>
              </dl>
            </section>
          )}

          <div className="pdp-hero" ref={productSectionRef}>
            <div className="pdp-media">
              <div className="pdp-media-frame" data-product-cart-source>
                <button type="button" className="pdp-favorite" aria-pressed={favorites.includes(product.id)}
                  aria-label={`${favorites.includes(product.id) ? 'Remove' : 'Add'} ${product.name} ${favorites.includes(product.id) ? 'from' : 'to'} favorites`}
                  onClick={() => toggleFavorite(product.id)}>
                  <Heart aria-hidden="true" fill={favorites.includes(product.id) ? 'currentColor' : 'none'} />
                </button>
                {product.model3d ? (
                  <ProductMediaErrorBoundary key={product.model3d} fallback={<img src={product.image} alt={product.name} id="viewer-main-img" />}>
                    <Suspense fallback={<div className="pdp-media-loading" role="status"><span className="pdp-spinner" />Loading 3D model…</div>}>
                      <ModelViewer url={product.model3d} />
                    </Suspense>
                  </ProductMediaErrorBoundary>
                ) : <img src={product.image} alt={product.name} id="viewer-main-img" />}
              </div>
              <ProductFeaturedArtisan key={product.id} artisanId={product.featuredArtisanId} shopId={product.shopId} />
            </div>

            <div className="pdp-info">
              <div className="pdp-heading">
                <h1>{product.name}</h1>
                <div className="pdp-product-rating">
                  {productRating.count > 0 ? <><span className="pdp-stars" role="img" aria-label={`${fmtRating(productRating.avg)} out of 5 stars`}>{renderStars(productRating.avg, 16)}</span><a href="#product-reviews" aria-label={`Read ${productRating.count} product reviews`}>({fmtRating(productRating.avg)})</a></> : <a href="#product-reviews">No reviews yet</a>}
                  {soldCount > 0 && <span>{soldCount} sold</span>}
                </div>
              </div>

              <div className="pdp-selection">
                <div className="pdp-price-row">
                  <div className="pdp-size-caption"><span>{variations.length > 0 ? 'Select size' : product.category}</span>{sizeLabel && <span className="pdp-selected-size">{sizeLabel}</span>}</div>
                  <div className="pdp-price" aria-live="polite" aria-atomic="true">{variations.length > 0 && !selectedVariation ? 'Select a variation' : fmt(displayPrice)}</div>
                </div>
                {variations.length > 0 && (
                  <div className="pdp-variations" role="group" aria-label="Select size">
                    {variations.map((variation, index) => (
                      <button type="button" key={variation.id} onClick={() => setSelectedVariation(variation)} aria-pressed={selectedVariation?.id === variation.id}>
                        <span>{formatVariation(variation) || `Size ${index + 1}`}</span>
                        {variation.stock <= 0 && <small>Out of stock</small>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {specs.length > 0 && <dl className="pdp-spec-tiles">{specs.map(spec => <div key={spec.label}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}</dl>}
              {hasCraftDetails && <details className="pdp-craft" key={product.id}>
                <summary><FileText aria-hidden="true" /><span>Full Specifications &amp; Craft Details</span><ChevronDown aria-hidden="true" /></summary>
                <div className="pdp-craft-content">
                  {hasValue(product.description) && <p>{product.description}</p>}
                  <dl>{[
                    ...specs,
                    { label: 'Height', value: hasValue(height) ? height : '' },
                    { label: 'Opening diameter', value: hasValue(openingDiameter) ? openingDiameter : '' },
                    { label: 'Technique', value: hasValue(product.technique) ? product.technique : '' },
                  ].filter(spec => spec.value).map(spec => <div key={spec.label}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}</dl>
                </div>
              </details>}

              <div className="pdp-purchase">
                {availableStock === 0 && <p className="pdp-stock pdp-stock--empty" role="status">This item is currently out of stock.</p>}
                {availableStock > 0 && availableStock <= 3 && <p className="pdp-stock" role="status">Only {availableStock} left in stock.</p>}
                {cartAtStockLimit && <p className="pdp-stock" role="status">Your cart already contains all {availableStock} available.</p>}
                <div className="pdp-actions">
                  <button type="button" className="pdp-buy" onClick={handleBuy} disabled={buyDisabled}>Buy Now</button>
                  <button type="button" className="pdp-add" onClick={handleAddToCart} disabled={addDisabled}><ShoppingCart aria-hidden="true" />{cartAtStockLimit ? 'Stock Limit Reached' : 'Add to Cart'}</button>
                  <button type="button" className="pdp-ask" onClick={handleAskClick}><MessageCircle aria-hidden="true" />Ask a Question</button>
                </div>
              </div>
            </div>
          </div>

          <section className="pdp-reviews" id="product-reviews" aria-labelledby="product-reviews-title">
            <h2 id="product-reviews-title" className="pdp-section-title">Product Reviews</h2>
            {allReviews.length === 0 ? <p className="pdp-empty-reviews">No reviews yet. Reviews from completed purchases will appear here.</p> : <div className="pdp-review-list">
              {allReviews.map(review => <article key={review.id} className="pdp-review">
                <div className="pdp-review-heading">
                  <div className="pdp-review-person"><span className="pdp-review-avatar" aria-hidden="true">{(review.userName || 'Buyer').charAt(0).toUpperCase()}</span><div><h3>{review.userName || 'Buyer'}</h3><span className="pdp-stars" role="img" aria-label={`${review.rating} out of 5 stars`}>{renderStars(review.rating, 14)}</span></div></div>
                  <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
                </div>
                {review.title && <h4>{review.title}</h4>}
                <p>{review.body}</p>
                <div className="pdp-service-ratings">
                  {(review.sellerServiceRating || 0) > 0 && <span>Seller Service: <span className="pdp-stars" role="img" aria-label={`${review.sellerServiceRating} out of 5 stars`}>{renderStars(review.sellerServiceRating || 0, 12)}</span></span>}
                  {(review.deliveryServiceRating || 0) > 0 && <span>Delivery Service: <span className="pdp-stars" role="img" aria-label={`${review.deliveryServiceRating} out of 5 stars`}>{renderStars(review.deliveryServiceRating || 0, 12)}</span></span>}
                </div>
                {review.images?.length > 0 && <div className="pdp-review-images">{review.images.map((image, index) => <a key={index} href={image} target="_blank" rel="noopener noreferrer"><img src={image} alt={`Review photo ${index + 1}`} loading="lazy" /></a>)}</div>}
              </article>)}
            </div>}
          </section>

          <div className="pdp-recommendations" key={product.id}>
            {product.shopId && <RecommendationsSection excludeProductIds={[product.id]} preferredShopIds={[product.shopId]} sameShopOnly title="More from the Same Shop" subtitle={`Handcrafted pieces by ${product.shopName || 'this shop'}`} viewAllHref={`/shop/${product.shopId}`} />}
            <RecommendationsSection excludeProductIds={[product.id]} preferredCategories={product.category ? [product.category] : []} preferredShopIds={product.shopId ? [product.shopId] : []} />
          </div>
        </div>
      </div>

        {/* Ask a Question Modal */}
      <div className={`modal-overlay ${askModal ? 'active' : ''}`}>
        <div className="modal-box">
          <button type="button" aria-label="Close question dialog" className="modal-close" onClick={() => { setAskModal(false); setAskSuccess(false); setAskMessage(''); }}>×</button>
          {!askSuccess ? (
            <>
              <h3 className="modal-title">Ask the Potter</h3>
              <p style={{ fontSize: '0.9rem', textAlign: 'center', marginTop: -15, marginBottom: 20, color: 'var(--text-muted)' }}>
                Send a direct message to <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{product.shopName}</span> regarding this craft.
              </p>
              <form onSubmit={handleAskSubmit}>
                <div className="form-group">
                  <label htmlFor="product-question">Your Message</label>
                  <textarea id="product-question" rows={4} placeholder="Type your question here..." required
                    value={askMessage} onChange={e => setAskMessage(e.target.value)} />
                </div>
                <button type="submit" className="btn-form-submit" disabled={askSending}>
                  {askSending ? 'SENDING...' : 'SEND MESSAGE'}
                </button>
              </form>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div className="success-icon-animation">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#C1570D" strokeWidth="3">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.85rem', color: 'var(--primary-color)', marginTop: 15 }}>Message Sent!</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>Your message has been sent. You can view replies in your navbar inbox.</p>
              <button className="btn-view-all" style={{ margin: '20px auto 0', fontSize: '0.9rem', padding: '8px 25px', display: 'inline-flex', alignItems: 'center', gap: 12, backgroundColor: 'var(--primary-color)', color: 'white', fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer' }}
                onClick={() => { setAskModal(false); setAskSuccess(false); setAskMessage(''); }}>Done</button>
            </div>
          )}
        </div>
      </div>

      {stickyVisible && (
        <section className="pdp-desktop-dock" aria-label="Sticky purchase controls">
          <div className="pdp-dock-container">
            <div className="pdp-dock-identity">
              {product.image && <img src={product.image} alt="" />}
              <div className="pdp-dock-copy">
                <h2>{product.name}</h2>
                <div className="pdp-dock-meta">{sizeLabel && <span title={sizeLabel}>{sizeLabel}</span>}<small>{product.shopName}</small></div>
              </div>
            </div>
            <div className="pdp-dock-purchase">
              <div className="pdp-dock-price"><span>{availableStock === 0 ? 'Out of stock' : 'Price'}</span><strong>{fmt(displayPrice)}</strong></div>
              <div className="pdp-dock-actions">
                <button type="button" className="pdp-dock-ask" onClick={handleAskClick} aria-label="Ask a Question"><MessageCircle aria-hidden="true" />Ask</button>
                <button type="button" className="pdp-dock-add" onClick={handleAddToCart} disabled={addDisabled}><ShoppingCart aria-hidden="true" />{cartAtStockLimit ? 'Stock Limit Reached' : 'Add to Cart'}</button>
                <button type="button" className="pdp-dock-buy" onClick={handleBuy} disabled={buyDisabled}>Buy Now</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {isMobile && (
        <div className="mobile-action-bar" style={{
          position: 'fixed', bottom: 'var(--mobile-nav-reserved-height)', left: 0, right: 0,
          background: '#fff', borderTop: '1px solid #E8E0D8', padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: '10px', zIndex: 40,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.05)'
        }}>
          {(() => {
            const stock = availableStock;
            const isOutOfStock = stock === 0;
            const needsVariation = variations.length > 0 && !selectedVariation;
            const buyDisabled = isOutOfStock || needsVariation;
            const addDisabled = buyDisabled || cartAtStockLimit;
            return (
              <>
                <button type="button" aria-label="Ask a Question" onClick={handleAskClick} className="btn-chat" style={{ width: 44, height: 44, flexShrink: 0, borderRadius: '10px', border: '1.5px solid var(--primary-color)', background: '#fff', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: 20, height: 20 }}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                </button>
                <button onClick={handleAddToCart} disabled={addDisabled} className="btn-cart" style={{ flex: 1, padding: '12px 0', borderRadius: '10px', border: '1.5px solid var(--primary-color)', background: '#fff', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.9rem', opacity: addDisabled ? 0.5 : 1 }}>{cartAtStockLimit ? 'Stock Limit' : 'Add to Cart'}</button>
                <button onClick={handleBuy} disabled={buyDisabled} className="btn-buy" style={{ flex: 1, padding: '12px 0', borderRadius: '10px', border: 'none', background: 'var(--accent-color)', color: '#fff', fontWeight: 600, fontSize: '0.9rem', opacity: buyDisabled ? 0.5 : 1 }}>Buy Now</button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
