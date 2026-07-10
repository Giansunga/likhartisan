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

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  items: { productId: string; productName: string; qty: number; price: number }[];
  total: number;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
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
