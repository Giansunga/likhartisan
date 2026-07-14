import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, DefaultTheme } from 'react-native-paper';
import { useAuthStore } from '@/stores/authStore';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { COLORS } from '@/constants';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: COLORS.primary,
    secondary: COLORS.secondary,
    background: COLORS.background,
    surface: COLORS.surface,
  },
};

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  usePushNotifications();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <PaperProvider theme={theme}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="product/[id]" options={{ headerShown: true, title: 'Product' }} />
        <Stack.Screen name="shop/[id]" options={{ headerShown: true, title: 'Shop' }} />
        <Stack.Screen name="cart" options={{ headerShown: true, title: 'Cart' }} />
        <Stack.Screen name="checkout" options={{ headerShown: true, title: 'Checkout' }} />
        <Stack.Screen name="checkout-success" options={{ headerShown: false }} />
        <Stack.Screen name="orders" options={{ headerShown: true, title: 'My Orders' }} />
        <Stack.Screen name="order/[id]" options={{ headerShown: true, title: 'Order Details' }} />
        <Stack.Screen name="chat" options={{ headerShown: true, title: 'Messages' }} />
        <Stack.Screen name="chatbot" options={{ headerShown: true, title: 'LikhAI Assistant' }} />
        <Stack.Screen name="artisan-dashboard" options={{ headerShown: false }} />
      </Stack>
    </PaperProvider>
  );
}
