import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Image, TouchableOpacity, Alert } from 'react-native';
import { Text, Button, Chip, Divider, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useCartStore } from '@/stores/cartStore';
import { COLORS, SPACING } from '@/constants';
import { fmt, mapSupabaseProduct } from '@/lib/utils';
import type { Product, ProductVariation } from '@/types';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);
  const [loading, setLoading] = useState(true);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    loadProduct();
  }, [id]);

  const loadProduct = async () => {
    const { data } = await supabase.from('products').select('*').eq('id', id).single();
    if (data) {
      setProduct(mapSupabaseProduct(data));
      const { data: varData } = await supabase
        .from('product_variations')
        .select('*')
        .eq('product_id', id)
        .order('sort_order');
      if (varData) setVariations(varData.map((v: any) => ({
        ...v,
        productId: v.product_id,
      })));
    }
    setLoading(false);
  };

  const handleAddToCart = () => {
    if (!product) return;
    const price = selectedVariation?.price || product.price;
    addItem({
      productId: product.id,
      productName: product.name,
      image: product.image,
      price,
      qty: 1,
      shopId: product.shopId,
      shopName: product.shopName,
      variationId: selectedVariation?.id,
      variation: selectedVariation?.dimensions,
    });
    Alert.alert('Added to Cart', `${product.name} has been added to your cart.`, [
      { text: 'OK' },
      { text: 'View Cart', onPress: () => router.push('/cart') },
    ]);
  };

  const handleBuyNow = () => {
    handleAddToCart();
    router.push('/cart');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Product not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {product.image ? (
        <Image source={{ uri: product.image }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholderImage]}>
          <Text style={styles.placeholderText}>No Image</Text>
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.price}>{fmt(product.price)}</Text>

        <View style={styles.ratingRow}>
          {product.ratingCount > 0 && (
            <Text style={styles.rating}>
              ★ {product.ratingAvg.toFixed(1)} ({product.ratingCount} reviews)
            </Text>
          )}
          <Text style={styles.views}>{product.views} views</Text>
        </View>

        <View style={styles.metaRow}>
          <Chip style={styles.chip}>{product.category}</Chip>
          <Chip style={styles.chip}>{product.materials}</Chip>
        </View>

        <Divider style={styles.divider} />

        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.description}>{product.description}</Text>

        {variations.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Size / Variation</Text>
            <View style={styles.variationContainer}>
              {variations.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  onPress={() => setSelectedVariation(v)}
                  style={[
                    styles.variationButton,
                    selectedVariation?.id === v.id && styles.variationSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.variationText,
                      selectedVariation?.id === v.id && styles.variationTextSelected,
                    ]}
                  >
                    {v.dimensions}
                    {v.price ? ` - ${fmt(v.price)}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Divider style={styles.divider} />

        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Materials</Text>
            <Text style={styles.detailValue}>{product.materials || 'N/A'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Dimensions</Text>
            <Text style={styles.detailValue}>{product.dimensions || 'N/A'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Height</Text>
            <Text style={styles.detailValue}>{product.height || 'N/A'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Technique</Text>
            <Text style={styles.detailValue}>{product.technique || 'N/A'}</Text>
          </View>
        </View>

        <View style={styles.shopRow}>
          <Text style={styles.shopLabel}>Sold by</Text>
          <TouchableOpacity onPress={() => router.push(`/shop/${product.shopId}`)}>
            <Text style={styles.shopName}>{product.shopName}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonRow}>
          <Button
            mode="outlined"
            onPress={handleAddToCart}
            style={styles.cartButton}
            buttonColor={COLORS.primary}
            textColor={COLORS.primary}
          >
            Add to Cart
          </Button>
          <Button
            mode="contained"
            onPress={handleBuyNow}
            style={styles.buyButton}
            buttonColor={COLORS.primary}
          >
            Buy Now
          </Button>
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
  image: {
    width: '100%',
    height: 300,
  },
  placeholderImage: {
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.textSecondary,
  },
  content: {
    padding: SPACING.lg,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: SPACING.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
    gap: SPACING.md,
  },
  rating: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  views: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  chip: {
    backgroundColor: COLORS.primaryLight,
  },
  divider: {
    marginVertical: SPACING.md,
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
  variationContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  variationButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  variationSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  variationText: {
    fontSize: 14,
    color: COLORS.text,
  },
  variationTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  detailItem: {
    width: '45%',
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  shopLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  shopName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    paddingBottom: SPACING.xl,
  },
  cartButton: {
    flex: 1,
  },
  buyButton: {
    flex: 1,
  },
});
