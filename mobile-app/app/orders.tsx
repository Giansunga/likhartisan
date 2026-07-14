import { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Text, Chip, ActivityIndicator } from 'react-native-paper';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING, ORDER_STATUS_LABELS, ORDER_TABS } from '@/constants';
import { fmt, formatTime } from '@/lib/utils';
import type { Order, OrderStatus } from '@/types';

export default function OrdersScreen() {
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('all');

  const loadOrders = async () => {
    if (!user) return;
    let query = supabase
      .from('orders')
      .select('*')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    if (activeTab !== 'all') {
      query = query.eq('status', activeTab);
    }

    const { data } = await query;
    if (data) {
      setOrders(
        data.map((o: any) => ({
          id: o.id,
          customerId: o.customer_id,
          customerName: o.customer_name || '',
          items: o.items || [],
          total: o.total,
          status: o.status,
          shop: o.shop || '',
          date: o.created_at,
          checkoutSessionId: o.checkout_session_id,
          deliveryStatus: o.delivery_status || '',
          deliveryOption: o.delivery_option,
          deliveryAddress: o.delivery_address,
          createdAt: o.created_at,
        }))
      );
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    setLoading(true);
    loadOrders();
  }, [activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const statusInfo = ORDER_STATUS_LABELS[item.status] || ORDER_STATUS_LABELS['to-pay'];
    return (
      <Link href={`/order/${item.id}`} asChild>
        <TouchableOpacity style={styles.orderCard}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderShop} numberOfLines={1}>
              {item.shop}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
              <Text style={[styles.statusText, { color: statusInfo.color }]}>
                {statusInfo.label}
              </Text>
            </View>
          </View>
          <Text style={styles.orderDate}>{formatTime(item.createdAt)}</Text>
          <View style={styles.orderItems}>
            {item.items.slice(0, 2).map((itm, idx) => (
              <Text key={idx} style={styles.orderItemName} numberOfLines={1}>
                {itm.productName} x{itm.qty}
              </Text>
            ))}
            {item.items.length > 2 && (
              <Text style={styles.orderMore}>+{item.items.length - 2} more</Text>
            )}
          </View>
          <View style={styles.orderFooter}>
            <Text style={styles.orderTotal}>{fmt(item.total)}</Text>
            <Text style={styles.orderItemsCount}>{item.items.length} item(s)</Text>
          </View>
        </TouchableOpacity>
      </Link>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabsContainer}>
        <FlatList
          data={ORDER_TABS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.tabsList}
          renderItem={({ item }) => (
            <Chip
              selected={activeTab === item.key}
              onPress={() => setActiveTab(item.key)}
              style={[
                styles.tab,
                activeTab === item.key && styles.tabSelected,
              ]}
              textStyle={[
                styles.tabText,
                activeTab === item.key && styles.tabTextSelected,
              ]}
            >
              {item.label}
            </Chip>
          )}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No orders found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  tabsContainer: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabsList: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  tab: {
    marginRight: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  tabSelected: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    color: COLORS.text,
  },
  tabTextSelected: {
    color: COLORS.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: SPACING.md,
  },
  orderCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderShop: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  orderItems: {
    marginTop: SPACING.sm,
  },
  orderItemName: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 2,
  },
  orderMore: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  orderItemsCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
});
