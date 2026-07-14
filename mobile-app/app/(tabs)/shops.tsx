import { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Text, Searchbar, ActivityIndicator } from 'react-native-paper';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING } from '@/constants';
import type { Shop } from '@/types';

export default function ShopsScreen() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const loadShops = async () => {
    let query = supabase.from('shops').select('*');
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    const { data } = await query.order('name');
    if (data) setShops(data);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadShops();
  }, [search]);

  const onRefresh = () => {
    setRefreshing(true);
    loadShops();
  };

  const renderShop = ({ item }: { item: Shop }) => (
    <Link href={`/shop/${item.id}`} asChild>
      <TouchableOpacity style={styles.shopCard}>
        <View style={styles.shopHeader}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.shopImage} />
          ) : (
            <View style={[styles.shopImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{item.name.charAt(0)}</Text>
            </View>
          )}
          <View style={styles.shopInfo}>
            <Text style={styles.shopName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.shopOwner} numberOfLines={1}>
              by {item.ownerName}
            </Text>
          </View>
        </View>
        {item.description ? (
          <Text style={styles.shopDescription} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
      </TouchableOpacity>
    </Link>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search shops..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchBar}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={shops}
          keyExtractor={(item) => item.id}
          renderItem={renderShop}
          contentContainerStyle={styles.shopList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No shops found</Text>
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
  searchContainer: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  searchBar: {
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopList: {
    padding: SPACING.md,
  },
  shopCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  shopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shopImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  placeholderImage: {
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: 'bold',
  },
  shopInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  shopName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  shopOwner: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  shopDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    lineHeight: 20,
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
