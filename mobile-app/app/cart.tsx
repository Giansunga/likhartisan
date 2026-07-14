import { View, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { Text, Button, IconButton, Divider } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '@/stores/cartStore';
import { COLORS, SPACING } from '@/constants';
import { fmt } from '@/lib/utils';
import type { CartItem } from '@/types';

export default function CartScreen() {
  const { items, removeItem, updateQuantity, getTotal, clearCart } = useCartStore();

  const renderCartItem = ({ item }: { item: CartItem }) => (
    <View style={styles.cartItem}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.itemImage} />
      ) : (
        <View style={[styles.itemImage, styles.placeholderImage]}>
          <Text style={styles.placeholderText}>No Image</Text>
        </View>
      )}
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.productName}
        </Text>
        {item.variation && (
          <Text style={styles.itemVariation}>{item.variation}</Text>
        )}
        <Text style={styles.itemShop}>{item.shopName}</Text>
        <View style={styles.itemBottom}>
          <Text style={styles.itemPrice}>{fmt(item.price * item.qty)}</Text>
          <View style={styles.quantityRow}>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => updateQuantity(item.productId, item.qty - 1, item.variationId)}
            >
              <Ionicons name="remove" size={18} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{item.qty}</Text>
            <TouchableOpacity
              style={styles.quantityButton}
              onPress={() => updateQuantity(item.productId, item.qty + 1, item.variationId)}
            >
              <Ionicons name="add" size={18} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <IconButton
        icon="trash-outline"
        size={20}
        onPress={() => removeItem(item.productId, item.variationId)}
        iconColor={COLORS.error}
      />
    </View>
  );

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={64} color={COLORS.textSecondary} />
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptyText}>Browse our gallery to find beautiful pottery</Text>
        <Button
          mode="contained"
          onPress={() => router.push('/(tabs)/gallery')}
          style={styles.emptyButton}
          buttonColor={COLORS.primary}
        >
          Browse Gallery
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => `${item.productId}-${item.variationId || ''}`}
        renderItem={renderCartItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <Divider />}
      />

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal ({items.length} items)</Text>
          <Text style={styles.summaryValue}>{fmt(getTotal())}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Shipping</Text>
          <Text style={styles.summaryValue}>Calculated at checkout</Text>
        </View>
        <Divider style={styles.divider} />
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{fmt(getTotal())}</Text>
        </View>

        <View style={styles.buttonRow}>
          <Button
            mode="outlined"
            onPress={clearCart}
            style={styles.clearButton}
            textColor={COLORS.error}
          >
            Clear Cart
          </Button>
          <Button
            mode="contained"
            onPress={() => router.push('/checkout')}
            style={styles.checkoutButton}
            buttonColor={COLORS.primary}
          >
            Proceed to Checkout
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SPACING.md,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: SPACING.lg,
  },
  list: {
    padding: SPACING.md,
  },
  cartItem: {
    flexDirection: 'row',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  itemImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  placeholderImage: {
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.textSecondary,
    fontSize: 10,
  },
  itemInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  itemVariation: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  itemShop: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  itemBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
  },
  summary: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: COLORS.text,
  },
  divider: {
    marginVertical: SPACING.sm,
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
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  clearButton: {
    flex: 1,
    borderColor: COLORS.error,
  },
  checkoutButton: {
    flex: 2,
  },
});
