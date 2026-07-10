import { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { addToCart } from '../data/store';
import { supabase } from '../lib/supabase';
import type { Product, ProductVariation, ProductReview } from '../types';
import type { ReactElement } from 'react';
import { loadFavorites, saveFavorites, mapSupabaseProduct, fmt, fmtRating, formatVariation } from '../lib/utils';
import RecommendationsSection from '../components/RecommendationsSection';

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

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);
  const [allReviews, setAllReviews] = useState<ProductReview[]>([]);
  const [shopImage, setShopImage] = useState('');
  const [shopProductCount, setShopProductCount] = useState(0);
  const [shopRating, setShopRating] = useState({ avg: 0, count: 0 });
  const [soldCount, setSoldCount] = useState(0);
  const [askModal, setAskModal] = useState(false);
  const [askSuccess, setAskSuccess] = useState(false);
  const [askMessage, setAskMessage] = useState('');
  const [askSending, setAskSending] = useState(false);
  const productRating = useMemo(() => {
    if (allReviews.length === 0) return { avg: 0, count: 0 };
    const total = allReviews.reduce((s, r) => s + r.rating, 0);
    return { avg: total / allReviews.length, count: allReviews.length };
  }, [allReviews]);

  const [favorites] = useState<string[]>(() => loadFavorites());

  useEffect(() => { saveFavorites(favorites); }, [favorites]);

  const displayPrice = selectedVariation?.price ?? product?.price ?? 0;

  async function handleAskSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!askMessage.trim() || !product) return;
    setAskSending(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { alert('Please sign in to send a message.'); setAskSending(false); return; }

    const uid = session.user.id;
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
      if (convErr || !newConv) { alert('Failed to start conversation.'); setAskSending(false); return; }
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
    if (msgErr) { alert('Failed to send message.'); return; }
    setAskSuccess(true);
  }

  useEffect(() => {
    async function fetchProduct() {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (data) {
        const mapped: Product = mapSupabaseProduct(data);
        setProduct(mapped);

        if (mapped.shopId) {
          const { data: shopData } = await supabase.from('shops').select('image').eq('id', mapped.shopId).single();
          if (shopData?.image) setShopImage(shopData.image);

          const { count } = await supabase.from('products').select('*', { count: 'exact', head: true })
            .eq('shop_id', mapped.shopId).eq('status', 'active');
          setShopProductCount(count || 0);

          const { data: shopProducts } = await supabase
            .from('products')
            .select('id')
            .eq('shop_id', mapped.shopId)
            .eq('status', 'active');
          if (shopProducts && shopProducts.length > 0) {
            const productIds = shopProducts.map(p => p.id);
            const { data: shopReviews } = await supabase
              .from('product_reviews')
              .select('rating')
              .in('product_id', productIds);
            if (shopReviews && shopReviews.length > 0) {
              const avg = shopReviews.reduce((s: number, r: any) => s + r.rating, 0) / shopReviews.length;
              setShopRating({ avg, count: shopReviews.length });
            }
          }
        }

        supabase.from('products').update({ views: ((data as any).views || 0) + 1 }).eq('id', id).then();

        const { data: orderData } = await supabase
          .from('orders')
          .select('items')
          .or('status.eq.paid,status.eq.completed');
        if (orderData) {
          let total = 0;
          for (const order of orderData) {
            const items = order.items || [];
            for (const item of items) {
              if ((item.product_id || item.productId) === id) total += item.qty || 0;
            }
          }
          setSoldCount(total);
        }

        const { data: varData, error: varErr } = await supabase
          .from('product_variations')
          .select('*')
          .eq('product_id', id)
          .order('sort_order');
        if (varErr) console.error('Variations fetch error:', varErr);
        if (varData) {
          const mappedVars = varData.map((v: any) => ({
            id: v.id, productId: v.product_id,
            dimensions: v.dimensions, height: v.height, openingDiameter: v.opening_diameter,
            price: v.price, stock: v.stock, sortOrder: v.sort_order,
          }));
          setVariations(mappedVars);
          if (mappedVars.length > 0) setSelectedVariation(mappedVars[0]);
        }

        const { data: revData } = await supabase
          .from('product_reviews')
          .select('*')
          .eq('product_id', id)
          .order('created_at', { ascending: false });
        if (revData) {
          const mappedRevs = revData.map((r: any) => ({
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
    }
    fetchProduct();
  }, [id]);

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

  const handleAddToCart = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    addToCart({
      productId: product.id,
      productName: product.name,
      price: displayPrice,
      image: product.image,
      shopId: product.shopId,
      shopName: product.shopName,
      qty: 1,
      variationId: selectedVariation?.id || '',
      variation: selectedVariation ? formatVariation(selectedVariation) : '',
    });
  };

  const handleBuy = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    addToCart({
      productId: product.id,
      productName: product.name,
      price: displayPrice,
      image: product.image,
      shopId: product.shopId,
      shopName: product.shopName,
      qty: 1,
      variationId: selectedVariation?.id || '',
      variation: selectedVariation ? formatVariation(selectedVariation) : '',
    });
    navigate('/checkout');
  };

  const handleChatNow = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    navigate('/chat');
  };

  const handleAskClick = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    setAskModal(true);
  };


  return (
    <div>
      <main className="product-viewer-section" style={{ marginTop: 'var(--nav-height)' }}>
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="breadcrumbs viewer-breadcrumbs">
            <Link to="/">Home</Link>
            <span className="separator" style={{ color: 'var(--text-light)' }}>/</span>
            <Link to="/gallery">Gallery</Link>
            <span className="separator" style={{ color: 'var(--text-light)' }}>/</span>
            <Link to="/gallery">{product.category}</Link>
            <span className="separator" style={{ color: 'var(--text-light)' }}>/</span>
            <span className="text-primary font-medium">{product.name}</span>
          </div>

          <div className="product-viewer-layout">
            <div className="product-image-container">
              <div className="product-viewer-img-frame">
                {product.model3d ? (
                  <div className="w-full h-full">
                    <Suspense fallback={
                      <div className="w-full h-full flex items-center justify-center bg-cream-secondary">
                        <div className="text-brown-medium text-center">
                          <div className="animate-spin w-8 h-8 border-3 border-primary border-t-transparent rounded-full mx-auto mb-3"></div>
                          <p className="text-sm">Loading 3D model...</p>
                        </div>
                      </div>
                    }>
                      <ModelViewer url={product.model3d} />
                    </Suspense>
                  </div>
                ) : (
                  <img src={product.image} alt={product.name} id="viewer-main-img" />
                )}
              </div>
            </div>

            <div className="product-info-panel">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '16px' }}>
                <h1 className="product-viewer-title" style={{ margin: 0 }}>{product.name}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  {productRating.count > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ display: 'flex', gap: '2px' }}>{renderStars(productRating.avg, 16)}</div>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>({fmtRating(productRating.avg)})</span>
                    </div>
                  )}
                  {soldCount > 0 && (
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>{soldCount} sold</span>
                  )}
                </div>
              </div>

              {variations.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>Select Variation</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {variations.map(v => (
                      <button key={v.id} onClick={() => setSelectedVariation(v)}
                        style={{
                          padding: '8px 16px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                          border: selectedVariation?.id === v.id ? '2px solid var(--primary-color)' : '1.5px solid #E8E0D8',
                          background: selectedVariation?.id === v.id ? 'var(--primary-color)' : '#fff',
                          color: selectedVariation?.id === v.id ? '#fff' : 'var(--text-dark)',
                          transition: 'all 0.15s ease',
                        }}>
                        {v.dimensions || `${v.height} × ${v.openingDiameter}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="product-viewer-attributes">
                {selectedVariation && selectedVariation.height && selectedVariation.height !== 'N/A' && (
                  <div className="attr-item"><span className="attr-label">Height:</span> <span className="attr-val">{selectedVariation.height}</span></div>
                )}
                {selectedVariation && selectedVariation.openingDiameter && selectedVariation.openingDiameter !== 'N/A' && (
                  <div className="attr-item"><span className="attr-label">Opening Diameter:</span> <span className="attr-val">{selectedVariation.openingDiameter}</span></div>
                )}
                {selectedVariation && selectedVariation.dimensions && selectedVariation.dimensions !== 'N/A' && (
                  <div className="attr-item"><span className="attr-label">Dimensions:</span> <span className="attr-val">{selectedVariation.dimensions}</span></div>
                )}
                <div className="attr-item"><span className="attr-label">Material:</span> <span className="attr-val">{product.materials || 'Terracotta Clay'}</span></div>
                <div className="attr-item"><span className="attr-label">Technique:</span> <span className="attr-val">{product.technique || 'Handcrafted & Kiln-Fired'}</span></div>
              </div>

              <div className="product-viewer-price" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-color)', marginBottom: '16px' }}>
                {variations.length > 0 ? (
                  selectedVariation ? fmt(displayPrice) : 'Select a variation'
                ) : (
                  fmt(displayPrice)
                )}
              </div>

              <div className="product-viewer-actions">
                <button className="btn-product-buy" onClick={handleBuy}>Buy Now</button>
                <button className="btn-product-ask" onClick={handleAskClick}>Ask a Question</button>
                <button className="btn-product-design" onClick={handleAddToCart}>Add to Cart</button>
              </div>
            </div>
          </div>

          {/* Full-width Shop Section */}
          <div style={{
            marginTop: '40px', marginBottom: '40px', padding: '28px 32px',
            background: '#fff', borderRadius: '16px', border: '1px solid #eee',
            display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap',
          }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden',
              flexShrink: 0, border: '3px solid var(--primary-color)',
            }}>
              {shopImage ? (
                <img src={shopImage} alt={product.shopName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.4rem' }}>
                  {(product.shopName || 'S').charAt(0)}
                </div>
              )}
            </div>

            <div style={{ flex: '1 1 300px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>{product.shopName}</h3>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button onClick={handleChatNow}
                  style={{
                    padding: '8px 20px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                    border: '1.5px solid var(--primary-color)', background: '#fff', color: 'var(--primary-color)',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                  Chat Now
                </button>
                <Link to={`/shop/${product.shopId}`} style={{
                  padding: '8px 20px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                  border: '1.5px solid #E8E0D8', background: '#fff', color: 'var(--text-dark)',
                  display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none',
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  View Shop
                </Link>
              </div>
            </div>

            <div style={{
              display: 'flex', gap: '40px', alignItems: 'center',
              borderLeft: '1px solid #E8E0D8', paddingLeft: '32px',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginBottom: '4px' }}>Products</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-dark)' }}>{shopProductCount}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginBottom: '4px' }}>Ratings</div>
                <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>{renderStars(shopRating.avg, 18)}</div>
              </div>
            </div>
          </div>

          {/* Product Reviews Section */}
          <div style={{ marginTop: '48px', paddingBottom: '40px' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '24px' }}>Product Reviews</h2>

            {allReviews.length === 0 ? (
              <p style={{ color: 'var(--text-light)', padding: '30px 0', textAlign: 'center' }}>No reviews yet. Be the first to review this product!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {allReviews.map(rev => (
                  <div key={rev.id} style={{ padding: '18px', background: '#fff', borderRadius: '12px', border: '1px solid #eee' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-color)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                          {rev.userName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-dark)' }}>{rev.userName}</div>
                          <div style={{ display: 'flex', gap: '2px' }}>{renderStars(rev.rating, 12)}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>
                        {new Date(rev.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                    {rev.title && <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{rev.title}</div>}
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-light)', lineHeight: 1.6, margin: 0 }}>{rev.body}</p>
                    {((rev.sellerServiceRating || 0) > 0 || (rev.deliveryServiceRating || 0) > 0) && (
                      <div style={{ display: 'flex', gap: '20px', marginTop: '10px', flexWrap: 'wrap' }}>
                        {(rev.sellerServiceRating || 0) > 0 && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>
                            Seller Service: <span style={{ display: 'inline-flex', gap: '1px', verticalAlign: 'middle' }}>{renderStars(rev.sellerServiceRating || 0, 10)}</span>
                          </div>
                        )}
                        {(rev.deliveryServiceRating || 0) > 0 && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>
                            Delivery Service: <span style={{ display: 'inline-flex', gap: '1px', verticalAlign: 'middle' }}>{renderStars(rev.deliveryServiceRating || 0, 10)}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {rev.images && rev.images.length > 0 && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                        {rev.images.map((img, i) => (
                          <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                            <img src={img} alt="Review photo" style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E8E0D8', cursor: 'pointer' }} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {product && (
            <>
              <hr className="viewer-section-divider" />
              <RecommendationsSection
                excludeProductIds={[product.id]}
                preferredCategories={product.category ? [product.category] : []}
                preferredShopIds={product.shopId ? [product.shopId] : []}
              />
            </>
          )}
          </div>
        </main>

        {/* Ask a Question Modal */}
      <div className={`modal-overlay ${askModal ? 'active' : ''}`}>
        <div className="modal-box">
          <button className="modal-close" onClick={() => { setAskModal(false); setAskSuccess(false); setAskMessage(''); }}>×</button>
          {!askSuccess ? (
            <>
              <h3 className="modal-title">Ask the Potter</h3>
              <p style={{ fontSize: '0.9rem', textAlign: 'center', marginTop: -15, marginBottom: 20, color: 'var(--text-muted)' }}>
                Send a direct message to <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{product.shopName}</span> regarding this craft.
              </p>
              <form onSubmit={handleAskSubmit}>
                <div className="form-group">
                  <label>Your Message</label>
                  <textarea rows={4} placeholder="Type your question here..." required
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
    </div>
  );
}
