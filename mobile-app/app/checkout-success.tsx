import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '@/constants';

export default function CheckoutSuccessScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
      </View>
      <Text style={styles.title}>Order Placed!</Text>
      <Text style={styles.message}>
        Thank you for your order. You will receive a confirmation shortly.
      </Text>
      <View style={styles.buttonRow}>
        <Button
          mode="contained"
          onPress={() => router.push('/orders')}
          style={styles.button}
          buttonColor={COLORS.primary}
        >
          View Orders
        </Button>
        <Button
          mode="outlined"
          onPress={() => router.push('/(tabs)')}
          style={styles.button}
        >
          Continue Shopping
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  iconContainer: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  message: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
  buttonRow: {
    gap: SPACING.sm,
    width: '100%',
  },
  button: {
    paddingVertical: SPACING.xs,
  },
});
