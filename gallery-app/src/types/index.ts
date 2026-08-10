export interface Shop {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  email: string;
  description: string;
  about: string;
  image: string;
  banner: string;
  location: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  role: 'buyer' | 'artisan';
  shopId?: string;
}

export interface ProductVariation {
  id: string;
  productId: string;
  dimensions: string;
  height: string;
  openingDiameter: string;
  price?: number;
  stock: number;
  sortOrder: number;
}

export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  title?: string;
  body: string;
  images: string[];
  sellerServiceRating?: number;
  deliveryServiceRating?: number;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  inStock: boolean;
  image: string;
  model3d?: string;
  materials: string;
  dimensions: string;
  height: string;
  openingDiameter: string;
  technique: string;
  shopId: string;
  shopName: string;
  status: 'active' | 'archived' | 'draft';
  views: number;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  qty: number;
  price: number;
  image?: string;
  shop_id?: string;
  shop_name?: string;
  variation_id?: string;
  variation?: string;
}

export interface Order {
  id: string;
  design_request_id?: string;
  user_id?: string;
  user_name: string;
  user_phone?: string;
  user_address?: string;
  email?: string;
  buyer_email?: string;
  items: OrderItem[];
  subtotal: number;
  shipping_fee: number;
  total: number;
  delivery_option?: string;
  delivery_status: string;
  status: string;
  payment_reference?: string;
  checkout_session_id?: string;
  payment_status?: string;
  payment_proof_url?: string;
  payment_verified_at?: string;
  payment_verified_by?: string;
  lalamove_quote_id?: string;
  delivery_provider?: string;
  tracking_number?: string;
  estimated_delivery?: string;
  delivery_notes?: string;
  customer_notes?: string;
  seller_notes?: string;
  order_type?: string;
  cancel_reason?: string;
  cancelled_by?: string;
  cancellation_approved?: boolean;
  cancellation_reviewed_by?: string;
  refund_status?: string;
  refund_amount?: number;
  is_problematic?: boolean;
  problem_type?: string;
  problem_notes?: string;
  problem_resolution?: string;
  flagged_for_investigation?: boolean;
  created_at: string;
}

export interface OrderActivityLog {
  id: string;
  order_id: string;
  previous_status?: string;
  new_status?: string;
  previous_payment_status?: string;
  new_payment_status?: string;
  previous_delivery_status?: string;
  new_delivery_status?: string;
  action_type: string;
  actor_id?: string;
  actor_name?: string;
  actor_role?: string;
  reason?: string;
  created_at: string;
}

export interface CartItem {
  productId: string;
  productName: string;
  image: string;
  price: number;
  qty: number;
  shopId?: string;
  shopName: string;
  variationId?: string;
  variation?: string;
}

export interface Conversation {
  id: string;
  buyerId: string;
  shopId: string;
  shopName: string;
  shopImage: string;
  shopAbout: string;
  lastMessage: string;
  lastMessageAt: string;
  buyerUnread: number;
  artisanUnread: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  imageUrl?: string;
  createdAt: string;
}
