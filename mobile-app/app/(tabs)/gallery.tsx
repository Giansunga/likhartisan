import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, RefreshControl } from 'react-native';
import { Text, Searchbar, Chip, ActivityIndicator } from 'react-native-paper';
import { Link, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, CATEGORIES } from '@/constants';
import { fmt, mapSupabaseProduct } from '@/lib/utils';
import type { Product } from '@/types';

const PAGE_SIZE = 24;

export default function GalleryScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(params.category || 'All');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadProducts = useCallback(async (pageNum: number, append = false) => {
    let query = supabase
      .from('products')
      .select('*')
      .eq('status', 'active');

    if (selectedCategory !== 'All') {
      query = query.eq('category', selectedCategory);
    }
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const from = (pageNum - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (data) {
      const mapped = data.map(mapSupabaseProduct);
      setProducts((prev) => (append ? [...prev, ...mapped] : mapped));
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
    setRefreshing(false);
  }, [selectedCategory, search]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    loadProducts(1);
  }, [selectedCategory, search, loadProducts]);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    loadProducts(1);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadProducts(nextPage, true);
    }
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <Link href={`/product/${item.id}`} asChild>
      <TouchableOpacity style={styles.productCard}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.productImage} />
        ) : (
          <View style={[styles.productImage, styles.placeholderImage]}>
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.productPrice}>{fmt(item.price)}</Text>
          <Text style={styles.productShop} numberOfLines={1}>
            {item.shopName}
          </Text>
          {item.ratingCount > 0 && (
            <Text style={styles.productRating}>
              ★ {item.ratingAvg.toFixed(1)} ({item.ratingCount})
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </Link>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search pottery..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchBar}
        />
      </View>

      <View style={styles.categoriesContainer}>
        <FlatList
          data={CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <Chip
              selected={selectedCategory === item}
              onPress={() => setSelectedCategory(item)}
              style={[
                styles.chip,
                selectedCategory === item && styles.chipSelected,
              ]}
              textStyle={[
                styles.chipText,
                selectedCategory === item && styles.chipTextSelected,
              ]}
            >
              {item}
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
          data={products}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={renderProduct}
          contentContainerStyle={styles.productList}
          columnWrapperStyle={styles.productRow}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No products found</Text>
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
  categoriesContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  chip: {
    marginRight: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
  },
  chipText: {
    color: COLORS.text,
  },
  chipTextSelected: {
    color: COLORS.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productList: {
    padding: SPACING.sm,
  },
  productRow: {
    justifyContent: 'space-between',
  },
  productCard: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: 140,
  },
  placeholderImage: {
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  productInfo: {
    padding: SPACING.sm,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  productShop: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  productRating: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
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
