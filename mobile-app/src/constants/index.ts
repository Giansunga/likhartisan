export const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export const CATEGORIES = [
  'All',
  'Vases',
  'Planters',
  'Jars',
  'Amphoras',
  'Tea Light Vases',
] as const;

export type Category = typeof CATEGORIES[number];

export const ORDER_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'to-pay': { label: 'To Pay', color: '#C1570D', bg: '#FFF3E0' },
  'to-ship': { label: 'To Ship', color: '#823E0B', bg: '#FFF3E0' },
  'to-receive': { label: 'To Receive', color: '#C1570D', bg: '#FFF3E0' },
  'completed': { label: 'Completed', color: '#C1570D', bg: '#FFF3E0' },
  'return-refund': { label: 'Return Refund', color: '#C1570D', bg: '#FFF3E0' },
  'cancelled': { label: 'Cancelled', color: '#DC2626', bg: '#FEF2F2' },
};

export const ORDER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'to-pay', label: 'To Pay' },
  { key: 'to-ship', label: 'To Ship' },
  { key: 'to-receive', label: 'To Receive' },
  { key: 'completed', label: 'Completed' },
  { key: 'return-refund', label: 'Return Refund' },
] as const;

export const COLORS = {
  primary: '#C1570D',
  primaryLight: '#FFF3E0',
  secondary: '#823E0B',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#666666',
  border: '#E5E5E5',
  error: '#DC2626',
  success: '#16A34A',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
