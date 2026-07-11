import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { displayVariation } from '../lib/utils';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { API_BASE } from '../lib/api';

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

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'to-pay': { label: 'To Pay', color: '#C1570D', bg: '#FFF3E0' },
  'to-ship': { label: 'To Ship', color: '#823E0B', bg: '#FFF3E0' },
  'to-receive': { label: 'To Receive', color: '#C1570D', bg: '#FFF3E0' },
  'completed': { label: 'Completed', color: '#C1570D', bg: '#FFF3E0' },
  'return-refund': { label: 'Return Refund', color: '#C1570D', bg: '#FFF3E0' },
  'cancelled': { label: 'Cancelled', color: '#DC2626', bg: '#FEF2F2' },
};

const ORDER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'to-pay', label: 'To Pay' },
  { key: 'to-ship', label: 'To Ship' },
  { key: 'to-receive', label: 'To Receive' },
  { key: 'completed', label: 'Completed' },
  { key: 'return-refund', label: 'Return Refund' },
  { key: 'cancelled', label: 'Cancelled' },
];

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
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activePanel, setActivePanel] = useState<string>(() => {
    const tab = searchParams.get('tab');
    return tab === 'purchases' || tab === 'notifications' || tab === 'account' ? tab : 'account';
  });
  const [activeTab, setActiveTab] = useState<string>('all');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('Customer Name');
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [saved, setSaved] = useState(false);
  const [profileImage, setProfileImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmOrderId, setConfirmOrderId] = useState<string | null>(null);
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [userReviews, setUserReviews] = useState<Record<string, any>>({});
  const [notifications, setNotifications] = useState<any[]>([]);
  const rateFileInputRef = useRef<HTMLInputElement>(null);
  const orderCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { user } = useAuth();

  useEffect(() => {
    return () => { if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current); };
  }, []);
  useEffect(() => {
    loadProfile();
    loadOrders();
    loadUserReviews();
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const status = searchParams.get('status');
    const orderId = searchParams.get('order');
    if (tab === 'purchases') {
      setActivePanel('purchases');
      if (status && ORDER_TABS.some(t => t.key === status)) {
        setActiveTab(status);
      } else if (orderId) {
        // Deep-link from chat "View Order": show all orders so the order is visible.
        setActiveTab('all');
      }
      // Deep-link from chat "View Order": auto-expand the specific order.
      if (orderId) setExpandedOrderId(orderId);
    } else if (tab === 'notifications') setActivePanel('notifications');
    else if (tab === 'account') setActivePanel('account');
  }, [searchParams]);

  // Once orders have loaded and we have a deep-linked order ID, scroll to it.
  useEffect(() => {
    const orderId = searchParams.get('order');
    if (!orderId || orders.length === 0) return;
    // Give the DOM a tick to render the expanded card, then scroll to it.
    const timer = setTimeout(() => {
      const el = orderCardRefs.current[orderId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 150);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, expandedOrderId]);

  async function loadProfile() {
    if (!user) return;

    const meta = user.user_metadata || {};
    const fullName = meta.name || '';
    const userEmail = user.email || '';
    const userPhone = meta.phone || '';
    const userAddress = meta.address || '';
    const userImage = meta.avatar_url || '';

    const parts = fullName.split(' ');
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' ') || '');
    setEmail(userEmail);
    setPhone(userPhone);
    setAddress(userAddress);
    setUsername(fullName || 'Customer Name');
    setProfileImage(userImage);
  }

  async function saveProfile() {
    if (!user) return;

    const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Customer Name';

    const { error } = await supabase.auth.updateUser({
      data: { name: fullName, phone, address, avatar_url: profileImage },
    });

    if (error) { toast.error('Failed to save: ' + error.message); return; }

    setUsername(fullName);
    setSaved(true);
    setEditingAddress(false);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => setSaved(false), 2000);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }

    setUploading(true);
    try {
      if (!user) return;
      const ext = file.name.split('.').pop();
      const path = `avatars/${user.id}.${ext}`;
      const { error } = await supabase.storage.from('products').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('products').getPublicUrl(path);
      const imageUrl = urlData.publicUrl;
      setProfileImage(imageUrl);
      await supabase.auth.updateUser({ data: { avatar_url: imageUrl } });
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function loadOrders() {
    if (!user) return;

    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!data) return;

    const mapped: DashboardOrder[] = data.map((o: any) => {
      const paymentStatus = o.status || 'pending';
      const deliveryStatus = o.delivery_status || 'pending';
      let status: DashboardOrder['status'] = 'to-ship';
      if (o.status === 'completed' || deliveryStatus === 'completed') {
        status = 'completed';
      } else if (o.status === 'cancelled') {
        status = 'cancelled';
      } else if (paymentStatus === 'refunded') {
        status = 'return-refund';
      } else if (paymentStatus === 'pending') {
        status = 'to-pay';
      } else if (deliveryStatus === 'delivered') {
        status = 'to-receive';
      } else if (paymentStatus === 'paid' || paymentStatus === 'to-ship') {
        status = 'to-ship';
      } else {
        status = 'to-ship';
      }

      const items: OrderItem[] = (o.items || []).map((i: any) => ({
        productId: i.product_id || i.productId || '',
        productName: i.product_name || i.productName || '',
        image: i.image || '',
        qty: i.qty || 1,
        price: i.price || 0,
        shop_name: i.shop_name || o.user_name || 'LikhArtisan Shop',
        dimensions: i.dimensions || '',
        variation: i.variation || '',
      }));

      const shop = items[0]?.shop_name || 'LikhArtisan Shop';

      return {
        id: o.id,
        items,
        total: o.total,
        status,
        shop,
        date: o.created_at,
        checkoutSessionId: o.checkout_session_id || undefined,
        deliveryStatus: deliveryStatus,
      };
    });

    setOrders(mapped);
  }

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

  async function loadNotifications() {
    try {
      if (!user) return;
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setNotifications(data);
    } catch (e) {
      console.error('Load notifications error:', e);
    }
  }

  async function markNotificationRead(id: string) {
    try {
      await supabase.from('notifications').update({ read: true }).eq('id', id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (e) {
      console.error('Mark read error:', e);
    }
  }

  async function markAllNotificationsRead() {
    try {
      if (!user) return;
      await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.error('Mark all read error:', e);
    }
  }

  async function deleteNotification(id: string) {
    try {
      await supabase.from('notifications').delete().eq('id', id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      console.error('Delete notification error:', e);
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

  async function markAsReceived(orderId: string) {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'completed', delivery_status: 'completed' })
      .eq('id', orderId);
    if (error) { toast.error('Failed to update: ' + error.message); return; }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'completed' as const } : o));
  }

  async function handlePayNow(order: DashboardOrder) {
    if (!order.checkoutSessionId) {
      toast.error('No payment session found for this order. Please contact support.');
      return;
    }

    try {
      // Always redirect to PayMongo checkout — never auto-confirm here.
      // Confirmation only happens via the webhook / return-URL flow.
      const res = await fetch(`${API_BASE}/api/session/${order.checkoutSessionId}`);
      if (res.ok) {
        const sessionData = await res.json();
        // If the session is already paid, just refresh orders
        if (sessionData.status === 'paid') {
          toast.info('This order has already been paid. Refreshing your orders.');
          loadOrders();
          return;
        }
        if (sessionData.checkout_url) {
          localStorage.setItem('likhartisan_checkout_session_id', order.checkoutSessionId);
          window.location.href = sessionData.checkout_url;
          return;
        }
      }
      toast.info('Payment session has expired. Please place a new order.');
    } catch (err) {
      console.error('Pay Now error:', err);
      toast.error('Something went wrong. Please try again.');
    }
  }

  async function handleCancelOrder(orderId: string) {
    if (!confirm('Are you sure you want to cancel this order?')) return;
    try {
      const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o));
    } catch (err) {
      console.error('Cancel order error:', err);
      toast.error('Failed to cancel order. Please try again.');
    }
  }

  const filteredOrders =
    activeTab === 'all'
      ? orders
      : orders.filter(o => o.status === activeTab);
  const unreadNotificationCount = notifications.filter(n => !n.read).length;

  const maskedEmail = email ? email.substring(0, 3) + '****' + email.substring(email.indexOf('@')) : '';
  const maskedPhone = phone ? phone.substring(0, 2) + '****' + phone.substring(phone.length - 2) : '';

  return (
    <div className="dashboard-page" style={{ minHeight: '100vh' }}>
      <div className="dashboard-wrapper" style={{ paddingTop: '12px', paddingBottom: '60px' }}>
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="dashboard-layout" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '240px 1fr', gap: isMobile ? '16px' : '30px', alignItems: 'flex-start' }}>

            {/* Sidebar */}
            <aside className="dashboard-sidebar" style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid #E8E0D8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', padding: isMobile ? '16px' : '28px 20px', position: isMobile ? 'static' : 'sticky', top: isMobile ? 'auto' : 'calc(var(--nav-height) + 12px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #E8E0D8' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid var(--primary-color)' }}>
                  {profileImage ? (
                    <img src={profileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--font-sans)' }}>
                      {firstName?.charAt(0) || 'U'}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#333', fontFamily: 'var(--font-sans)' }}>{username}</span>
                  <span style={{ fontSize: '0.75rem', color: '#999', fontFamily: 'var(--font-sans)' }}>Edit Profile</span>
                </div>
              </div>
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {SIDEBAR_ITEMS.map(item => (
                  <div key={item.key}>
                    <button onClick={() => setActivePanel(item.key)}
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
                          fontSize: '0.68rem',
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
                    {item.key === 'purchases' && activePanel === 'purchases' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', margin: '2px 0 8px 32px' }}>
                        {ORDER_TABS.filter(tab => tab.key !== 'all').map(tab => (
                          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              textAlign: 'left',
                              padding: '5px 0',
                              color: activeTab === tab.key ? 'var(--accent-color)' : '#666',
                              fontSize: '0.78rem',
                              fontWeight: activeTab === tab.key ? 600 : 500,
                              fontFamily: 'var(--font-sans)',
                              cursor: 'pointer',
                            }}>
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </nav>
            </aside>

            {/* Main Content */}
            {activePanel === 'account' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* My Account Card */}
                <div className="dashboard-main" style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid #E8E0D8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                  <div className="account-panel" style={{ padding: '32px 28px' }}>
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--primary-color)', marginBottom: '4px', paddingBottom: '14px', borderBottom: '1px solid #E8E0D8' }}>My Account</h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginBottom: '24px', fontFamily: 'var(--font-sans)' }}>View and update your account details.</p>

                    {/* Profile Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', padding: '16px', background: '#FAF5EF', borderRadius: 'var(--radius-md)' }}>
                      <div onClick={() => fileInputRef.current?.click()} style={{ width: '64px', height: '64px', borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', border: '3px solid #E8E0D8', flexShrink: 0, position: 'relative' }}>
                        {profileImage ? (
                          <img src={profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1.3rem', fontFamily: 'var(--font-sans)' }}>
                            {firstName?.charAt(0) || 'U'}
                          </div>
                        )}
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }}
                          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                          onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>
                        </div>
                      </div>
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '2px', fontFamily: 'var(--font-sans)' }}>{username}</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', fontFamily: 'var(--font-sans)' }}>{email}</div>
                        {uploading && <div style={{ fontSize: '0.78rem', color: 'var(--accent-color)', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>Uploading...</div>}
                      </div>
                    </div>

                    {/* Account Info */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                      {[
                        { label: 'Name', value: username },
                        { label: 'Email', value: showEmail ? email : maskedEmail, toggle: () => setShowEmail(!showEmail), showLabel: showEmail ? 'Hide' : 'Show' },
                        { label: 'Phone', value: showPhone ? phone : maskedPhone, toggle: () => setShowPhone(!showPhone), showLabel: showPhone ? 'Hide' : 'Show' },
                      ].map((row, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: i < 2 ? '1px solid #E8E0D8' : 'none' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', width: '80px', flexShrink: 0, fontFamily: 'var(--font-sans)' }}>{row.label}</span>
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-dark)', flex: 1, fontFamily: 'var(--font-sans)' }}>{row.value}</span>
                          {row.toggle && (
                            <button onClick={row.toggle} style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                              {row.showLabel}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', marginTop: '16px', fontFamily: 'var(--font-sans)' }}>
                      Create New Password
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #E8E0D8', paddingTop: '20px', marginTop: '20px' }}>
                      <button onClick={saveProfile}
                        style={{
                          padding: '10px 28px', borderRadius: 'var(--radius-sm)', border: 'none',
                          background: saved ? '#2e7d32' : 'var(--primary-color)', color: '#fff',
                          fontSize: '0.88rem', fontWeight: 600, fontFamily: 'var(--font-sans)',
                          cursor: 'pointer', transition: 'var(--transition-fast)',
                        }}>
                        {saved ? 'Saved!' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* My Address Card */}
                <div className="dashboard-main" style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid #E8E0D8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                  <div style={{ padding: '32px 28px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '14px', borderBottom: '1px solid #E8E0D8' }}>
                      <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--primary-color)', margin: 0 }}>My Address</h3>
                      <button onClick={() => setEditingAddress(!editingAddress)}
                        style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        {editingAddress ? 'Cancel' : 'Edit'}
                      </button>
                    </div>
                    {editingAddress ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {[
                          { val: firstName, set: setFirstName, ph: 'First Name' },
                          { val: lastName, set: setLastName, ph: 'Last Name' },
                          { val: phone, set: setPhone, ph: 'Phone Number' },
                          { val: address, set: setAddress, ph: 'Full Address' },
                        ].map((input, i) => (
                          <input key={i} type="text" value={input.val} onChange={e => input.set(e.target.value)} placeholder={input.ph}
                            style={{ padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: 'var(--radius-sm)', fontSize: '0.88rem', fontFamily: 'var(--font-sans)', outline: 'none' }}
                            onFocus={e => (e.target.style.borderColor = 'var(--primary-color)')}
                            onBlur={e => (e.target.style.borderColor = '#E8E0D8')} />
                        ))}
                        <button onClick={saveProfile}
                          style={{ padding: '10px 28px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--primary-color)', color: '#fff', fontSize: '0.88rem', fontWeight: 600, fontFamily: 'var(--font-sans)', cursor: 'pointer', alignSelf: 'flex-end' }}>
                          Save Address
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '4px', fontFamily: 'var(--font-sans)' }}>{username}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', marginBottom: '2px', fontFamily: 'var(--font-sans)' }}>{phone || 'No phone number'}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-light)', fontFamily: 'var(--font-sans)' }}>{address || 'No address set'}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : activePanel === 'notifications' ? (
              <div className="dashboard-main" style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid #E8E0D8', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                <div style={{ padding: '32px 28px', borderBottom: '1px solid #E8E0D8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--primary-color)', marginBottom: '4px' }}>Notifications</h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', fontFamily: 'var(--font-sans)' }}>
                      {unreadNotificationCount > 0
                        ? `You have ${unreadNotificationCount} unread notification${unreadNotificationCount > 1 ? 's' : ''}.`
                        : "You're all caught up."}
                    </p>
                  </div>
                  {unreadNotificationCount > 0 && (
                    <button onClick={markAllNotificationsRead}
                      style={{ padding: '8px 16px', border: '1.5px solid var(--primary-color)', borderRadius: '8px', background: 'transparent', color: 'var(--primary-color)', fontWeight: 600, fontSize: '0.82rem', fontFamily: 'var(--font-sans)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-color)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--primary-color)'; }}>
                      Mark All as Read
                    </button>
                  )}
                </div>
                <div style={{ padding: '0' }}>
                  {notifications.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-light)' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#FAF5EF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="1.5" style={{ width: 40, height: 40, opacity: 0.5 }}>
                          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 01-3.46 0" />
                        </svg>
                      </div>
                      <h4 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', color: '#333', marginBottom: '8px' }}>No notifications yet</h4>
                      <p style={{ fontSize: '0.88rem', color: '#888', fontFamily: 'var(--font-sans)', marginBottom: '20px', maxWidth: '360px', margin: '0 auto 20px', lineHeight: 1.5 }}>
                        We'll notify you when there's an update on your orders, messages, or account.
                      </p>
                      <Link to="/gallery" style={{ display: 'inline-block', padding: '10px 28px', background: 'var(--accent-color)', color: '#fff', borderRadius: '8px', fontSize: '0.88rem', fontWeight: 600, fontFamily: 'var(--font-sans)', textDecoration: 'none', transition: 'opacity 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                        Continue Shopping
                      </Link>
                    </div>
                  ) : (
                    notifications.map(n => {
                      const timeAgo = (() => {
                        const diff = Date.now() - new Date(n.created_at).getTime();
                        const mins = Math.floor(diff / 60000);
                        if (mins < 1) return 'Just now';
                        if (mins < 60) return `${mins}m ago`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `${hrs}h ago`;
                        const days = Math.floor(hrs / 24);
                        return `${days}d ago`;
                      })();
                      const typeConfig: Record<string, { bg: string; color: string; label: string; status: string }> = {
                        preparing: { bg: '#E3F2FD', color: '#1565C0', label: 'P', status: 'to-ship' },
                        shipped: { bg: '#F3E5F5', color: '#6A1B9A', label: 'S', status: 'to-receive' },
                        delivered: { bg: '#E8F5E9', color: '#2E7D32', label: 'D', status: 'to-receive' },
                        completed: { bg: '#FFF3E0', color: '#C1570D', label: 'C', status: 'completed' },
                        refund: { bg: '#FFEBEE', color: '#D32F2F', label: 'R', status: 'return-refund' },
                        payment: { bg: '#FFF9C4', color: '#F57F17', label: 'Pay', status: 'to-pay' },
                        message: { bg: '#F5F5F5', color: '#616161', label: 'M', status: 'all' },
                      };
                      const tc = typeConfig[n.type] || { bg: '#F5F5F5', color: '#666', label: 'N', status: 'all' };
                      const handleNotificationClick = () => {
                        markNotificationRead(n.id);
                        const status = tc.status;
                        setActivePanel('purchases');
                        if (status !== 'all') setActiveTab(status);
                        setSearchParams({ tab: 'purchases' });
                      };
                      return (
                        <div key={n.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${n.title}. ${n.message}. ${timeAgo}`}
                          onClick={handleNotificationClick}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNotificationClick(); } }}
                          style={{
                            display: 'flex', gap: '14px', padding: '18px 28px',
                            borderBottom: '1px solid #E8E0D8', cursor: 'pointer',
                            background: n.read ? 'transparent' : 'rgba(253,211,133,0.08)',
                            transition: 'all 0.2s ease', outline: 'none',
                          }}
                          onFocus={e => (e.currentTarget.style.boxShadow = 'inset 0 0 0 2px var(--accent-color)')}
                          onBlur={e => (e.currentTarget.style.boxShadow = 'none')}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = n.read ? 'rgba(193,87,13,0.03)' : 'rgba(253,211,133,0.14)';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(253,211,133,0.08)';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}>
                          {n.product_image && (
                            <img src={n.product_image} alt="" style={{ width: '52px', height: '52px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0, border: '1px solid #E8E0D8' }} />
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                              <span style={{ fontSize: '0.88rem', fontWeight: n.read ? 500 : 700, color: '#333', fontFamily: 'var(--font-sans)' }}>{n.title}</span>
                              {!n.read && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#C1570D', flexShrink: 0 }} />}
                            </div>
                            <p style={{ fontSize: '0.82rem', color: '#888', fontFamily: 'var(--font-sans)', margin: 0, lineHeight: 1.4 }}>{n.message}</p>
                            <span style={{ fontSize: '0.72rem', color: '#aaa', fontFamily: 'var(--font-sans)', marginTop: '4px' }}>{timeAgo}</span>
                          </div>
                          <button aria-label="Delete notification" onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(n.id); }}
                            style={{ background: 'none', border: 'none', padding: '6px', cursor: 'pointer', color: '#aaa', alignSelf: 'center', opacity: 0.5, transition: 'opacity 0.15s', borderRadius: '4px' }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="purchase-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {/* Orders */}
                <div className="purchase-orders-list">
                  {filteredOrders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-light)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ width: 56, height: 56, margin: '0 auto 16px', opacity: 0.4 }}>
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M3 9h18M9 21V9" strokeLinecap="round" />
                      </svg>
                      <p style={{ fontFamily: 'var(--font-sans)' }}>No orders yet. <Link to="/gallery" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>Browse products</Link></p>
                    </div>
                  ) : (
                    filteredOrders.map(order => {
                      const s = STATUS_LABELS[order.status] || { label: order.status, color: '#888', bg: '#f5f5f5' };
                      const isExpanded = expandedOrderId === order.id;
                      const orderDate = new Date(order.date);
                      const shortId = order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
                      const placedDate = orderDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

                      const isToPay = order.status === 'to-pay';
                      const isToShip = order.status === 'to-ship';
                      const isToReceive = order.status === 'to-receive';
                      const isCompleted = order.status === 'completed';
                      const isReturn = order.status === 'return-refund';
                      const isCancelled = order.status === 'cancelled';

                      const placedTime = orderDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                      const placedDateTime = `${placedDate} \u2022 ${placedTime}`;
                      const ds = order.deliveryStatus;
                      const isPreparing = ds === 'preparing';
                      const isShipped = ds === 'shipped';
                      const isDelivered = ds === 'delivered';

                      const statusHeadline = isCancelled
                        ? 'Order Cancelled'
                        : isToPay
                        ? 'Awaiting Payment'
                        : isToShip
                        ? isPreparing
                          ? 'Your Order Is Being Prepared'
                          : 'Your Order Has Been Confirmed'
                        : isToReceive
                        ? 'Your Order Has Been Shipped'
                        : isCompleted
                        ? 'Order Completed'
                        : isReturn
                        ? 'Return / Refund in Progress'
                        : s.label;

                      const timelineSteps = isCancelled ? [
                        { title: 'Order Placed', desc: 'Your order has been successfully placed.', date: placedDateTime, done: true },
                        { title: 'Order Cancelled', desc: 'This order has been cancelled.', date: placedDateTime, done: true, active: true },
                      ] : [
                        { title: 'Order Placed', desc: 'Your order has been successfully placed.', date: placedDateTime, done: true },
                        { title: 'Payment Verified', desc: 'Payment has been successfully confirmed.', date: !isToPay ? placedDateTime : '', done: !isToPay },
                        { title: 'Seller Confirmed Order', desc: 'The seller has accepted your order.', date: isPreparing || isShipped || isDelivered || isCompleted ? placedDateTime : '', done: isPreparing || isShipped || isDelivered || isCompleted },
                        { title: 'Seller is Preparing Your Order', desc: 'Your pottery is currently being prepared.', date: isShipped || isDelivered || isCompleted ? placedDateTime : '', done: isShipped || isDelivered || isCompleted },
                        { title: 'Product Handed to Courier', desc: 'Your package has been handed over to the courier.', date: isToReceive || isCompleted ? placedDateTime : '', done: isToReceive || isCompleted },
                        { title: 'In Transit', desc: isToReceive ? 'Your package is currently on the way.' : 'Expected delivery in 3\u20135 days.', date: isToReceive || isCompleted ? placedDateTime : '', done: isToReceive || isCompleted, active: isToReceive },
                        { title: 'Delivered', desc: isCompleted ? 'Package has been delivered.' : 'Waiting for delivery confirmation.', date: isCompleted ? placedDateTime : '', done: isCompleted },
                        { title: 'Order Completed', desc: isCompleted ? 'Thank you for your purchase!' : 'Waiting for buyer confirmation.', date: '', done: isCompleted },
                      ];

                      return (
                        <div
                          className="order-card"
                          key={order.id}
                          ref={el => { orderCardRefs.current[order.id] = el; }}
                          onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                          style={{ cursor: 'pointer', marginBottom: '16px' }}
                        >
                          {/* ── Header ── */}
                          <div className="order-card-header" style={{ marginBottom: isExpanded ? '8px' : undefined }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="#C1570D" strokeWidth="1.8" style={{ width: 16, height: 16, flexShrink: 0 }}>
                                  <path d="M4 10h16l-1 10H5L4 10z" />
                                  <path d="M8 10V7a4 4 0 018 0v3" />
                                </svg>
                                <span className="order-shop-name">{order.shop}</span>
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#999', fontFamily: 'var(--font-sans)', paddingLeft: '24px' }}>
                                Order #{shortId}
                                <span style={{ margin: '0 6px', color: '#ccc' }}>|</span>
                                Placed on {placedDate}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: s.color, letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'var(--font-sans)' }}>
                                {s.label}
                              </span>
                              <div
                                style={{
                                  width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.25s ease',
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M6 9l6 6 6-6" />
                                </svg>
                              </div>
                            </div>
                          </div>

                          {/* ── Product Items ── */}
                          {order.items.map((item, idx) => (
                            <div className="order-product-row" key={idx}>
                              <img src={item.image} alt={item.productName} className="order-product-img" />
                              <div className="order-product-info">
                                <h5 style={{ fontFamily: 'var(--font-sans)' }}>{item.productName}</h5>
                                {(item.dimensions || item.variation) && <p style={{ fontFamily: 'var(--font-sans)', color: '#888', fontSize: '0.78rem' }}>{displayVariation(item.dimensions || item.variation || '')}</p>}
                                <p style={{ fontFamily: 'var(--font-sans)', color: '#888', fontSize: '0.78rem' }}>Qty: {item.qty}</p>
                              </div>
                              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#C1570D', flexShrink: 0, fontFamily: 'var(--font-sans)', textAlign: 'right' }}>
                                {'\u20B1'}{(item.price * item.qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </div>
                            </div>
                          ))}

                          {/* ── Footer: Total + Actions ── */}
                          <div className="order-card-footer">
                            <div style={{ flex: 1 }}>
                              <div className="order-total" style={{ fontFamily: 'var(--font-sans)', textAlign: 'right', marginBottom: '10px' }}>
                                Order Total: <span style={{ color: '#C1570D', fontWeight: 700, fontSize: '1.05rem' }}>{'\u20B1'}{order.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                                <button className="order-action-btn" onClick={e => { e.stopPropagation(); navigate('/chat'); }}>Contact Seller</button>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {isToPay && (
                                    <>
                                      <button className="order-action-btn order-action-btn--filled" onClick={e => { e.stopPropagation(); handlePayNow(order); }}>Pay Now</button>
                                      <button className="order-action-btn" style={{ color: '#DC2626', borderColor: '#FECACA' }} onClick={e => { e.stopPropagation(); handleCancelOrder(order.id); }}>Cancel</button>
                                    </>
                                  )}
                                  {isToReceive && (
                                    <button className="order-action-btn order-action-btn--filled" onClick={e => { e.stopPropagation(); setConfirmOrderId(order.id); }}>Order Received</button>
                                  )}
                                  {isToReceive && (
                                    <button className="order-action-btn" onClick={e => { e.stopPropagation(); navigate('/chat'); }}>Return/Refund</button>
                                  )}
                                  {isCompleted && order.items.map((item, idx) => {
                                    const hasReview = userReviews[item.productId];
                                    return hasReview ? (
                                      <button key={idx} className="order-action-btn order-action-btn--filled" onClick={e => { e.stopPropagation(); handleEditReview(order, idx); }}>Edit Review</button>
                                    ) : (
                                      <button key={idx} className="order-action-btn order-action-btn--filled" onClick={e => { e.stopPropagation(); setRateOrder(order); setRateItemIndex(idx); setRateSubmitted(false); }}>Rate</button>
                                    );
                                  })}
                                  {isCompleted && (
                                    <button className="order-action-btn" onClick={e => { e.stopPropagation(); navigate('/gallery'); }}>Buy Again</button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* ── Expanded Tracking Section ── */}
                          <div style={{
                            maxHeight: isExpanded ? '1200px' : '0',
                            opacity: isExpanded ? 1 : 0,
                            overflow: 'hidden',
                            transition: 'max-height 0.45s ease, opacity 0.3s ease',
                          }}>
                            <div style={{ borderTop: '1px solid #E8E0D8', marginTop: '14px', paddingTop: '20px' }} onClick={e => e.stopPropagation()}>

                              {/* ── Status Banner ── */}
                              {(() => {
                                const bannerCfg = isCancelled
                                  ? { bg: '#FEF2F2', border: '#FECACA', iconBg: '#DC2626', color: '#DC2626', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>, label: 'Order Cancelled', sub: 'This order has been cancelled.' }
                                  : isToPay
                                  ? { bg: '#FFFBEB', border: '#FDE68A', iconBg: '#D97706', color: '#D97706', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>, label: 'Awaiting Payment', sub: 'Please complete your payment to proceed.' }
                                  : isToShip && isPreparing
                                  ? { bg: '#EFF6FF', border: '#BFDBFE', iconBg: '#2563EB', color: '#2563EB', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: 'Seller Is Preparing Your Order', sub: 'Your pottery is being carefully crafted and packaged.' }
                                  : isToShip
                                  ? { bg: '#F0FDF4', border: '#BBF7D0', iconBg: '#16A34A', color: '#16A34A', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>, label: 'Order Confirmed', sub: 'Your order has been confirmed by the seller.' }
                                  : isToReceive
                                  ? { bg: '#F5F3FF', border: '#DDD6FE', iconBg: '#7C3AED', color: '#7C3AED', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="15" height="13" rx="2"/><path d="M17 11h3l2 2v5h-5v-7z"/><circle cx="6.5" cy="20" r="1.5"/><circle cx="19" cy="20" r="1.5"/></svg>, label: 'Your Order Is On Its Way!', sub: 'Your package has been shipped and is in transit.' }
                                  : isCompleted
                                  ? { bg: '#FFF7F0', border: '#FDBA74', iconBg: '#C1570D', color: '#C1570D', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>, label: 'Order Completed', sub: 'Thank you for your purchase! We hope you love it.' }
                                  : isReturn
                                  ? { bg: '#FFF1F2', border: '#FECDD3', iconBg: '#E11D48', color: '#E11D48', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>, label: 'Return / Refund In Progress', sub: 'We are processing your return request.' }
                                  : { bg: '#FFF7F0', border: '#F5D9C0', iconBg: '#C1570D', color: '#C1570D', icon: null, label: s.label, sub: '' };
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', padding: '14px 16px', background: bannerCfg.bg, border: `1px solid ${bannerCfg.border}`, borderRadius: '12px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: bannerCfg.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 2px 8px ${bannerCfg.iconBg}44` }}>
                                      {bannerCfg.icon}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: bannerCfg.color, fontFamily: 'var(--font-sans)', lineHeight: 1.3 }}>{bannerCfg.label}</div>
                                      {bannerCfg.sub && <div style={{ fontSize: '0.75rem', color: '#888', fontFamily: 'var(--font-sans)', marginTop: '2px', lineHeight: 1.4 }}>{bannerCfg.sub}</div>}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#999', fontFamily: 'var(--font-sans)', flexShrink: 0, textAlign: 'right', lineHeight: 1.4 }}>
                                      <div>{new Date(order.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                      <div>{new Date(order.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* ── Vertical Timeline ── */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0', paddingLeft: '4px' }}>
                                {timelineSteps.map((step, i) => {
                                  const isLastStep = i === timelineSteps.length - 1;
                                  const isActiveStep = step.done && (isLastStep || !timelineSteps[i + 1]?.done);
                                  const isPendingStep = !step.done;
                                  return (
                                    <div key={i} style={{ display: 'flex', gap: '14px', position: 'relative' }}>
                                      {/* Connector line */}
                                      {!isLastStep && (
                                        <div style={{
                                          position: 'absolute',
                                          left: '15px',
                                          top: '30px',
                                          bottom: '0',
                                          width: '2px',
                                          background: step.done ? 'linear-gradient(to bottom, #C1570D, #E8A87C)' : '#E8E0D8',
                                          zIndex: 0,
                                        }} />
                                      )}
                                      {/* Node */}
                                      <div style={{ position: 'relative', zIndex: 1, flexShrink: 0, paddingTop: '2px' }}>
                                        <div style={{
                                          width: '30px', height: '30px', borderRadius: '50%',
                                          background: isPendingStep ? '#F5F0EB' : isActiveStep ? '#C1570D' : '#C1570D',
                                          border: isPendingStep ? '2px solid #E0D6CC' : 'none',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          boxShadow: isActiveStep ? '0 0 0 5px rgba(193,87,13,0.15), 0 2px 8px rgba(193,87,13,0.3)' : 'none',
                                          transition: 'all 0.25s ease',
                                        }}>
                                          {isPendingStep
                                            ? <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#D0C6BC' }} />
                                            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                          }
                                        </div>
                                      </div>
                                      {/* Content */}
                                      <div style={{ flex: 1, paddingBottom: isLastStep ? '0' : '18px', paddingTop: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                              fontSize: '0.84rem',
                                              fontWeight: isPendingStep ? 500 : 600,
                                              color: isPendingStep ? '#B0A89E' : isActiveStep ? '#C1570D' : '#333',
                                              fontFamily: 'var(--font-sans)',
                                              lineHeight: 1.3,
                                            }}>
                                              {step.title}
                                              {isActiveStep && (
                                                <span style={{ marginLeft: '8px', fontSize: '0.65rem', fontWeight: 700, color: '#C1570D', background: '#FFF0E6', padding: '2px 7px', borderRadius: '20px', letterSpacing: '0.3px', verticalAlign: 'middle' }}>CURRENT</span>
                                              )}
                                            </div>
                                            <div style={{
                                              fontSize: '0.75rem',
                                              color: isPendingStep ? '#C8BFB7' : '#888',
                                              fontFamily: 'var(--font-sans)',
                                              marginTop: '2px',
                                              lineHeight: 1.4,
                                            }}>
                                              {step.desc}
                                            </div>
                                          </div>
                                          {step.date && (
                                            <div style={{ fontSize: '0.68rem', color: '#BDB5AD', fontFamily: 'var(--font-sans)', flexShrink: 0, textAlign: 'right', lineHeight: 1.4, paddingTop: '2px' }}>
                                              {step.date.split(' \u2022 ').map((part, pi) => (
                                                <div key={pi}>{part}</div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      {confirmOrderId && (

        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={() => setConfirmOrderId(null)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '32px 36px', maxWidth: '480px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: '0.95rem', color: '#333', lineHeight: 1.7, marginBottom: '24px' }}>
              Check that you received all items in satisfactory condition before confirming receipt. Once you confirm, the order is completed and we will release the payment to seller.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setConfirmOrderId(null)}
                style={{ padding: '10px 24px', border: '1.5px solid #ccc', borderRadius: '8px', background: '#fff', color: '#666', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', letterSpacing: '0.5px' }}>
                NOT NOW
              </button>
              <button onClick={() => { markAsReceived(confirmOrderId); setConfirmOrderId(null); }}
                style={{ padding: '10px 24px', border: 'none', borderRadius: '8px', background: '#C1570D', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', letterSpacing: '0.5px' }}>
                CONFIRM
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Delete Notification Confirmation */}
      {confirmDeleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={() => setConfirmDeleteId(null)}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '32px 36px', maxWidth: '440px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#333', marginBottom: '12px' }}>Delete Notification</h3>
            <p style={{ fontSize: '0.92rem', color: '#666', lineHeight: 1.6, marginBottom: '24px' }}>Are you sure you want to delete this notification? This action cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setConfirmDeleteId(null)}
                style={{ padding: '10px 24px', border: '1.5px solid #ccc', borderRadius: '8px', background: '#fff', color: '#666', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                CANCEL
              </button>
              <button onClick={() => { deleteNotification(confirmDeleteId); setConfirmDeleteId(null); }}
                style={{ padding: '10px 24px', border: 'none', borderRadius: '8px', background: '#D32F2F', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
