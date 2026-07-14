import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Image, FlatList, TouchableOpacity } from 'react-native';
import { Text, Button, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { COLORS, SPACING } from '@/constants';
import { fmt, mapSupabaseProduct } from '@/lib/utils';
import type { Shop, Product } from '@/types';

export default function ShopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [shop, setShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    loadShop();
  }, [id]);

  const loadShop = async () => {
    const { data } = await supabase.from('shops').select('*').eq('id', id).single();
    if (data) setShop(data);

    const { data: prodData } = await supabase
      .from('products')
      .select('*')
      .eq('shop_id', id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    if (prodData) setProducts(prodData.map(mapSupabaseProduct));

    if (user) {
      const { data: followData } = await supabase
        .from('shop_followers')
        .select('*')
        .eq('shop_id', id)
        .eq('user_id', user.id)
        .single();
      setFollowing(!!followData);
    }
    setLoading(false);
  };

  const toggleFollow = async () => {
    if (!user) return;
    if (following) {
      await supabase
        .from('shop_followers')
        .delete()
        .eq('shop_id', id)
        .eq('user_id', user.id);
    } else {
      await supabase
        .from('shop_followers')
        .insert({ shop_id: id, user_id: user.id });
    }
    setFollowing(!following);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Shop not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {shop.banner ? (
        <Image source={{ uri: shop.banner }} style={styles.banner} />
      ) : (
        <View style={[styles.banner, styles.placeholderBanner]} />
      )}

      <View style={styles.header}>
        <View style={styles.shopInfoRow}>
          {shop.image ? (
            <Image source={{ uri: shop.image }} style={styles.shopImage} />
          ) : (
            <View style={[styles.shopImage, styles.placeholderImage]}>
              <Text style={styles.placeholderText}>{shop.name.charAt(0)}</Text>
            </View>
          )}
          <View style={styles.shopInfo}>
            <Text style={styles.shopName}>{shop.name}</Text>
            <Text style={styles.shopOwner}>by {shop.ownerName}</Text>
          </View>
        </View>

        <View style={styles.buttonRow}>
          <Button
            mode={following ? 'outlined' : 'contained'}
            onPress={toggleFollow}
            style={styles.followButton}
            buttonColor={COLORS.primary}
          >
            {following ? 'Following' : 'Follow'}
          </Button>
          <Button
            mode="outlined"
            onPress={() => router.push(`/chat?shopId=${id}`)}
            style={styles.messageButton}
          >
            Message
          </Button>
        </View>
      </View>

      {shop.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.description}>{shop.description}</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Products ({products.length})</Text>
        <FlatList
          data={products}
          numColumns={2}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={styles.productList}
          columnWrapperStyle={styles.productRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.productCard}
              onPress={() => router.push(`/product/${item.id}`)}
            >
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.productImage} />
              ) : (
                <View style={[styles.productImage, styles.placeholderProduct]}>
                  <Text style={styles.placeholderText}>No Image</Text>
                </View>
              )}
              <View style={styles.productInfo}>
                <Text style={styles.productName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.productPrice}>{fmt(item.price)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No products yet</Text>
          }
        />
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
  banner: {
    width: '100%',
    height: 150,
  },
  placeholderBanner: {
    backgroundColor: COLORS.primaryLight,
  },
  header: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  shopInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shopImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  placeholderImage: {
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: 'bold',
  },
  shopInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  shopName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  shopOwner: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  followButton: {
    flex: 1,
  },
  messageButton: {
    flex: 1,
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
    marginBottom: SPACING.sm,
  },
  description: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  productList: {
    padding: 0,
  },
  productRow: {
    justifyContent: 'space-between',
  },
  productCard: {
    width: '48%',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: 120,
  },
  placeholderProduct: {
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: {
    padding: SPACING.sm,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    padding: SPACING.lg,
  },
});
