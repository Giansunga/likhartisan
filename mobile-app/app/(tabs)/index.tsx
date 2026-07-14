import { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, FlatList, TouchableOpacity, Image } from 'react-native';
import { Text, Card, Searchbar, Chip } from 'react-native-paper';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, SPACING, CATEGORIES } from '@/constants';
import { fmt, mapSupabaseProduct } from '@/lib/utils';
import type { Product } from '@/types';

export default function HomeScreen() {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeatured();
  }, []);

  const loadFeatured = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setFeatured(data.map(mapSupabaseProduct));
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.greeting}>LikhArtisan</Text>
        <Text style={styles.tagline}>Handcrafted Filipino Pottery</Text>
      </View>

      <View style={styles.searchContainer}>
        <Link href="/(tabs)/gallery" asChild>
          <TouchableOpacity>
            <Searchbar
              placeholder="Search pottery..."
              value=""
              editable={false}
              style={styles.searchBar}
            />
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.categoriesContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {CATEGORIES.map((cat) => (
            <Link key={cat} href={`/(tabs)/gallery?category=${cat}`} asChild>
              <TouchableOpacity>
                <Chip style={styles.chip} textStyle={styles.chipText}>
                  {cat}
                </Chip>
              </TouchableOpacity>
            </Link>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Featured Pottery</Text>
        {loading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : (
          <FlatList
            data={featured}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.featuredList}
            renderItem={({ item }) => (
              <Link href={`/product/${item.id}`} asChild>
                <TouchableOpacity>
                  <Card style={styles.featuredCard}>
                    {item.image ? (
                      <Image source={{ uri: item.image }} style={styles.featuredImage} />
                    ) : (
                      <View style={[styles.featuredImage, styles.placeholderImage]}>
                        <Text style={styles.placeholderText}>No Image</Text>
                      </View>
                    )}
                    <Card.Content style={styles.featuredContent}>
                      <Text style={styles.productName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.productPrice}>{fmt(item.price)}</Text>
                      <Text style={styles.productShop} numberOfLines={1}>
                        {item.shopName}
                      </Text>
                    </Card.Content>
                  </Card>
                </TouchableOpacity>
              </Link>
            )}
          />
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Browse by Category</Text>
        </View>
        <View style={styles.categoryGrid}>
          {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
            <Link key={cat} href={`/(tabs)/gallery?category=${cat}`} asChild>
              <TouchableOpacity style={styles.categoryCard}>
                <Text style={styles.categoryName}>{cat}</Text>
              </TouchableOpacity>
            </Link>
          ))}
        </View>
      </View>

      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>Design Your Own Pottery</Text>
        <Text style={styles.ctaText}>
          Use our 3D Freeform Designer to create custom pottery pieces.
        </Text>
      </View>

      <View style={styles.footer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
    backgroundColor: COLORS.primary,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  tagline: {
    fontSize: 14,
    color: COLORS.white,
    opacity: 0.9,
    marginTop: SPACING.xs,
  },
  searchContainer: {
    padding: SPACING.md,
    marginTop: -SPACING.md,
  },
  searchBar: {
    backgroundColor: COLORS.surface,
    elevation: 2,
  },
  categoriesContainer: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  chip: {
    marginRight: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  chipText: {
    color: COLORS.text,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  loadingText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    padding: SPACING.lg,
  },
  featuredList: {
    paddingHorizontal: SPACING.md,
  },
  featuredCard: {
    width: 160,
    marginRight: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  featuredImage: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
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
  featuredContent: {
    padding: SPACING.sm,
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  productShop: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  categoryCard: {
    width: '47%',
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderRadius: 8,
    alignItems: 'center',
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  ctaSection: {
    margin: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
  },
  ctaTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  ctaText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  footer: {
    height: SPACING.xl,
  },
});
