import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import AccountPanel from '../components/account/AccountPanel';
import PurchasePanel from '../components/purchases/PurchasePanel';
import type { PurchaseSummary } from '../types/purchases';
import NotificationCenter from '../components/notifications/NotificationCenter';
import { useNotifications } from '../hooks/useNotifications';

interface OrderItem {
  productId: string;
  productName: string;
  image: string;
  qty: number;
  price: number;
  shop_name: string;
  dimensions?: string;
  variation?: string;
}

interface DashboardOrder {
  id: string;
  items: OrderItem[];
  total: number;
  status: 'to-pay' | 'to-ship' | 'to-receive' | 'completed' | 'return-refund' | 'cancelled';
  shop: string;
  date: string;
  checkoutSessionId?: string;
  deliveryStatus: string;
}

const SIDEBAR_ITEMS = [
  {
    key: 'account',
    label: 'My Account',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 16, height: 16 }}>
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    key: 'purchases',
    label: 'My Purchase',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 16, height: 16 }}>
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a4 4 0 00-8 0v2" />
      </svg>
    ),
  },
  {
    key: 'notifications',
    label: 'Notifications',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 16, height: 16 }}>
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
];

export default function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activePanel, setActivePanel] = useState<string>(() => {
    const tab = searchParams.get('tab');
    return tab === 'purchases' || tab === 'notifications' || tab === 'account' ? tab : 'account';
  });
  const [rateOrder, setRateOrder] = useState<DashboardOrder | null>(null);
  const [rateItemIndex, setRateItemIndex] = useState(0);
  const [rateForm, setRateForm] = useState({ rating: 0, body: '', showName: true, sellerService: 0 });
  const [rateImages, setRateImages] = useState<File[]>([]);
  const [rateImagePreviews, setRateImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [submittingRate, setSubmittingRate] = useState(false);
  const [rateSubmitted, setRateSubmitted] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [deleteReviewId, setDeleteReviewId] = useState<string | null>(null);
  const [userReviews, setUserReviews] = useState<Record<string, any>>({});
  const rateFileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const buyerNotifications = useNotifications(user?.id, 'buyer');

  useEffect(() => {
    loadUserReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'purchases') setActivePanel('purchases');
    else if (tab === 'notifications') setActivePanel('notifications');
    else if (tab === 'account') setActivePanel('account');
  }, [searchParams]);

  useEffect(() => {
    if (!searchParams.get('order')) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activePanel, searchParams]);

  async function loadUserReviews() {
    try {
      if (!user) return;
      const { data } = await supabase
        .from('product_reviews')
        .select('*')
        .eq('user_id', user.id);
      if (data) {
        const map: Record<string, any> = {};
        data.forEach((r: any) => { map[r.product_id] = r; });
        setUserReviews(map);
      }
    } catch (e) {
      console.error('Load reviews error:', e);
    }
  }

  async function handleSubmitRate() {
    if (!rateOrder || rateForm.rating === 0 || !rateForm.body.trim()) return;
    const item = rateOrder.items[rateItemIndex];
    if (!item) return;

    setSubmittingRate(true);
    try {
      if (!user) { setSubmittingRate(false); return; }

      let imageUrls: string[] = [];
      if (rateImages.length > 0) {
        for (const file of rateImages) {
          const ext = file.name.split('.').pop();
          const path = `reviews/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { data } = await supabase.storage.from('products').upload(path, file, { cacheControl: '3600', upsert: false });
          if (data) {
            const { data: urlData } = supabase.storage.from('products').getPublicUrl(path);
            if (urlData?.publicUrl) imageUrls.push(urlData.publicUrl);
          }
        }
      }

      const finalImages = editingReviewId
        ? [...existingImages, ...imageUrls]
        : imageUrls;

      const reviewData = {
        user_name: rateForm.showName ? (user.user_metadata?.name || user.email || 'Anonymous') : 'Anonymous',
        rating: rateForm.rating,
        body: rateForm.body,
        images: finalImages.length > 0 ? finalImages : undefined,
        seller_service_rating: rateForm.sellerService || null,
        show_name: rateForm.showName,
      };

      let error;
      if (editingReviewId) {
        // Edit existing review
        const updatePayload: any = { ...reviewData };
        if (finalImages.length === 0) updatePayload.images = [];
        const res = await supabase.from('product_reviews').update(updatePayload).eq('id', editingReviewId);
        error = res.error;
      } else {
        // Create new review
        const res = await supabase.from('product_reviews').insert({
          product_id: item.productId,
          user_id: user.id,
          ...reviewData,
        });
        error = res.error;
      }

      if (error) {
        if (error.code === '23505') {
          toast.error('You have already reviewed this product.');
        } else {
          toast.error('Failed to submit review: ' + error.message);
        }
      } else {
        await loadUserReviews();
        setRateSubmitted(true);
      }
    } catch (e) {
      console.error('Rate submit error:', e);
    }
    setSubmittingRate(false);
  }

  function closeRatePopup() {
    setRateOrder(null);
    setEditingReviewId(null);
    setRateForm({ rating: 0, body: '', showName: true, sellerService: 0 });
    setRateImages([]);
    setRateImagePreviews([]);
    setExistingImages([]);
    setRateSubmitted(false);
  }

  function handleEditReview(order: DashboardOrder, itemIndex: number) {
    const item = order.items[itemIndex];
    if (!item) return;
    const review = userReviews[item.productId];
    if (!review) return;
    setRateOrder(order);
    setRateItemIndex(itemIndex);
    setEditingReviewId(review.id);
    setRateForm({
      rating: review.rating || 0,
      body: review.body || '',
      showName: review.show_name !== false,
      sellerService: review.seller_service_rating || 0,
    });
    const imgs = review.images || [];
    setExistingImages(imgs);
    setRateImagePreviews([...imgs]);
    setRateImages([]);
    setRateSubmitted(false);
  }

  async function handleDeleteReview(productId: string) {
    const review = userReviews[productId];
    if (!review) return;
    const { error } = await supabase.from('product_reviews').delete().eq('id', review.id);
    if (error) { toast.error('Failed to delete review: ' + error.message); return; }
    setUserReviews(prev => { const next = { ...prev }; delete next[productId]; return next; });
    setDeleteReviewId(null);
  }

  const unreadNotificationCount = buyerNotifications.unreadCount;
  const accountSummaryName = String(user?.user_metadata?.name || 'Customer Name');
  const accountSummaryImage = String(user?.user_metadata?.avatar_url || '');
  const accountSummaryInitial = accountSummaryName.charAt(0).toUpperCase() || 'U';

  return (
    <div className="dashboard-page" style={{ minHeight: '100vh' }}>
      <div className="dashboard-wrapper" style={{ paddingTop: '12px', paddingBottom: '60px' }}>
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="dashboard-layout" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '240px minmax(0, 1fr)', gap: isMobile ? '16px' : '30px', alignItems: 'flex-start' }}>

            {/* Sidebar (hidden on mobile) */}
            {!isMobile && (
            <aside className="dashboard-sidebar" style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid #E8E0D8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: '28px 20px', position: 'sticky', top: 'calc(var(--nav-height) + 12px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #E8E0D8' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid var(--primary-color)' }}>
                  {accountSummaryImage ? (
                    <img src={accountSummaryImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--font-sans)' }}>
                      {accountSummaryInitial}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#333', fontFamily: 'var(--font-sans)' }}>{accountSummaryName}</span>
                  <span style={{ fontSize: '0.75rem', color: '#999', fontFamily: 'var(--font-sans)' }}>Edit Profile</span>
                </div>
              </div>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {SIDEBAR_ITEMS.map(item => (
                  <div key={item.key}>
                    <button onClick={() => setSearchParams({ tab: item.key })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 8px', border: 'none', borderRadius: 'var(--radius-sm)', width: '100%', textAlign: 'left',
                        background: 'transparent',
                        color: activePanel === item.key ? 'var(--accent-color)' : '#666',
                        fontSize: '0.82rem', fontWeight: activePanel === item.key ? 600 : 500,
                        fontFamily: 'var(--font-sans)', cursor: 'pointer', transition: 'var(--transition-fast)',
                      }}>
                      <span style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                      {item.label}
                      {item.key === 'notifications' && unreadNotificationCount > 0 && (
                        <span style={{
                          marginLeft: 'auto',
                          minWidth: '18px',
                          height: '18px',
                          padding: '0 6px',
                          borderRadius: '999px',
                          background: 'var(--accent-color)',
                          color: '#fff',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: 'var(--font-sans)',
                        }}>
                          {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </nav>
            </aside>
            )}

            {/* Main Content */}
            {activePanel === 'account' ? (
              <AccountPanel />
            ) : activePanel === 'notifications' ? (
              <NotificationCenter context="buyer" data={buyerNotifications} />
            ) : (
              <PurchasePanel
                reviewedProductIds={new Set(Object.keys(userReviews))}
                onRate={(purchase: PurchaseSummary, itemIndex, editing) => {
                  const legacy: DashboardOrder = {
                    id: purchase.id,
                    items: purchase.items.map(item => ({ productId: item.productId, productName: item.productName, image: item.image, qty: item.quantity, price: item.price, shop_name: item.shopName, dimensions: item.dimensions, variation: item.variation })),
                    total: purchase.total,
                    status: purchase.status,
                    shop: purchase.shops.length > 1 ? 'Multiple shops' : purchase.shops[0]?.name || 'LikhArtisan Shop',
                    date: purchase.createdAt,
                    checkoutSessionId: purchase.checkoutSessionId,
                    deliveryStatus: purchase.deliveryStatus,
                  };
                  if (editing) handleEditReview(legacy, itemIndex);
                  else { setRateOrder(legacy); setRateItemIndex(itemIndex); setRateSubmitted(false); }
                }}
              />
            )}
          </div>
        </div>
      </div>


      {/* Delete Review Confirmation */}
      {deleteReviewId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={() => setDeleteReviewId(null)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '32px 36px', maxWidth: '440px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '12px' }}>Delete Review</h3>
            <p style={{ fontSize: '0.92rem', color: '#666', lineHeight: 1.6, marginBottom: '24px' }}>Are you sure you want to delete your review? This action cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setDeleteReviewId(null)}
                style={{ padding: '10px 24px', border: '1.5px solid #ccc', borderRadius: '8px', background: '#fff', color: '#666', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                CANCEL
              </button>
              <button onClick={() => handleDeleteReview(deleteReviewId)}
                style={{ padding: '10px 24px', border: 'none', borderRadius: '8px', background: '#D32F2F', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rate Product Popup */}
      {rateOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={closeRatePopup}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '32px 36px', maxWidth: '520px', width: '94%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>
            {rateSubmitted ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#E8F5E9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="3" style={{ width: '32px', height: '32px' }}>
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2E7D32', margin: '0 0 8px' }}>Review Submitted!</h3>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '20px' }}>Thank you for your feedback.</p>
                <button onClick={closeRatePopup} style={{ padding: '10px 32px', border: 'none', borderRadius: '8px', background: 'var(--accent-color)', color: '#fff', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>Done</button>
              </div>
            ) : (
              <>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-color)', marginBottom: '20px' }}>{editingReviewId ? 'Edit Review' : 'Rate Product'}</h2>

                {/* Product info */}
                {rateOrder.items[rateItemIndex] && (
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '20px' }}>
                    <img src={rateOrder.items[rateItemIndex].image} alt="" style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', border: '1px solid #E8E0D8' }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-dark)' }}>{rateOrder.items[rateItemIndex].productName}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>{rateOrder.shop}</div>
                    </div>
                  </div>
                )}

                {/* Product Quality Rating */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#333', marginBottom: '6px' }}>Product Quality</div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} type="button" onClick={() => setRateForm(f => ({ ...f, rating: star }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill={star <= rateForm.rating ? '#F59E0B' : 'none'} stroke={star <= rateForm.rating ? '#F59E0B' : '#D1D5DB'} strokeWidth="1.5">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Review text */}
                <textarea rows={4} value={rateForm.body} onChange={e => setRateForm(f => ({ ...f, body: e.target.value }))} placeholder="Tell others what you think about this product."
                  style={{ width: '100%', padding: '12px', border: '1.5px solid #E8E0D8', borderRadius: '10px', fontSize: '0.88rem', resize: 'vertical', fontFamily: 'var(--font-sans)', boxSizing: 'border-box', outline: 'none' }} />

                {/* Add Photo */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px', marginBottom: '12px' }}>
                  <input ref={rateFileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      if (rateImages.length + files.length > 5) { toast.error('Maximum 5 images allowed.'); return; }
                      setRateImages(prev => [...prev, ...files]);
                      setRateImagePreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
                    }} />
                  <button type="button" onClick={() => rateFileInputRef.current?.click()}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', border: '1.5px solid #E8E0D8', borderRadius: '8px', background: '#fff', color: '#666', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#C1570D" strokeWidth="2" style={{ width: '16px', height: '16px' }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    Add Photo
                  </button>
                </div>
                {rateImagePreviews.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {rateImagePreviews.map((src, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={src} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E8E0D8' }} />
                        <button onClick={() => {
                          if (i < existingImages.length) {
                            setExistingImages(prev => prev.filter((_, j) => j !== i));
                          } else {
                            const newIdx = i - existingImages.length;
                            setRateImages(prev => prev.filter((_, j) => j !== newIdx));
                          }
                          setRateImagePreviews(prev => prev.filter((_, j) => j !== i));
                        }}
                          style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: '#D32F2F', color: '#fff', border: 'none', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Show name checkbox */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#666', marginBottom: '20px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={rateForm.showName} onChange={e => setRateForm(f => ({ ...f, showName: e.target.checked }))} style={{ accentColor: 'var(--accent-color)' }} />
                  Show your name on your review
                </label>

                {/* Rate Seller's Service */}
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-color)', marginBottom: '14px' }}>Rate Seller's Service</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#333', minWidth: '110px' }}>Seller Service</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <button key={star} type="button" onClick={() => setRateForm(f => ({ ...f, sellerService: star }))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill={star <= rateForm.sellerService ? '#F59E0B' : 'none'} stroke={star <= rateForm.sellerService ? '#F59E0B' : '#D1D5DB'} strokeWidth="1.5">
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button onClick={closeRatePopup}
                    style={{ padding: '10px 24px', border: '1.5px solid #ccc', borderRadius: '8px', background: '#fff', color: '#666', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                    CANCEL
                  </button>
                  <button onClick={handleSubmitRate} disabled={submittingRate || rateForm.rating === 0 || !rateForm.body.trim()}
                    style={{ padding: '10px 28px', border: 'none', borderRadius: '8px', background: 'var(--accent-color)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: submittingRate || rateForm.rating === 0 || !rateForm.body.trim() ? 0.5 : 1 }}>
                    {submittingRate ? 'Submitting...' : 'SUBMIT'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
