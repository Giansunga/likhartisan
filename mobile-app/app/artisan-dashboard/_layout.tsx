import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Card, ActivityIndicator } from 'react-native-paper';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING } from '@/constants';
import { fmt } from '@/lib/utils';

export default function ArtisanDashboardScreen() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingOrders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    if (!user) return;

    const { data: shop } = await supabase
      .from('shops')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (shop) {
      const { data: products } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('shop_id', shop.id);

      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('shop_id', shop.id);

      if (orders) {
        const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
        const pendingOrders = orders.filter((o: any) => o.status === 'to-ship').length;
        setStats({
          totalProducts: products?.length || 0,
          totalOrders: orders.length,
          totalRevenue,
          pendingOrders,
        });
      }
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadStats();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadStats();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Artisan Dashboard</Text>
        <Text style={styles.subtitle}>Welcome back, {user?.name}</Text>
      </View>

      <View style={styles.statsGrid}>
        <Card style={styles.statCard}>
          <Card.Content>
            <Text style={styles.statValue}>{stats.totalProducts}</Text>
            <Text style={styles.statLabel}>Products</Text>
          </Card.Content>
        </Card>
        <Card style={styles.statCard}>
          <Card.Content>
            <Text style={styles.statValue}>{stats.totalOrders}</Text>
            <Text style={styles.statLabel}>Total Orders</Text>
          </Card.Content>
        </Card>
        <Card style={styles.statCard}>
          <Card.Content>
            <Text style={styles.statValue}>{fmt(stats.totalRevenue)}</Text>
            <Text style={styles.statLabel}>Revenue</Text>
          </Card.Content>
        </Card>
        <Card style={styles.statCard}>
          <Card.Content>
            <Text style={[styles.statValue, { color: COLORS.primary }]}>
              {stats.pendingOrders}
            </Text>
            <Text style={styles.statLabel}>Pending Orders</Text>
          </Card.Content>
        </Card>
      </View>

      <View style={styles.quickActions}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <Card style={styles.actionCard} onPress={() => router.push('/artisan-dashboard/listings')}>
          <Card.Content style={styles.actionContent}>
            <Text style={styles.actionTitle}>Manage Listings</Text>
            <Text style={styles.actionDescription}>Add, edit, or archive products</Text>
          </Card.Content>
        </Card>
        <Card style={styles.actionCard} onPress={() => router.push('/artisan-dashboard/orders')}>
          <Card.Content style={styles.actionContent}>
            <Text style={styles.actionTitle}>View Orders</Text>
            <Text style={styles.actionDescription}>Process and update order status</Text>
          </Card.Content>
        </Card>
        <Card style={styles.actionCard} onPress={() => router.push('/artisan-dashboard/messages')}>
          <Card.Content style={styles.actionContent}>
            <Text style={styles.actionTitle}>Messages</Text>
            <Text style={styles.actionDescription}>Chat with your buyers</Text>
          </Card.Content>
        </Card>
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
  header: {
    padding: SPACING.lg,
    backgroundColor: COLORS.primary,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.white,
    opacity: 0.9,
    marginTop: SPACING.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: SPACING.sm,
    gap: SPACING.sm,
  },
  statCard: {
    width: '47%',
    backgroundColor: COLORS.surface,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  quickActions: {
    padding: SPACING.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  actionCard: {
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.sm,
  },
  actionContent: {
    padding: SPACING.md,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  actionDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
});
