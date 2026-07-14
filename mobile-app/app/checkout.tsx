import { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, TextInput, Button, RadioButton, Divider } from 'react-native-paper';
import { router } from 'expo-router';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { apiPost } from '@/lib/api';
import { COLORS, SPACING } from '@/constants';
import { fmt } from '@/lib/utils';

export default function CheckoutScreen() {
  const { items, getTotal, clearCart } = useCartStore();
  const { user, session } = useAuthStore();
  const [deliveryOption, setDeliveryOption] = useState('pickup');
  const [address, setAddress] = useState(user?.address || '');
  const [loading, setLoading] = useState(false);

  const handlePlaceOrder = async () => {
    if (deliveryOption === 'delivery' && !address) {
      Alert.alert('Error', 'Please enter a delivery address');
      return;
    }
    setLoading(true);
    try {
      const checkoutData = {
        items: items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          price: item.price,
          qty: item.qty,
          variationId: item.variationId,
        })),
        total: getTotal(),
        deliveryOption,
        deliveryAddress: deliveryOption === 'delivery' ? address : undefined,
        buyerId: user?.id,
      };

      const result = await apiPost<{ checkoutUrl: string; sessionId: string }>(
        '/api/create-checkout',
        checkoutData
      );

      if (result.checkoutUrl) {
        clearCart();
        router.push('/checkout-success');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create checkout. Please try again.');
    }
    setLoading(false);
  };

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Your cart is empty</Text>
        <Button mode="contained" onPress={() => router.back()} buttonColor={COLORS.primary}>
          Go Back
        </Button>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order Summary</Text>
        {items.map((item, index) => (
          <View key={index} style={styles.orderItem}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.productName} x{item.qty}
            </Text>
            <Text style={styles.itemPrice}>{fmt(item.price * item.qty)}</Text>
          </View>
        ))}
        <Divider style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{fmt(getTotal())}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delivery Option</Text>
        <RadioButton.Group onValueChange={setDeliveryOption} value={deliveryOption}>
          <View style={styles.radioRow}>
            <RadioButton value="pickup" color={COLORS.primary} />
            <View style={styles.radioInfo}>
              <Text style={styles.radioLabel}>Pickup</Text>
              <Text style={styles.radioDescription}>Free - Pick up from shop</Text>
            </View>
          </View>
          <View style={styles.radioRow}>
            <RadioButton value="delivery" color={COLORS.primary} />
            <View style={styles.radioInfo}>
              <Text style={styles.radioLabel}>Delivery</Text>
              <Text style={styles.radioDescription}>Via Lalamove courier</Text>
            </View>
          </View>
        </RadioButton.Group>

        {deliveryOption === 'delivery' && (
          <TextInput
            label="Delivery Address"
            value={address}
            onChangeText={setAddress}
            mode="outlined"
            style={styles.input}
            multiline
            numberOfLines={3}
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment</Text>
        <Text style={styles.paymentInfo}>
          You will be redirected to PayMongo to complete payment via GCash, Maya, QR Ph, or Card.
        </Text>
      </View>

      <Button
        mode="contained"
        onPress={handlePlaceOrder}
        loading={loading}
        disabled={loading || items.length === 0}
        style={styles.placeOrderButton}
        buttonColor={COLORS.primary}
      >
        Place Order - {fmt(getTotal())}
      </Button>

      <View style={styles.footer} />
    </ScrollView>
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
    gap: SPACING.md,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  section: {
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  itemName: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  divider: {
    marginVertical: SPACING.sm,
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
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  radioInfo: {
    flex: 1,
  },
  radioLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  radioDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  input: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  paymentInfo: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  placeOrderButton: {
    margin: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  footer: {
    height: SPACING.xl,
  },
});
