import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, ORDER_STATUS_LABELS } from '@/constants';
import { fmt, formatTime } from '@/lib/utils';
import type { Order } from '@/types';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrder();
  }, [id]);

  const loadOrder = async () => {
    const { data } = await supabase.from('orders').select('*').eq('id', id).single();
    if (data) {
      setOrder({
        id: data.id,
        customerId: data.customer_id,
        customerName: data.customer_name || '',
        items: data.items || [],
        total: data.total,
        status: data.status,
        shop: data.shop || '',
        date: data.created_at,
        checkoutSessionId: data.checkout_session_id,
        deliveryStatus: data.delivery_status || '',
        deliveryOption: data.delivery_option,
        deliveryAddress: data.delivery_address,
        createdAt: data.created_at,
      });
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Order not found</Text>
      </View>
    );
  }

  const statusInfo = ORDER_STATUS_LABELS[order.status] || ORDER_STATUS_LABELS['to-pay'];

  const statusSteps = ['to-pay', 'to-ship', 'to-receive', 'completed'];
  const currentStepIndex = statusSteps.indexOf(order.status);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.statusHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.label}
          </Text>
        </View>
        <Text style={styles.orderDate}>{formatTime(order.createdAt)}</Text>
      </View>

      <View style={styles.progressContainer}>
        {statusSteps.map((step, index) => (
          <View key={step} style={styles.progressStep}>
            <View
              style={[
                styles.progressDot,
                index <= currentStepIndex && styles.progressDotActive,
              ]}
            />
            <Text
              style={[
                styles.progressLabel,
                index <= currentStepIndex && styles.progressLabelActive,
              ]}
            >
              {ORDER_STATUS_LABELS[step]?.label || step}
            </Text>
            {index < statusSteps.length - 1 && (
              <View
                style={[
                  styles.progressLine,
                  index < currentStepIndex && styles.progressLineActive,
                ]}
              />
            )}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Items</Text>
        {order.items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.productName}</Text>
              {item.variation && (
                <Text style={styles.itemVariation}>{item.variation}</Text>
              )}
              <Text style={styles.itemShop}>{item.shop_name}</Text>
            </View>
            <View style={styles.itemRight}>
              <Text style={styles.itemQty}>x{item.qty}</Text>
              <Text style={styles.itemPrice}>{fmt(item.price * item.qty)}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delivery</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Method</Text>
          <Text style={styles.infoValue}>
            {order.deliveryOption === 'delivery' ? 'Lalamove Delivery' : 'Pickup'}
          </Text>
        </View>
        {order.deliveryAddress && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={styles.infoValue}>{order.deliveryAddress}</Text>
          </View>
        )}
        {order.deliveryStatus && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>{order.deliveryStatus}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment</Text>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{fmt(order.total)}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusHeader: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  orderDate: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.sm,
  },
  progressStep: {
    alignItems: 'center',
    flex: 1,
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.xs,
  },
  progressDotActive: {
    backgroundColor: COLORS.primary,
  },
  progressLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  progressLabelActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  progressLine: {
    position: 'absolute',
    top: 6,
    left: '55%',
    right: '-55%',
    height: 2,
    backgroundColor: COLORS.border,
  },
  progressLineActive: {
    backgroundColor: COLORS.primary,
  },
  section: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  itemVariation: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  itemShop: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemQty: {
    fontSize: 14,
    color: COLORS.text,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  infoLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
});
